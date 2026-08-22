const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { logAction } = require("../features/logging");

const MAX_TIMEOUT_MINUTES = 40320; // Discord's cap: 28 days

module.exports = {

    data: new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Limit a member by timing them out (they can't send messages or speak).")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt =>
            opt.setName("user").setDescription("The member to time out").setRequired(true))
        .addIntegerOption(opt =>
            opt.setName("minutes")
                .setDescription(`How long, in minutes (max ${MAX_TIMEOUT_MINUTES})`)
                .setMinValue(1)
                .setMaxValue(MAX_TIMEOUT_MINUTES)
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName("reason").setDescription("Reason for the timeout").setRequired(false)),

    async execute(interaction) {

        const user = interaction.options.getUser("user");
        const minutes = interaction.options.getInteger("minutes");
        const reason = interaction.options.getString("reason") || "No reason provided";

        // Always fetch the real GuildMember instead of relying on
        // getMember(), which silently returns a bare partial object
        // (no .moderatable, no .timeout()) whenever the member isn't
        // already sitting in the client's cache. That partial-object
        // case was the #1 reason /timeout would appear to "do nothing"
        // or throw "target.timeout is not a function".
        const target = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (!target) {
            return interaction.reply({ content: "❌ That user isn't in this server.", flags: 64 });
        }

        if (!target.moderatable) {
            return interaction.reply({
                content: "❌ I can't time out that member — check role hierarchy and my permissions.",
                flags: 64
            });
        }

        await target.timeout(minutes * 60 * 1000, reason);

        await interaction.reply(`⏳ Timed out **${target.user.tag}** for ${minutes} minute(s). Reason: ${reason}`);

        await logAction(interaction.guild, {
            title: "⏳ Member Timed Out",
            description: `${target.user.tag} was timed out by ${interaction.user} for ${minutes} minute(s)`,
            color: 0xFEE75C,
            fields: [{ name: "Reason", value: reason }]
        });

    }

};
