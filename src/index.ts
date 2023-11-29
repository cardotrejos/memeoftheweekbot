import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import {
    Client,
    GatewayIntentBits,
    MessageReaction,
    PartialMessageReaction,
    PartialUser,
    TextChannel,
    User,
} from 'discord.js';
import * as dotenv from 'dotenv';

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
    contestStartDate: dayjs.Dayjs | null = null;
    contestEndDate: dayjs.Dayjs | null = null;
    memeLeaderboard: Map<string, number> = new Map();
    boneLeaderboard: Map<string, number> = new Map();

    startContest(): void {
        this.contestStartDate = dayjs();
        this.contestEndDate = this.contestStartDate.add(7, 'day');
        this.memeLeaderboard.clear();
        this.boneLeaderboard.clear();
    }

    isContestRunning(): boolean {
        if (!this.contestStartDate || !this.contestEndDate) {
            return false;
        }
        return dayjs().isBetween(this.contestStartDate, this.contestEndDate);
    }
}

const contestManager = new ContestManager();

client.once('ready', () => {
    console.log('Bot is ready!');
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    try {
        if (commandName === START_CONTEST_COMMAND) {
            contestManager.startContest();
            await interaction.reply('El concurso ha comenzado!');
        } else if (commandName === WINNER_COMMAND) {
            const winners = getSortedLeaderboard(3, contestManager.memeLeaderboard);
            if (winners.length > 0) {
                await announceWinner(winners, 'Meme de la semana');
                await interaction.reply('Ganadores anunciados!');
            } else {
                await interaction.reply('No winners found for this week.');
            }
            const bones = getSortedLeaderboard(2, contestManager.memeLeaderboard);
            if (bones.length > 0) {
                await announceWinner(bones, 'Hueso de la semana');
                await interaction.reply('Ganadores anunciados!');
            } else {
                await interaction.reply('No winners found for this week.');
            }
        }
    } catch (error) {
        console.error(error);
        await interaction.reply('There was an error while executing this command!');
    }
});

client.on('messageReactionAdd', handleMessageReaction);

async function handleMessageReaction(reaction: MessageReaction | PartialMessageReaction,
        user: User | PartialUser): Promise<void>{
            handleSpecificMessageReaction(reaction, user, LAUGH_EMOJIS, contestManager.memeLeaderboard)
            handleSpecificMessageReaction(reaction, user, BONE_EMOJI, contestManager.boneLeaderboard)
        }

async function handleSpecificMessageReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    availableReactions: Array<string>,
    leaderboard:  Map<string, number>,
): Promise<void> {
    if (user.bot) return;

    if (
        reaction.message.channel.id === process.env.MEME_CHANNEL_ID &&
        reaction.message.channel instanceof TextChannel &&
        (availableReactions?.includes(reaction.emoji.name ?? '') ||
            availableReactions?.includes(reaction.emoji.id ?? '')) &&
        contestManager.isContestRunning()
    ) {
        const currentReactions = leaderboard.get(reaction.message.id) || 0;
        leaderboard.set(reaction.message.id, currentReactions + 1);
    }
}

function getSortedLeaderboard(top: number, leaderboard: Map<string, number>): { messageId: string; reactions: number }[] {
    const sortedLeaderboard = Array.from(leaderboard.entries()).sort(
        (a, b) => b[1] - a[1]
    );

    return sortedLeaderboard
        .slice(0, top)
        .map(entry => ({ messageId: entry[0], reactions: entry[1] }));
}

interface MessageOptions {
    content: string;
    files?: string[];
}

async function announceWinner(winners: { messageId: string; reactions: number }[], contest: string): Promise<void> {
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
