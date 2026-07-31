const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { logAction } = require("../features/logging");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban a member from the server.")
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(opt =>
            opt.setName("user").setDescription("The member to ban").setRequired(true))
        .addStringOption(opt =>
            opt.setName("reason").setDescription("Reason for the ban").setRequired(false))
        .addIntegerOption(opt =>
            opt.setName("delete_message_days")
                .setDescription("Delete this many days of their recent messages (0-7)")
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)),

    async execute(interaction) {

        const target = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "No reason provided";
        const deleteDays = interaction.options.getInteger("delete_message_days") || 0;

        const member = await interaction.guild.members.fetch(target.id).catch(() => null);

        if (member && !member.bannable) {
            return interaction.reply({
                content: "❌ I can't ban that member — check role hierarchy and my permissions.",
                flags: 64
            });
        }

        await interaction.guild.members.ban(target.id, {
            reason,
            deleteMessageSeconds: deleteDays * 24 * 60 * 60
        });

        await interaction.reply(`🔨 Banned **${target.tag}**. Reason: ${reason}`);

        await logAction(interaction.guild, {
            title: "🔨 Member Banned",
            description: `${target.tag} was banned by ${interaction.user}`,
            color: 0xED4245,
            fields: [{ name: "Reason", value: reason }]
        });

    }

};
