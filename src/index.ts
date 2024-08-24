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
    'e17451fcdbba5089cb76', // :rofl:
    'af51e8d03e05a1c14355', // :joy:
    '956966036354265180',  // :pepehardlaugh:
    '974777892418519081', // :doggokek:
    '954075635310035024', // :kekw:
    '956966037063106580', // :pepelaugh:
    '58a496c6d67a070ade5c', // :first_place:
    'ff052fe58b3e30716221', // :second_place:
    '6845b8532e3f672959c4', // :third_place:
];
const BONE_EMOJIS = [
    '1a81cecf91614ecada82', // :bone:
    'ca106978dc4a463ec587', // :meat_on_bone:
];

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
    console.log('¡El bot está listo!');
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    try {
        if (commandName === START_CONTEST_COMMAND) {
            contestManager.startContest();
            await interaction.reply('¡El concurso ha comenzado!');
        } else if (commandName === WINNER_COMMAND) {
            const [winners, bones] = await Promise.all([
                getSortedLeaderboard(3, 'meme'),
                getSortedLeaderboard(3, 'bone')
            ]);

            if (winners.length == 0 && bones.length == 0) {
                await interaction.reply('No ha habido ganadores esta semana.');
            } else {
                await interaction.reply('¡Ganadores anunciados!');
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
        await interaction.reply('¡Ha ocurrido un error al ejecutar este comando!');
    }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
    await handleSpecificMessageReaction(reaction, user, LAUGH_EMOJIS, 'meme');
    await handleSpecificMessageReaction(reaction, user, BONE_EMOJIS, 'bone');
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
    await handleSpecificMessageReactionRemoved(reaction, user, LAUGH_EMOJIS, 'meme');
    await handleSpecificMessageReactionRemoved(reaction, user, BONE_EMOJIS, 'bone');
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

    throw new Error('¡No hay un concurso activo!');
}

interface MessageOptions {
    content: string;
    files?: string[];
}

type Contest = 'bone' | 'meme';

const contestMap = {
    meme: { name: 'Meme de la semana.', emoji: '🎉' },
    bone: { name: 'Hueso de la semana.', emoji: '🦴' },
    default: { name: 'Tipo de concurso no definido.', emoji: '❓' },
};

function getContestDetails(contestType: Contest): { emoji: string; contestName: string } {
    const contest = contestMap[contestType] || contestMap.default;
    return { emoji: contest.emoji, contestName: contest.name };
}

async function announceWinner(
    winners: { messageId: string; reactions: number }[],
    contestType: Contest
): Promise<void> {
    if (!process.env.MEME_CHANNEL_ID) {
        console.error('MEME_CHANNEL_ID no está configurado en las variables de ambiente.');
        return;
    }

    const announcementChannel = (await client.channels.fetch(
        process.env.MEME_CHANNEL_ID
    )) as TextChannel;

    const { emoji, contestName } = getContestDetails(contestType);

    for (const [index, winner] of winners.entries()) {
        const winnerMessage = await announcementChannel.messages.fetch(winner.messageId);
        const winnerLink = winnerMessage.url;
        const messageOptions: MessageOptions = {
            content: `${emoji} ¡Felicitaciones, ${winnerMessage.author}! Tu post ha ganado el #${
                index + 1
            } puesto al "${contestName}" con ${
                winner.reactions
            } reacciones, #LaPlazaRulez Link: ${winnerLink} ${emoji}`,
        };

        const attachmentUrl = winnerMessage.attachments.first()?.url;

        if (attachmentUrl) {
            messageOptions['files'] = [attachmentUrl];
        }

        await announcementChannel.send(messageOptions);

    }
}