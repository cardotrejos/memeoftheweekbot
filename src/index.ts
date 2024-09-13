import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import {
    CacheType,
    Client,
    CommandInteraction,
    Events,
    GatewayIntentBits,
    TextChannel,
} from 'discord.js';
import * as dotenv from 'dotenv';

dotenv.config();

dayjs.extend(isBetween);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('America/Bogota');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ],
});
const LAUGH_EMOJIS = [
    '🤣',
    '😂',
    '930549056466485298',
    '956966036354265180',  // :pepehardlaugh:
    '974777892418519081', // :doggokek:
    '954075635310035024', // :kekw:
    '956966037063106580', // :pepelaugh:
    '58a496c6d67a070ade5c', // :first_place:
];

const BONE_EMOJI = ['🦴'];

const SCRAP_MESSAGES_COMMAND = 'gettop';

client.login(process.env.DISCORD_BOT_TOKEN);

client.once('ready', () => {
    console.log('Bot is ready!');
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    try {
        if (commandName === SCRAP_MESSAGES_COMMAND) {
            await interaction.reply('Processing messages, please wait...');
            await processMessages(interaction);
        }
    } catch (error) {
        console.error(error);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply('There was an error while executing this command!');
        } else {
            await interaction.reply('There was an error while executing this command!');
        }
    }
});

interface MessageOptions {
    content: string;
    files?: string[];
}

async function processMessages(interaction: CommandInteraction) {
    // Since we've already replied, we don't need to defer the reply
    // Fetch the channel using the ID from your environment variables
    const channelId = process.env.MEME_CHANNEL_ID;
    if (!channelId) {
        await interaction.followUp('Channel ID is not set in the environment variables.');
        return;
    }
    const channel = client.channels.cache.get(channelId) as TextChannel;
    if (!channel) {
        await interaction.followUp('Channel not found.');
        return;
    }

    // Calculate date range from last Friday at 12 PM to today at 12 PM in Colombia time
    const now = dayjs().tz('America/Bogota');
    const lastFriday = getLastFridayAtNoon();
    const thisFriday = lastFriday.add(7, 'day');

    const endDate = now.isBefore(thisFriday) ? now : thisFriday;

    console.log(`Fetching messages from ${lastFriday.format()} to ${endDate.format()}`);

    const allMessages = await fetchMessagesInRange(channel, lastFriday, endDate);

    if (allMessages.length === 0) {
        await interaction.followUp('No messages found in the specified date range.');
        return;
    }

    // Process messages to count reactions
    const topMemes = getTopMessages(allMessages, LAUGH_EMOJIS);
    const topBones = getTopMessages(allMessages, BONE_EMOJI);

    // Announce winners
    await announceWinners(interaction, topMemes, 'meme');
    await announceWinners(interaction, topBones, 'bone');

    // Send a final follow-up message if needed
    await interaction.followUp('Ganadores anunciados!');
}

function getLastFridayAtNoon() {
    // Get the current date and time in Colombia time zone
    const now = dayjs().tz('America/Bogota');

    // Get last Friday at 12 PM
    let lastFriday = now.day(-2).hour(12).minute(0).second(0).millisecond(0);

    // If today is after last Friday at 12 PM, and before this Friday at 12 PM
    if (now.isBefore(lastFriday)) {
        // Subtract one week to get the previous Friday
        lastFriday = lastFriday.subtract(1, 'week');
    }

    return lastFriday;
}

async function fetchMessagesInRange(channel: TextChannel, startDate: string | number | Date | dayjs.Dayjs | null | undefined, endDate: string | number | Date | dayjs.Dayjs | null | undefined) {
    let messages = [];
    let lastMessageId: string | undefined;
    let hasMoreMessages = true;
    let iteration = 0;

    while (hasMoreMessages) {
        console.log(`Fetching messages, iteration ${iteration}`);
        const options: { limit: number; before?: string } = { limit: 100 };
        if (lastMessageId) options.before = lastMessageId;

        const fetchedMessages = await channel.messages.fetch(options);
        console.log(`Fetched ${fetchedMessages.size} messages`);

        if (fetchedMessages.size === 0) {
            hasMoreMessages = false;
            break;
        }

        const filteredMessages = fetchedMessages.filter((msg) => {
            const msgDate = dayjs(msg.createdAt);
            return msgDate.isBetween(startDate, endDate, null, '[)');
        });
        console.log(`Filtered ${filteredMessages.size} messages in date range`);

        messages.push(...filteredMessages.values());

        lastMessageId = fetchedMessages.last()?.id;

        // Stop if the oldest message is before the start date
        const oldestMessageDate = dayjs(fetchedMessages.last()?.createdAt);
        if (oldestMessageDate.isBefore(startDate)) {
            console.log('Oldest message is before start date, breaking loop');
            break;
        }

        iteration++;
    }

    console.log(`Total messages collected: ${messages.length}`);
    return messages;
}

function getTopMessages(messages: any[], reactionEmojis: string | any[]) {
    const messageReactionCounts = messages.map((message: { reactions: { cache: any[]; }; }) => {
        const count = message.reactions.cache.reduce((acc: number, reaction: { emoji: { name: any; id: any; }; count: number; }) => {
            if (
                reactionEmojis.includes(reaction.emoji.name) ||
                reactionEmojis.includes(reaction.emoji.id)
            ) {
                return acc + reaction.count;
            }
            return acc;
        }, 0);
        return { message, count };
    });

    // Filter out messages with zero reactions
    const messagesWithReactions = messageReactionCounts.filter((item: { count: number; }) => item.count > 0);

    // Sort messages by reaction count in descending order
    messagesWithReactions.sort((a: { count: number; }, b: { count: number; }) => b.count - a.count);

    // Get top 3 messages
    return messagesWithReactions.slice(0, 3);
}

async function announceWinners(
    interaction: CommandInteraction<CacheType>,
    winners: any[],
    contestType: string
) {
    if (winners.length === 0) {
        await interaction.followUp(`No winners found for ${contestType}.`);
        return;
    }

    const emoji = contestType === 'meme' ? '🎉' : '🦴';
    const contestName =
        contestType === 'meme' ? 'Meme de la semana' : 'Hueso de la semana';

    let messageContent = `${emoji} **Ganadores del "${contestName}"** ${emoji}\n\n`;
    const attachments: { attachment: string; name: string }[] = [];

    for (const [index, winnerData] of winners.entries()) {
        const { message, count } = winnerData;
        const winnerLink = message.url;
        const line = `**#${index + 1}** - Felicitaciones, ${message.author}! Tu post ha ganado con ${count} reacciones. [Ver mensaje](${winnerLink})`;
        messageContent += line + '\n';

        // Collect attachments
        const attachment = message.attachments.first();
        if (attachment) {
            attachments.push({ attachment: attachment.url, name: attachment.name });
        }
    }

    const messageOptions: MessageOptions = {
        content: messageContent,
    };

    await interaction.followUp(messageOptions);
}