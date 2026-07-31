const config = require("../config/serverConfig");
const { createTicket, closeTicket } = require("../features/tickets");
const { logAction } = require("../features/logging");
const pollCommand = require("../commands/poll");
const { handleWizardButton } = require("./roleWizard");

async function handleVerifyButton(interaction) {

    const guild = interaction.guild;
    const member = interaction.member;

    const verifiedRole = guild.roles.cache.find(r => r.name === config.verifiedRole);
    const unverifiedRole = guild.roles.cache.find(r => r.name === config.unverifiedRole);

    if (!verifiedRole) {
        return interaction.reply({ content: "❌ Verified role not found. Ask an admin to run /setup.", flags: 64 });
    }

    if (member.roles.cache.has(verifiedRole.id)) {
        return interaction.reply({ content: "✅ You're already verified!", flags: 64 });
    }

    await member.roles.add(verifiedRole).catch(() => {});
    if (unverifiedRole) await member.roles.remove(unverifiedRole).catch(() => {});

    const roleSelectChannel = guild.channels.cache.find(c => c.name === config.channelNames.roleSelect);
    const nextStepText = roleSelectChannel
        ? ` Head to <#${roleSelectChannel.id}> to pick your roles.`
        : "";

    await interaction.reply({ content: `✅ Verified! The rest of the server is now unlocked.${nextStepText}`, flags: 64 });

    await logAction(guild, {
        title: "✅ Member Verified",
        description: `${member}`,
        color: 0x2ECC71
    });

}

async function handleTicketCreateButton(interaction) {

    await interaction.deferReply({ flags: 64 });

    try {

        const channel = await createTicket(interaction.guild, interaction.member);
        await interaction.editReply(`🎫 Ticket created: ${channel}`);

    } catch (err) {

        await interaction.editReply(`❌ ${err.message}`);

    }

}

async function handleTicketCloseButton(interaction) {

    const isTicketChannel = interaction.channel.topic?.startsWith("Ticket owner:");

    if (!isTicketChannel) {
        return interaction.reply({ content: "❌ This isn't a ticket channel.", flags: 64 });
    }

    const isTicketStaff = interaction.member.roles.cache.some(r =>
        config.ticketRoles.includes(r.name)
    );
    const ownerId = interaction.channel.topic.split("Ticket owner:")[1]?.trim();

    if (!isTicketStaff && interaction.user.id !== ownerId) {
        return interaction.reply({ content: "❌ Only the ticket owner, Student Welfare, or an Administrator can close this.", flags: 64 });
    }

    await interaction.reply("🔒 Closing ticket...");
    await closeTicket(interaction.channel, interaction.user);

}

async function handleButtonInteraction(interaction) {

    const customId = interaction.customId;

    if (customId === "verify:confirm") {
        return handleVerifyButton(interaction);
    }

    if (customId.startsWith("wizard:")) {
        return handleWizardButton(interaction);
    }

    if (customId === "ticket:create") {
        return handleTicketCreateButton(interaction);
    }

    if (customId === "ticket:close") {
        return handleTicketCloseButton(interaction);
    }

    if (customId.startsWith("poll:")) {
        const [, pollId, optionIndex] = customId.split(":");
        return pollCommand.handleVote(interaction, pollId, optionIndex);
    }

}

module.exports = { handleButtonInteraction };
