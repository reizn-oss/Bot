const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

const { listWarnings } = require("../utils/warnings");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("warnings")
        .setDescription("View a member's warning history.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt =>
            opt.setName("user").setDescription("The member to check").setRequired(true)),

    async execute(interaction) {

        const target = interaction.options.getUser("user");
        const rows = listWarnings(interaction.guild.id, target.id);

        if (rows.length === 0) {
            return interaction.reply({ content: `✅ **${target.tag}** has no warnings.`, flags: 64 });
        }

        const embed = new EmbedBuilder()
            .setTitle(`⚠️ Warnings for ${target.tag}`)
            .setColor(0xFEE75C)
            .setDescription(
                rows.slice(0, 10).map((w, i) =>
                    `**${i + 1}.** <t:${Math.floor(w.createdAt / 1000)}:R> by <@${w.moderatorId}>\n> ${w.reason}`
                ).join("\n\n")
            )
            .setFooter({
                text: rows.length > 10
                    ? `${rows.length} total warning(s) — showing 10 most recent`
                    : `${rows.length} total warning(s)`
            });

        await interaction.reply({ embeds: [embed], flags: 64 });

    }

};
