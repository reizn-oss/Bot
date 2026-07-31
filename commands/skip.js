const { SlashCommandBuilder } = require("discord.js");

const { skip } = require("../features/music");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("skip")
        .setDescription("Skip the current song."),

    async execute(interaction) {
        await skip(interaction);
    }

};
