const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const serverBuilder = require("../builders/serverBuilder");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Builds the entire CCIS Link-Hub server.")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {

        await interaction.deferReply({ flags: 64 });

        try {

            await serverBuilder(interaction.guild);

            await interaction.editReply(
                "✅ Server successfully configured."
            );

        } catch (err) {

            console.error(`\n❌ Setup failed.\nReason: ${err.message}`);

            await interaction.editReply(
                `❌ Setup failed.\nReason: ${err.message}`
            );

        }

    }

};
