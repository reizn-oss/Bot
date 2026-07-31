const { SlashCommandBuilder } = require("discord.js");

const { shuffle } = require("../features/music");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("shuffle")
        .setDescription("Shuffle the current music queue."),

    async execute(interaction) {
        await shuffle(interaction);
    }

};
