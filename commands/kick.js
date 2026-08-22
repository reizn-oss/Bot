const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { logAction } = require("../features/logging");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kick a member from the server.")
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(opt =>
            opt.setName("user").setDescription("The member to kick").setRequired(true))
        .addStringOption(opt =>
            opt.setName("reason").setDescription("Reason for the kick").setRequired(false)),

    async execute(interaction) {

        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "No reason provided";

        // See timeout.js for why this fetches instead of using
        // getMember() — getMember() can hand back a partial object with
        // no .kickable/.kick() when the member isn't already cached.
        const target = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (!target) {
            return interaction.reply({ content: "❌ That user isn't in this server.", flags: 64 });
        }

        if (!target.kickable) {
            return interaction.reply({
                content: "❌ I can't kick that member — check role hierarchy and my permissions.",
                flags: 64
            });
        }

        await target.kick(reason);

        await interaction.reply(`👢 Kicked **${target.user.tag}**. Reason: ${reason}`);

        await logAction(interaction.guild, {
            title: "👢 Member Kicked",
            description: `${target.user.tag} was kicked by ${interaction.user}`,
            color: 0xED4245,
            fields: [{ name: "Reason", value: reason }]
        });

    }

};
