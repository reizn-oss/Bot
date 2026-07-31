const { SlashCommandBuilder } = require("discord.js");

const { createTicket, closeTicket } = require("../features/tickets");
const config = require("../config/serverConfig");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Open or close a support ticket.")
        .addSubcommand(sub =>
            sub.setName("open").setDescription("Open a new private support ticket"))
        .addSubcommand(sub =>
            sub.setName("close").setDescription("Close the ticket you're currently in")),

    async execute(interaction) {

        const sub = interaction.options.getSubcommand();

        if (sub === "open") {

            await interaction.deferReply({ ephemeral: true });

            try {

                const channel = await createTicket(interaction.guild, interaction.member);
                await interaction.editReply(`🎫 Ticket created: ${channel}`);

            } catch (err) {

                await interaction.editReply(`❌ ${err.message}`);

            }

            return;

        }

        if (sub === "close") {

            const isTicketChannel = interaction.channel.topic?.startsWith("Ticket owner:");

            if (!isTicketChannel) {
                return interaction.reply({
                    content: "❌ This command only works inside a ticket channel.",
                    flags: 64
                });
            }

            const isStaff = interaction.member.roles.cache.some(r =>
                config.staffRoles.includes(r.name)
            );
            const ownerId = interaction.channel.topic.split("Ticket owner:")[1]?.trim();

            if (!isStaff && interaction.user.id !== ownerId) {
                return interaction.reply({
                    content: "❌ Only the ticket owner or staff can close this ticket.",
                    flags: 64
                });
            }

            await interaction.reply("🔒 Closing ticket...");
            await closeTicket(interaction.channel, interaction.user);

        }

    }

};
