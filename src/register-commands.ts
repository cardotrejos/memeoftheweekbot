import { SlashCommandBuilder } from '@discordjs/builders';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token) {
    console.error('Error: DISCORD_BOT_TOKEN not found in environment variables.');
    process.exit(1);
}

if (!clientId) {
    console.error('Error: CLIENT_ID not found in environment variables.');
    process.exit(1);
}

if (!guildId) {
    console.error('Error: GUILD_ID not found in environment variables.');
    process.exit(1);
}

const commands = [
    new SlashCommandBuilder()
        .setName('gettop')
        .setDescription('Anuncia el ganador scrapeando los mensajes con más reacciones'),
].map(command => command.toJSON());

const rest = new REST({ version: '9' }).setToken(token);

(async () => {
    try {
        console.log('Started refreshing slash commands.');

        await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
            body: commands,
        });

        console.log('Successfully reloaded slash commands.');
    } catch (error) {
        console.error(error);
    }
})();
