require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {

    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {

        const command = require(path.join(commandsPath, file));

        if (command.data && command.execute) {
            commands.push(command.data.toJSON());
        }

    }

}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {

    try {

        console.log(`Registering ${commands.length} slash command(s)...`);

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            {
                body: commands
            }
        );

        console.log('✅ Slash commands registered.');

    } catch (err) {

        console.error('❌ Failed to register slash commands.');
        console.error(err);

    }
})();
