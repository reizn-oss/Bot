const { SlashCommandBuilder } = require("discord.js");

const { enqueue } = require("../features/music");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play or queue a song, Spotify/Apple Music playlist/album/track, or SoundCloud link (Verified members only).")
        .addStringOption(opt =>
            opt.setName("query").setDescription("Song name, Spotify link, Apple Music link, or SoundCloud URL").setRequired(true)),

    async execute(interaction) {

        const query = interaction.options.getString("query");
        await enqueue(interaction, query);

    }

};
