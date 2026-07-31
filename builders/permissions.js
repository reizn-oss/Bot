const { PermissionsBitField } = require("discord.js");

const config = require("../config/serverConfig");

/**
 * Deny @everyone, allow only the given roles (defaults to config.staffRoles).
 * Used for "private" categories (COUNCIL ROOM, TICKETS) — TICKETS passes
 * its own narrower `allowedRoles` (config.ticketRoles) instead of the
 * default.
 * Roles that don't exist yet are skipped rather than throwing, so setup
 * still succeeds even if role creation partially failed or ran out of order.
 */
function buildStaffOverwrites(guild, roleNames = config.staffRoles) {

    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
        }
    ];

    for (const roleName of roleNames) {

        const role = guild.roles.cache.find(r => r.name === roleName);

        if (!role) continue;

        overwrites.push({
            id: role.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.Connect
            ]
        });

    }

    return overwrites;

}

/**
 * Deny @everyone, allow the Verified role + all staff roles.
 * Used for normal (non-public, non-private) categories, so unverified
 * members can't see the rest of the server until they click Verify.
 */
function buildVerifiedOverwrites(guild) {

    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
        }
    ];

    const allowedRoleNames = [config.verifiedRole, ...config.staffRoles];

    for (const roleName of allowedRoleNames) {

        const role = guild.roles.cache.find(r => r.name === roleName);

        if (!role) continue;

        overwrites.push({
            id: role.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.Connect
            ]
        });

    }

    return overwrites;

}

/**
 * Allow @everyone to VIEW (but not post in) a channel that lives inside an
 * otherwise gated category — used for welcome/rules/verify-here so they
 * stay visible before verifying, while the rest of the category doesn't.
 * Staff can still post (e.g. to update rules or announcements).
 */
function buildPublicChannelOverwrites(guild) {

    const overwrites = [
        {
            id: guild.roles.everyone.id,
            allow: [PermissionsBitField.Flags.ViewChannel],
            deny: [PermissionsBitField.Flags.SendMessages]
        }
    ];

    for (const roleName of config.staffRoles) {

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

    return overwrites;

}

/**
 * Takes an existing overwrite array and adds thread-creation/talk-in-thread
 * denials onto its @everyone entry (creating one if it's missing). Applied
 * everywhere — every category and every channel that gets an explicit
 * overwrite — so nobody, staff included, can start threads anywhere.
 */
function denyThreadsForEveryone(guild, overwrites) {

    const everyoneId = guild.roles.everyone.id;

    const threadDenies = [
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
        PermissionsBitField.Flags.SendMessagesInThreads
    ];

    const cloned = overwrites.map(o => ({ ...o }));
    const everyoneEntry = cloned.find(o => o.id === everyoneId);

    if (everyoneEntry) {
        everyoneEntry.deny = [...(everyoneEntry.deny || []), ...threadDenies];
    } else {
        cloned.push({ id: everyoneId, deny: threadDenies });
    }

    return cloned;

}

/**
 * Takes a channel's already-computed base overwrite array (whatever its
 * category/public status would normally give it) and downgrades every role
 * NOT in `chatRoleNames` to view-only, denying SendMessages. Works no
 * matter what the base gating is (public, Verified-gated, or staff-private)
 * since it operates on the resolved overwrite list rather than assuming one
 * particular base. Pass an empty array to block everyone, staff included
 * (e.g. the ticket panel, where only the bot should post).
 */
function restrictChatTo(guild, baseOverwrites, chatRoleNames) {

    const everyoneId = guild.roles.everyone.id;

    return baseOverwrites.map(o => {

        if (o.id === everyoneId) {
            return { ...o, deny: [...(o.deny || []), PermissionsBitField.Flags.SendMessages] };
        }

        const role = guild.roles.cache.get(o.id);
        const canChat = role && chatRoleNames.includes(role.name);

        if (canChat) return o;

        return {
            id: o.id,
            allow: [PermissionsBitField.Flags.ViewChannel],
            deny: [PermissionsBitField.Flags.SendMessages]
        };

    });

}

/**
 * Hides a channel from every role that would normally see it (Verified +
 * all staffRoles) except the ones explicitly listed in `allowedRoleNames`.
 * Used for mod-logs — visible to Administrator only, even though
 * Student Welfare/Student Council/Computer Society can see the rest of that category.
 */
function buildViewRestrictedOverwrites(guild, allowedRoleNames) {

    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
        }
    ];

    const relevantRoleNames = [...new Set([config.verifiedRole, ...config.staffRoles])];

    for (const roleName of relevantRoleNames) {

        const role = guild.roles.cache.find(r => r.name === roleName);

        if (!role) continue;

        if (allowedRoleNames.includes(roleName)) {
            overwrites.push({
                id: role.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            });
        } else {
            overwrites.push({
                id: role.id,
                deny: [PermissionsBitField.Flags.ViewChannel]
            });
        }

    }

    return overwrites;

}

/**
 * Hides a channel/VC from everyone except staffRoles and whoever holds the
 * one specific "gate" role — used for the per-game channels/VCs under
 * 🎮 GAMING, which stay hidden until a member picks that game in the role
 * wizard. Since overwrites are role-based, this needs no updating when
 * members gain/lose the role later — Discord resolves it live.
 */
function buildRoleGatedOverwrites(guild, gateRoleName) {

    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
        }
    ];

    for (const roleName of config.staffRoles) {

        const role = guild.roles.cache.find(r => r.name === roleName);
        if (!role) continue;

        overwrites.push({
            id: role.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.Connect
            ]
        });

    }

    const gateRole = guild.roles.cache.find(r => r.name === gateRoleName);

    if (gateRole) {
        overwrites.push({
            id: gateRole.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.Connect
            ]
        });
    }

    return overwrites;

}

/**
 * Returns the correct overwrite set for a given category config entry.
 * - private -> staff only (or categoryConfig.allowedRoles, if narrower)
 * - public  -> empty array (visible to everyone, Discord default)
 * - default -> Verified role only (gated behind /verify)
 */
function getOverwritesFor(guild, categoryConfig) {

    if (categoryConfig.private) {
        return buildStaffOverwrites(guild, categoryConfig.allowedRoles);
    }

    if (categoryConfig.public) {
        return [];
    }

    return buildVerifiedOverwrites(guild);

}

module.exports = {
    buildStaffOverwrites,
    buildVerifiedOverwrites,
    buildPublicChannelOverwrites,
    denyThreadsForEveryone,
    restrictChatTo,
    buildViewRestrictedOverwrites,
    buildRoleGatedOverwrites,
    getOverwritesFor
};
