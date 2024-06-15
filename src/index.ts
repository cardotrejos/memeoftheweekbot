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
    saveReaction
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
const BONE_EMOJI = ['🦴']

const START_CONTEST_COMMAND = 'startcontest';
const WINNER_COMMAND = 'winner';

client.login(process.env.DISCORD_BOT_TOKEN);

class ContestManager {
    startContest(): void {
        const startDate = dayjs().toISOString();
        const endDate = dayjs().add(7, 'day').toISOString();
        saveContest(startDate, endDate);
    }

    isContestRunning(): boolean {
        const contest = getCurrentContest();
        return contest ? dayjs().isBetween(contest.startDate, contest.endDate) : false;
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
            const winners = getSortedLeaderboard(3, 'meme');
            const bones = getSortedLeaderboard(3, 'bone');
            if (winners.length == 0 && bones.length == 0) {
                await interaction.reply('No winners found for this week.');
            } else {
                await interaction.reply('Ganadores anunciados!');
            }
            if (winners.length > 0) {
                await announceWinner(winners, 'Meme de la semana');
            }
            if (bones.length > 0) {
                await announceWinner(bones, 'Hueso de la semana');
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

    if (
        reaction.message.channel.id === process.env.MEME_CHANNEL_ID &&
        reaction.message.channel instanceof TextChannel &&
        (availableReactions?.includes(reaction.emoji.name ?? '') ||
            availableReactions?.includes(reaction.emoji.id ?? '')) &&
        contestManager.isContestRunning()
    ) {
        saveReaction(reaction.message.id, user.id, type);
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
        contestManager.isContestRunning()
    ) {
        removeReaction(reaction.message.id, user.id, type);
    }
}

function getSortedLeaderboard(
    top: number,
    type: string
): { messageId: string; reactions: number }[] {
    return getLeaderboard(type)
        .slice(0, top)
        .map(entry => ({
            messageId: entry.messageId,
            reactions: entry.count,
        }));
}

interface MessageOptions {
    content: string;
    files?: string[];
}

async function announceWinner(
    winners: { messageId: string; reactions: number }[],
    contest: string
): Promise<void> {
    if (!process.env.MEME_CHANNEL_ID) {
        console.error('MEME_CHANNEL_ID is not set in the environment variables');
        return;
    }

    const announcementChannel = (await client.channels.fetch(
        process.env.MEME_CHANNEL_ID
    )) as TextChannel;

    for (const [index, winner] of winners.entries()) {
        const winnerMessage = await announcementChannel.messages.fetch(winner.messageId);
        const winnerLink = winnerMessage.url;
        const messageOptions: MessageOptions = {
            content: `🎉 Felicitaciones, ${winnerMessage.author}! Tu post ha ganado el #${
                index + 1
            } puesto al "${contest}" con ${
                winner.reactions
            } reacciones. #LaPlazaRulez!. Link: ${winnerLink} 🎉`,
        };

        const attachmentUrl = winnerMessage.attachments.first()?.url;

        if (attachmentUrl) {
            messageOptions['files'] = [attachmentUrl];
        }

        await announcementChannel.send(messageOptions);
    }
}