/* eslint-disable @typescript-eslint/explicit-function-return-type */
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import {
    CacheType,
    Client,
    CommandInteraction,
    Events,
    GatewayIntentBits,
    MessageReaction,
    PartialMessageReaction,
    PartialUser,
    TextChannel,
    User,
} from 'discord.js';
import * as dotenv from 'dotenv';

import {
    getCurrentContest,
    getLeaderboard,
    removeReaction,
    saveContest,
    saveReaction,
} from './database';

dotenv.config();

dayjs.extend(isBetween);
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
    ],
});
const LAUGH_EMOJIS = [
    '🤣',
    '😂',
    '974777892418519081',
    '956966036354265180',
    '954075635310035024',
    '930549056466485298',
];
const BONE_EMOJI = ['🦴'];

const START_CONTEST_COMMAND = 'startcontest';
const WINNER_COMMAND = 'winner';
const SCRAP_MESSAGES_COMMAND = 'gettop';

client.login(process.env.DISCORD_BOT_TOKEN);

class ContestManager {
    startContest(): void {
        const startDate = dayjs().toISOString();
        const endDate = dayjs().add(7, 'day').toISOString();
        saveContest(startDate, endDate);
    }

    async runningContest(): Promise<
        { id: number; startDate: string; endDate: string } | undefined
    > {
        const contest = await getCurrentContest();
        if (contest && dayjs().isBetween(contest.startDate, contest.endDate)) {
            return contest;
        }
        return undefined;
    }
}

const contestManager = new ContestManager();

client.once('ready', () => {
    console.log('Bot is ready!');
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    try {
        if (commandName === START_CONTEST_COMMAND) {
            contestManager.startContest();
            await interaction.reply('El concurso ha comenzado!');
        } else if (commandName === WINNER_COMMAND) {
            const winners = await getSortedLeaderboard(3, 'meme');
            const bones = await getSortedLeaderboard(3, 'bone');
            if (winners.length == 0 && bones.length == 0) {
                await interaction.reply('No winners found for this week.');
            } else {
                await interaction.reply('Ganadores anunciados!');
            }
            if (winners.length > 0) {
                await announceWinner(winners, 'meme');
            }
            if (bones.length > 0) {
                await announceWinner(bones, 'bone');
            }
        } else if (commandName === SCRAP_MESSAGES_COMMAND) {
            await interaction.reply('Processing messages, please wait...');
            await processMessages(interaction);
        }
    } catch (error) {
        console.error(error);
        await interaction.reply('There was an error while executing this command!');
    }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
    await handleSpecificMessageReaction(reaction, user, LAUGH_EMOJIS, 'meme');
    await handleSpecificMessageReaction(reaction, user, BONE_EMOJI, 'bone');
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
    await handleSpecificMessageReactionRemoved(reaction, user, LAUGH_EMOJIS, 'meme');
    await handleSpecificMessageReactionRemoved(reaction, user, BONE_EMOJI, 'bone');
});

async function handleSpecificMessageReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    availableReactions: Array<string>,
    type: string
): Promise<void> {
    if (user.bot) return;

    const runningContest = await contestManager.runningContest();
    if (
        reaction.message.channel.id === process.env.MEME_CHANNEL_ID &&
        reaction.message.channel instanceof TextChannel &&
        (availableReactions?.includes(reaction.emoji.name ?? '') ||
            availableReactions?.includes(reaction.emoji.id ?? '')) &&
        runningContest
    ) {
        saveReaction(reaction.message.id, user.id, type, runningContest.id);
    }
}

async function handleSpecificMessageReactionRemoved(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    availableReactions: Array<string>,
    type: string
): Promise<void> {
    if (user.bot) return;

    if (
        reaction.message.channel.id === process.env.MEME_CHANNEL_ID &&
        reaction.message.channel instanceof TextChannel &&
        (availableReactions?.includes(reaction.emoji.name ?? '') ||
            availableReactions?.includes(reaction.emoji.id ?? '')) &&
        (await contestManager.runningContest())
    ) {
        removeReaction(reaction.message.id, user.id, type);
    }
}

async function getSortedLeaderboard(
    top: number,
    type: string
): Promise<{ messageId: string; reactions: number }[]> {
    const runningContest = await contestManager.runningContest();

    if (runningContest) {
        const leaderboard = await getLeaderboard(type, runningContest.id);
        const sortedLeaderboard = leaderboard.slice(0, top).map(entry => ({
            messageId: entry.messageId,
            reactions: entry.count,
        }));

        return sortedLeaderboard;
    }

    throw new Error('Not active contest!');
}

interface MessageOptions {
    content: string;
    files?: string[]; // Ensure this line is present
}

type Contest = 'bone' | 'meme';

