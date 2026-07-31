const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { clearAllWarnings } = require("../utils/warnings");
const { logAction } = require("../features/logging");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("clearwarnings")
        .setDescription("Clear all warnings for a member.")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(opt =>
            opt.setName("user").setDescription("The member to clear").setRequired(true)),

    async execute(interaction) {

        const target = interaction.options.getUser("user");
        const cleared = clearAllWarnings(interaction.guild.id, target.id);

        await interaction.reply({
            content: `🧹 Cleared **${cleared}** warning(s) for **${target.tag}**.`,
            flags: 64
        });

        await logAction(interaction.guild, {
            title: "🧹 Warnings Cleared",
            description: `${interaction.user} cleared ${cleared} warning(s) for ${target}`,
            color: 0x99AAB5
        });

    }

};
