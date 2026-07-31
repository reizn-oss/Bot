const { SlashCommandBuilder } = require("discord.js");

const { showQueue } = require("../features/music");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("queue")
        .setDescription("Show what's playing and what's up next."),

    async execute(interaction) {
        await showQueue(interaction);
    }

};
