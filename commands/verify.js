const { SlashCommandBuilder } = require("discord.js");

const config = require("../config/serverConfig");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("verify")
        .setDescription("Verify yourself to unlock the rest of the server."),

    async execute(interaction) {

        const guild = interaction.guild;
        const member = interaction.member;

        const verifiedRole = guild.roles.cache.find(r => r.name === config.verifiedRole);
        const unverifiedRole = guild.roles.cache.find(r => r.name === config.unverifiedRole);

        if (!verifiedRole) {
            return interaction.reply({
                content: "❌ The Verified role doesn't exist yet — ask an admin to run `/setup`.",
                flags: 64
            });
        }

        if (member.roles.cache.has(verifiedRole.id)) {
            return interaction.reply({ content: "✅ You're already verified!", flags: 64 });
        }

        await member.roles.add(verifiedRole).catch(() => {});
        if (unverifiedRole) await member.roles.remove(unverifiedRole).catch(() => {});

        await interaction.reply({
            content: "✅ You're verified! The rest of the server is now unlocked.",
            flags: 64
        });

    }

};
