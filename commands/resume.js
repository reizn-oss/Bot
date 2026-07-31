const { SlashCommandBuilder } = require("discord.js");

const { resume } = require("../features/music");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("resume")
        .setDescription("Resume the paused song."),

    async execute(interaction) {
        await resume(interaction);
    }

};
