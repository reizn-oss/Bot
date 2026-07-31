const { SlashCommandBuilder } = require("discord.js");

const { stop } = require("../features/music");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Stop playback, clear the queue, and leave the voice channel."),

    async execute(interaction) {
        await stop(interaction);
    }

};
