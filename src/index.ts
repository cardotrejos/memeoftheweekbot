/* eslint-disable @typescript-eslint/typedef */
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import * as Discord from 'discord.js'
import * as dotenv from 'dotenv'
import { Effect } from 'effect'

dotenv.config()

dayjs.extend(isBetween)
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.tz.setDefault('America/Bogota')

const client = new Discord.Client({
  intents: [
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildMessages,
    Discord.GatewayIntentBits.MessageContent,
    Discord.GatewayIntentBits.GuildMessageReactions
  ]
})

const LAUGH_EMOJIS = [
  '🤣',
  '😂',
  '930549056466485298',
  '956966036354265180', // :pepehardlaugh:
  '974777892418519081', // :doggokek:
  '954075635310035024', // :kekw:
  '956966037063106580', // :pepelaugh:
  '58a496c6d67a070ade5c' // :first_place:
]

const BONE_EMOJI = ['🦴']

const SCRAP_MESSAGES_COMMAND = 'gettop'

// Discord Bot Login Effect
const loginEffect = Effect.sync(() => {
  client.login(process.env.DISCORD_BOT_TOKEN)
})

Effect.runPromise(loginEffect) // Run the login effect

client.once('ready', () => {
  console.log('Bot is ready!')
})

client.on(Discord.Events.InteractionCreate, interaction => {
  if (!interaction.isCommand()) return

  const { commandName } = interaction

  Effect.runPromise(
    Effect.try({
      try: () => {
        if (commandName === SCRAP_MESSAGES_COMMAND) {
          return interaction.reply('Processing messages, please wait...').then(() =>
            processMessages(interaction)
          )
        }
      },
      catch: (error: unknown) => {
        console.error(error)
        if (interaction.deferred || interaction.replied) {
          return interaction.editReply('There was an error while executing this command!')
        } else {
          return interaction.reply('There was an error while executing this command!')
        }
      }
    })
  )
})

interface MessageOptions {
  content: string
  files?: string[]
}

function processMessages(interaction: Discord.CommandInteraction): Promise<void> {
  const effect: Effect.Effect<void, unknown, void> = Effect.gen(function* ($) {
    const channelId = process.env.MEME_CHANNEL_ID

    if (!channelId) {
      yield* $(Effect.promise(() => interaction.followUp('Channel ID is not set in the environment variables.')))
      return
    }

    const channel = client.channels.cache.get(channelId) as Discord.TextChannel

    if (!channel) {
      yield* $(Effect.promise(() => interaction.followUp('Channel not found.')))
      return
    }

    const now = dayjs().tz('America/Bogota')
    const lastFriday = getLastFridayAtNoon()
    const thisFriday = lastFriday.add(7, 'day')
    const endDate = now.isBefore(thisFriday) ? now : thisFriday

    console.log(`Fetching messages from ${lastFriday.format()} to ${endDate.format()}`)

    const effect = fetchMessagesInRange(channel, lastFriday, endDate)
    const allMessages = yield* $(effect)

    if ((allMessages as Discord.Message[]).length === 0) {
      yield* $(Effect.promise(() => interaction.followUp('No messages found in the specified date range.')))
      return
    }

    const topMemes = getTopMessages(allMessages as Discord.Message[], LAUGH_EMOJIS)
    const topBones = getTopMessages(allMessages as Discord.Message[], BONE_EMOJI)

    yield* $(announceWinners(interaction, topMemes, 'meme'))
    yield* $(announceWinners(interaction, topBones, 'bone'))

    yield* $(Effect.promise(() => interaction.followUp('Ganadores anunciados!')))
    throw new Error('Process completed')
  })

  return Effect.runPromise(effect as Effect.Effect<void, unknown, never>) 
}

function getLastFridayAtNoon(): dayjs.Dayjs {
  const now = dayjs().tz('America/Bogota')
  let lastFriday = now.day(-2).hour(12).minute(0).second(0).millisecond(0)

  if (now.isBefore(lastFriday)) {
    lastFriday = lastFriday.subtract(1, 'week')
  }

  return lastFriday
}

function fetchMessagesInRange(
  channel: Discord.TextChannel,
  startDate: string | number | Date | dayjs.Dayjs | null | undefined,
  endDate: string | number | Date | dayjs.Dayjs | null | undefined
): Effect.Effect<unknown, unknown, Discord.Message[]> {
  return Effect.gen(function* ($) {
    let messages: Discord.Message[] = []
    let lastMessageId: string | undefined
    let hasMoreMessages = true
    let iteration = 0

    while (hasMoreMessages) {
      console.log(`Fetching messages, iteration ${iteration}`)
      const options: { limit: number; before?: string } = { limit: 100 }
      if (lastMessageId) options.before = lastMessageId

      const fetchedMessages = yield* $(Effect.promise(() => channel.messages.fetch(options)))
      console.log(`Fetched ${fetchedMessages.size} messages`)

      if (fetchedMessages.size === 0) {
        hasMoreMessages = false
        break
      }

      const filteredMessages = fetchedMessages.filter((msg) => {
        const msgDate = dayjs(msg.createdAt)
        return msgDate.isBetween(startDate, endDate, null, '[)')
      })
      console.log(`Filtered ${filteredMessages.size} messages in date range`)

      messages.push(...filteredMessages.values())
      lastMessageId = fetchedMessages.last()?.id

      const oldestMessageDate = dayjs(fetchedMessages.last()?.createdAt)
      if (oldestMessageDate.isBefore(startDate)) {
        console.log('Oldest message is before start date, breaking loop')
        break
      }

      iteration++
    }

    console.log(`Total messages collected: ${messages.length}`)
    return messages
  })
}

function getTopMessages(messages: any[], reactionEmojis: string | any[]): { message: any; count: number }[] {
  const messageReactionCounts = messages.map((message: { reactions: { cache: any[] } }) => {
    const count = message.reactions.cache.reduce(
      (acc: number, reaction: { emoji: { name: any; id: any }; count: number }) => {
        if (reactionEmojis.includes(reaction.emoji.name) || reactionEmojis.includes(reaction.emoji.id)) {
          return acc + reaction.count
        }
        return 0
      },
      0
    )
    return { message, count }
  })

  const messagesWithReactions = messageReactionCounts.filter((item) => item.count > 0)

  messagesWithReactions.sort((a, b) => b.count - a.count)

  return messagesWithReactions.slice(0, 3)
}

function announceWinners(
  interaction: Discord.CommandInteraction,
  winners: any[],
  contestType: string
): Effect.Effect<unknown, unknown, void> {
  return Effect.gen(function* ($) {
    if (winners.length === 0) {
      yield* $(Effect.promise(() => interaction.followUp(`No winners found for ${contestType}.`)))
      return
    }

    const emoji = contestType === 'meme' ? '🎉' : '🦴'
    const contestName = contestType === 'meme' ? 'Meme de la semana' : 'Hueso de la semana'

    let messageContent = `${emoji} **Ganadores del "${contestName}"** ${emoji}\n\n`
    const attachments: { attachment: string; name: string }[] = []

    for (const [index, winnerData] of winners.entries()) {
      const { message, count } = winnerData
      const winnerLink = message.url
      const line = `**#${index + 1}** - Felicitaciones, ${message.author}! Tu post ha ganado con ${count} reacciones. [Ver mensaje](${winnerLink})`
      messageContent += line + '\n'

      const attachment = message.attachments.first()
      if (attachment) {
        attachments.push({ attachment: attachment.url, name: attachment.name })
      }
    }

    const messageOptions: MessageOptions = { content: messageContent }
    yield* $(Effect.promise(() => interaction.followUp(messageOptions)))
  })
}