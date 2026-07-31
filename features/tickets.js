const { ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const config = require("../config/serverConfig");
const { logAction } = require("./logging");

function findTicketCategory(guild) {

    const catConfig = config.categories.find(c => c.isTicketCategory);
    if (!catConfig) return null;

    return guild.channels.cache.find(c =>
        c.name === catConfig.name && c.type === ChannelType.GuildCategory
    );

}

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function createTicket(guild, member) {

    const category = findTicketCategory(guild);

    if (!category) {
        throw new Error("Ticket category not found — run /setup first.");
    }

    const channelName = `ticket-${slugify(member.user.username)}`;

    const existing = guild.channels.cache.find(c =>
        c.name === channelName && c.parentId === category.id
    );

    if (existing) return existing;

    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
            id: member.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages
            ]
        }
    ];

    for (const roleName of config.ticketRoles) {
        const role = guild.roles.cache.find(r => r.name === roleName);
        if (!role) continue;
        overwrites.push({
            id: role.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages
            ]
        });
    }

    const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Ticket owner: ${member.id}`,
        permissionOverwrites: overwrites
    });

    const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ticket:close")
            .setLabel("Close Ticket")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🔒")
    );

    // Ping only config.ticketRoles (Administrator, Student Welfare) so a
    // ticket opening notifies exactly who's supposed to handle it — Student
    // Council doesn't have ticket access at all. Roles that don't exist yet
    // (e.g. /setup hasn't been run) are silently skipped instead of
    // breaking ticket creation.
    const staffPing = config.ticketRoles
        .map(roleName => guild.roles.cache.find(r => r.name === roleName))
        .filter(Boolean)
        .map(role => role.toString())
        .join(" ");

    await channel.send({
        content:
            `🎫 Ticket opened by ${member}.${staffPing ? ` ${staffPing}` : ""}\n` +
            `Staff will be with you shortly. Click below or use \`/ticket close\` when this is resolved.`,
        components: [closeRow]
    });

    await logAction(guild, {
        title: "🎫 Ticket Opened",
        description: `${member} opened ${channel}`,
        color: 0x5865F2
    });

    return channel;

}

async function closeTicket(channel, closedBy) {

    await logAction(channel.guild, {
        title: "🔒 Ticket Closed",
        description: `${closedBy} closed ${channel.name}`,
        color: 0xED4245
    });

    await channel.send("🔒 Closing this ticket in 5 seconds...");

    setTimeout(() => channel.delete().catch(() => {}), 5000);

}

module.exports = { createTicket, closeTicket, findTicketCategory };
