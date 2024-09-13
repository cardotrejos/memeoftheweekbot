import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import {
    Client,
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
    files?: string[];
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
            messageOptions['files'] = [attachmentUrl];
        }

        await announcementChannel.send(messageOptions);
    }
}
