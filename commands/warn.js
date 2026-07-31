const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { addWarning, warningCount } = require("../utils/warnings");
const { logAction } = require("../features/logging");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Formally warn a member. Stored permanently — view history with /warnings.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt =>
            opt.setName("user").setDescription("The member to warn").setRequired(true))
        .addStringOption(opt =>
            opt.setName("reason").setDescription("Reason for the warning").setRequired(true)),

    async execute(interaction) {

        const target = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason");

        addWarning(interaction.guild.id, target.id, interaction.user.id, reason);
        const total = warningCount(interaction.guild.id, target.id);

        await interaction.reply(`⚠️ Warned **${target.tag}**. Reason: ${reason}\nThey now have **${total}** warning(s).`);

        await target.send(
            `⚠️ You were warned in **${interaction.guild.name}**.\nReason: ${reason}`
        ).catch(() => {});

        await logAction(interaction.guild, {
            title: "⚠️ Member Warned",
            description: `${target} was warned by ${interaction.user}`,
            color: 0xFEE75C,
            fields: [
                { name: "Reason", value: reason },
                { name: "Total Warnings", value: `${total}` }
            ]
        });

    }

};
