const { PermissionsBitField } = require("discord.js");

const config = require("../config/serverConfig");
const logger = require("../utils/logger");

// Flatten the grouped config into one ordered list of role names.
function getAllRoleNames() {

    const groups = config.roleGroups;

    return [
        ...groups.staff,
        ...groups.program,
        ...groups.yearLevel,
        ...groups.gamer,
        ...groups.notification,
        ...groups.interest,
        ...groups.system
    ];

}

// A few roles get color/hoist/permission treatment so they stand out and
// actually have power. "Limit" = Discord's Moderate Members permission
// (timeout). Every role gets a color below so the member list and role
// picker are visually organized by group (staff / program / year / game /
// notification), not just a wall of default gray.
const ROLE_OPTIONS = {

    // ── Staff (hoisted, real permissions) ──────────────────────────────
    "Administrator": {
        color: 0xE74C3C,
        hoist: true,
        permissions: [PermissionsBitField.Flags.Administrator]
    },
    "Student Welfare": {
        color: 0xF1C40F,
        hoist: true,
        permissions: [
            PermissionsBitField.Flags.KickMembers,
            PermissionsBitField.Flags.BanMembers,
            PermissionsBitField.Flags.ModerateMembers,
            PermissionsBitField.Flags.ManageMessages,
            PermissionsBitField.Flags.ManageNicknames,
            PermissionsBitField.Flags.ViewAuditLog
        ]
    },
    "Student Council": { color: 0x9B59B6, hoist: true },
    "Computer Society": { color: 0x3498DB, hoist: true },

    // ── Program roles (blue/teal family — pairs with 🎓 ACADEMIC HUB) ──
    "BSCS": { color: 0x3498DB },
    "BSIT": { color: 0x2980B9 },
    "BSIS": { color: 0x1ABC9C },
    "Diploma": { color: 0x5DADE2 },

    // ── Year level roles (warms up as students get closer to graduating) ─
    "1st Year": { color: 0xF9E79F },
    "2nd Year": { color: 0xF5B041 },
    "3rd Year": { color: 0xE67E22 },
    "4th Year": { color: 0xD35400 },

    // ── Gamer roles (loosely themed on each game's own brand color) ────
    "Valorant": { color: 0xFF4655 },
    "Mobile Legends": { color: 0x1560BD },
    "CODM": { color: 0x808000 },
    "Roblox": { color: 0xA9A9A9 },
    "Minecraft": { color: 0x5E8C31 },
    "League of Legends": { color: 0xC89B3C },
    "Teamfight Tactics": { color: 0xF0A83C },

    // ── Notification roles (pairs with 📢 INFORMATION CENTER) ──────────
    "📢 Announcements": { color: 0xE67E22 },
    "🎓 Academic Updates": { color: 0x3498DB },
    "📅 Events": { color: 0xE91E63 },

    // ── Interest roles (pairs with 🎓 ACADEMIC HUB showcase channels) ──
    "Innovator": { color: 0xF39C12 },
    "Artist": { color: 0xE056FD },

    // ── System roles ────────────────────────────────────────────────────
    "Verified": { color: 0x2ECC71 },
    "Unverified": { color: 0x95A5A6 }
};

module.exports = async (guild) => {

    logger.step("Creating Roles...");

    for (const roleName of getAllRoleNames()) {

        try {

            const options = ROLE_OPTIONS[roleName] || {};
            const existing = guild.roles.cache.find(r => r.name === roleName);

            if (existing) {

                // Re-apply color/hoist/permissions in case this role was
                // created by an earlier version of /setup (e.g. before
                // Student Welfare had real permissions).
                if (options.permissions) {
                    await existing.setPermissions(options.permissions).catch(() => {});
                }
                if (options.color !== undefined || options.hoist !== undefined) {
                    await existing.edit({
                        color: options.color ?? existing.color,
                        hoist: options.hoist ?? existing.hoist
                    }).catch(() => {});
                }

                logger.skip(roleName);
                continue;

            }

            await guild.roles.create({

                name: roleName,
                color: options.color,
                hoist: options.hoist || false,
                permissions: options.permissions || []

            });

            logger.success(roleName);

        } catch (err) {

            throw new Error(`Failed to create role "${roleName}": ${err.message}`);

        }

    }

};

module.exports.getAllRoleNames = getAllRoleNames;
