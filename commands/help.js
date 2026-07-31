const { SlashCommandBuilder } = require('discord.js');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Displays the help menu.'),

    async execute(interaction) {

        await interaction.reply({
            content:
`# 🤖 InfoCore Bot

Available Commands

/setup — (Admin) Builds the entire CCIS Link-Hub server
/verify — Verify yourself to unlock the server
/ticket open — Open a private support ticket
/ticket close — Close the ticket you're in
/poll — Create a quick poll with up to 5 options
/kick — (Staff) Kick a member
/ban — (Staff) Ban a member
/timeout — (Staff) Time out ("limit") a member
/warn — (Staff) Formally warn a member
/warnings — (Staff) View a member's warning history
/clearwarnings — (Admin) Clear a member's warnings
/play — (Verified) Play/queue a song in 🎵 Music Room
/skip — Skip the current song
/pause — Pause the current song
/resume — Resume playback
/queue — Show what's playing and up next
/shuffle — Shuffle the queue
/stop — Stop playback and leave the voice channel
/help — Shows this menu

Pick your Year Level, Program, Notification, and Game roles in
#role-select — click the buttons in order and each step opens the next.

Other features run automatically once /setup has been run:
welcome embeds, auto moderation, and mod-log logging (#mod-logs).`,
            flags: 64
        });

    }

};
