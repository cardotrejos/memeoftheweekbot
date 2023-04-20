import { SlashCommandBuilder } from '@discordjs/builders';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import * as dotenv from 'dotenv';

dotenv.config();

const token = process?.env?.DISCORD_BOT_TOKEN;

if (!token) {
    console.error('Error: DISCORD_BOT_TOKEN not found in environment variables.');
    process.exit(1);
}

const commands = [
    new SlashCommandBuilder().setName('startcontest').setDescription('Start the meme contest'),
    new SlashCommandBuilder()
        .setName('winner')
        .setDescription('Announce the winner of the meme contest'),
].map(command => command.toJSON());

const rest = new REST({ version: '9' }).setToken(token);

(async () => {
    try {
        console.log('Started refreshing slash commands.');

        await rest.put(
            Routes.applicationGuildCommands('1097503132067565634', '1097502838780854432'),
            {
                body: commands,
            }
        );

        console.log('Successfully reloaded slash commands.');
    } catch (error) {
        console.error(error);
    }
})();
