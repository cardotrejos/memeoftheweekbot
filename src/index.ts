import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import {
    Client,
    GatewayIntentBits,
    Message,
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
const REACTION_EMOJIS = ['🤣', '😂', '930549056466485298', '889670198934794240', '954075635310035024'];
const START_CONTEST_COMMAND = 'startcontest';
const WINNER_COMMAND = 'winner';

client.login(process.env.DISCORD_BOT_TOKEN);

class ContestManager {
    contestStartDate: dayjs.Dayjs | null = null;
    contestEndDate: dayjs.Dayjs | null = null;
    memeLeaderboard: Map<string, number> = new Map();

    startContest(): void {
        this.contestStartDate = dayjs();
        this.contestEndDate = this.contestStartDate.add(7, 'day');
        this.memeLeaderboard.clear();
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
            await interaction.reply('Meme contest started!');
        } else if (commandName === WINNER_COMMAND) {
            const winner = getMemeWinner();
            if (winner) {
                const winnerMessage = await interaction.channel?.messages.fetch(winner.messageId);
                if (winnerMessage) {
                    await announceWinner(winnerMessage, winner.reactions);
                    await interaction.reply('Winner announced!');
                } else {
                    await interaction.reply('Winner message not found.');
                }
            } else {
                await interaction.reply('No winner found for this week.');
            }
        }
    } catch (error) {
        console.error(error);
        await interaction.reply('There was an error while executing this command!');
    }
});

client.on('messageReactionAdd', handleMessageReaction);

async function handleMessageReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
): Promise<void> {
    if (user.bot) return;

    if (
        reaction.message.channel.id === process.env.MEME_CHANNEL_ID &&
        reaction.message.channel instanceof TextChannel &&
        REACTION_EMOJIS?.includes(reaction.emoji.name ?? '') &&
        contestManager.isContestRunning()
    ) {
        const currentReactions = contestManager.memeLeaderboard.get(reaction.message.id) || 0;
        contestManager.memeLeaderboard.set(reaction.message.id, currentReactions + 1);
    }
}

function getMemeWinner(): { messageId: string; reactions: number } | null {
    let winner: { messageId: string; reactions: number } | null = null;

    for (const [messageId, reactions] of contestManager.memeLeaderboard.entries()) {
        if (!winner || reactions > winner.reactions) {
            winner = { messageId, reactions };
        }
    }
    return winner;
}

interface MessageOptions {
    content: string;
    files?: string[];
}

async function announceWinner(winnerMessage: Message, reactions: number): Promise<void> {
    const announcementChannel = winnerMessage.channel as TextChannel;

    const messageOptions: MessageOptions = {
        content: `🎉 Felicitaciones, ${winnerMessage.author}! Tu post ha ganado el premio al "Meme de la semana" con ${reactions} reacciones. #LaPlazaRulez! 🎉`,
    };

    const attachmentUrl = winnerMessage.attachments.first()?.url;

    if (attachmentUrl) {
        messageOptions['files'] = [attachmentUrl];
    }

    await announcementChannel.send(messageOptions);
}
