const { SlashCommandBuilder } = require("discord.js");

const { pause } = require("../features/music");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("pause")
        .setDescription("Pause the current song."),

    async execute(interaction) {
        await pause(interaction);
    }

};