async function announceWinner(
    winners: { messageId: string; reactions: number }[],
    contestType: Contest
): Promise<void> {
    if (!process.env.MEME_CHANNEL_ID) {
        console.error('MEME_CHANNEL_ID is not set in the environment variables');
        return;
    }

    const announcementChannel = (await client.channels.fetch(
        process.env.MEME_CHANNEL_ID
    )) as TextChannel;

    const emoji = contestType === 'meme' ? '🎉' : '🦴';
    const contest = contestType === 'meme' ? 'Meme de la semana' : 'Hueso de la semana';

    for (const [index, winner] of winners.entries()) {
        const winnerMessage = await announcementChannel.messages.fetch(winner.messageId);
        const winnerLink = winnerMessage.url;
        const messageOptions: MessageOptions = {
            content: `${emoji} Felicitaciones, ${winnerMessage.author}! Tu post ha ganado el #${
                index + 1
            } puesto al "${contest}" con ${
                winner.reactions
            } reacciones. #LaPlazaRulez!. Link: ${winnerLink} ${emoji}`,
        };

        const attachmentUrl = winnerMessage.attachments.first()?.url;

        if (attachmentUrl) {
            messageOptions.files = [attachmentUrl];
        }

        await announcementChannel.send(messageOptions);
    }
}

async function processMessages(interaction: CommandInteraction) {
    // Defer the reply to allow time for processing
    await interaction.deferReply();

    // Fetch the channel using the ID from your environment variables
    const channelId = process.env.MEME_CHANNEL_ID;
    if (!channelId) {
        await interaction.editReply('Channel ID is not set in the environment variables.');
        return;
    }
    const channel = client.channels.cache.get(channelId) as TextChannel;
    if (!channel) {
        await interaction.editReply('Channel not found.');
        return;
    }

    // Calculate date range from last Friday at 12 PM to today
    const today = dayjs().endOf('day');
    const lastFriday = getLastFridayAtNoon();

    // Fetch messages within the date range
    const allMessages = await fetchMessagesInRange(channel, lastFriday, today);

    if (allMessages.length === 0) {
        await interaction.editReply('No messages found in the specified date range.');
        return;
    }

    // Process messages to count reactions
    const topMemes = getTopMessages(allMessages, LAUGH_EMOJIS);
    const topBones = getTopMessages(allMessages, BONE_EMOJI);

    // Announce winners
    await announceWinners(interaction, topMemes, 'meme');
    await announceWinners(interaction, topBones, 'bone');

    // Edit the initial reply to indicate completion
    await interaction.editReply('Ganadores anunciados!');
}

function getLastFridayAtNoon() {
    let date = dayjs().day(5).hour(12).minute(0).second(0).millisecond(0); // Friday at 12 PM
    if (date.isAfter(dayjs())) {
        // If today is before this week's Friday at 12 PM, go to last week's Friday
        date = date.subtract(1, 'week');
    }
    return date;
}

async function fetchMessagesInRange(channel: TextChannel, startDate: string | number | Date | dayjs.Dayjs | null | undefined, endDate: string | number | Date | dayjs.Dayjs | null | undefined) {
    let messages = [];
    let lastMessageId: string | undefined;
    let hasMoreMessages = true;
    while (hasMoreMessages) {
        const options: { limit: number; before?: string } = { limit: 100 };
        if (lastMessageId) options.before = lastMessageId;

        const fetchedMessages = await channel.messages.fetch(options);
        if (fetchedMessages.size === 0) {
            hasMoreMessages = false;
            break;
        }

        const filteredMessages = fetchedMessages.filter((msg: { createdAt: string | number | Date | dayjs.Dayjs | null | undefined; }) => {
            const msgDate = dayjs(msg.createdAt);
            return msgDate.isBetween(startDate, endDate, null, '[)');
        });

        messages.push(...filteredMessages.values());

        lastMessageId = fetchedMessages.last()?.id;

        // Stop if the oldest message is before the start date
        const oldestMessageDate = dayjs(fetchedMessages.last()?.createdAt);
        if (oldestMessageDate.isBefore(startDate)) break;
    }

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

async function announceWinners(interaction: CommandInteraction<CacheType>, winners: any[], contestType: string) {
    if (winners.length === 0) {
        // Since we've deferred the reply, we can use followUp
        await interaction.followUp(`No winners found for ${contestType}.`);
        return;
    }

    const emoji = contestType === 'meme' ? '🎉' : '🦴';
    const contestName = contestType === 'meme' ? 'Meme de la semana' : 'Hueso de la semana';

    for (const [index, winnerData] of winners.entries()) {
        const { message, count } = winnerData;
        const winnerLink = message.url;
        const messageOptions = {
            content: `${emoji} Felicitaciones, ${message.author}! Tu post ha ganado el #${index + 1} puesto al "${contestName}" con ${count} reacciones. #LaPlazaRulez! Link: ${winnerLink} ${emoji}`,
        };

        // Use followUp since the interaction has been deferred
        await interaction.followUp(messageOptions);
    }
}