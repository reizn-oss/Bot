// Roles allowed to see the 🎫 TICKETS category, get pinged when a ticket
// opens, and force-close other people's tickets. Deliberately narrower
// than staffRoles — Student Council does NOT get ticket access.
const TICKET_ROLES = ["Administrator", "Student Welfare"];

module.exports = {

    // ── Roles ──────────────────────────────────────────────────────────
    // Grouped for readability only — the builder flattens these into one
    // list. Order = creation order (roughly high -> low authority).
    roleGroups: {

        staff: [
            "Administrator",
            "Student Welfare",
            "Student Council",
            "Computer Society"
        ],

        // Program roles (self-assignable, exclusive — one at a time)
        program: [
            "BSCS",
            "BSIT",
            "BSIS",
            "Diploma"
        ],

        // Year level roles (self-assignable, exclusive — one at a time)
        yearLevel: [
            "1st Year",
            "2nd Year",
            "3rd Year",
            "4th Year"
        ],

        // One self-assignable role per game (reaction roles, "Gamer roles")
        gamer: [
            "Valorant",
            "Mobile Legends",
            "CODM",
            "Roblox",
            "Minecraft",
            "League of Legends",
            "Teamfight Tactics"
        ],

        // Self-assignable "ping me for" roles (reaction roles, "Notification roles")
        notification: [
            "📢 Announcements",
            "🎓 Academic Updates",
            "📅 Events"
        ],

        // Self-assignable interest roles (reaction roles, standalone panel —
        // see interestPanel below). Each one gates its own showcase channel.
        interest: [
            "Innovator",
            "Artist"
        ],

        // Internal system roles, not shown in the role-select panel
        system: [
            "Verified",
            "Unverified"
        ]

    },

    // Roles allowed to see STAFF/TICKETS-style private categories by
    // default, and who can chat in chatRestrictedTo channels.
    staffRoles: [
        "Administrator",
        "Student Welfare",
        "Student Council",
        "Computer Society"
    ],

    // Narrower role list specifically for ticket access — see comment above.
    ticketRoles: TICKET_ROLES,

    // Role granted automatically on join, before verifying
    unverifiedRole: "Unverified",

    // Role granted after clicking the Verify button; gates every
    // non-public, non-private category
    verifiedRole: "Verified",

    // ── Categories & Channels ──────────────────────────────────────────
    // private   -> visible only to staffRoles (or allowedRoles, if set)
    // public    -> visible to @everyone, even before verifying
    // (neither) -> gated behind the Verified role
    //
    // Per-channel overrides (all optional):
    //   public: true            -> stays visible to @everyone even though
    //                               the category itself is gated
    //   chatRestrictedTo: [...] -> only these role names can send messages;
    //                               everyone else who can see it is
    //                               downgraded to view-only. Pass [] to
    //                               block EVERYONE from typing (bot-only).
    //   viewRestrictedTo: [...] -> only these role names can even see the
    //                               channel at all — hidden from every
    //                               other role that would normally see it.
    //   gateRole: "RoleName"     -> hidden from everyone except staffRoles
    //                               and whoever holds that specific role
    //                               (used for the per-game channels/VCs).
    //
    // Threads are blocked for everyone, everywhere — enforced globally in
    // builders/categories.js + builders/channels.js, no per-channel flag
    // needed.
    categories: [

        {
            name: "📢 INFORMATION CENTER",
            channels: [
                { name: "👋-welcome", public: true },
                { name: "📜-rules", public: true },
                { name: "✅-verify-here", public: true },
                "🧭-server-guide",
                "🎭-role-select",
                { name: "📣-announcements", chatRestrictedTo: TICKET_ROLES },
                { name: "🎓-academic-updates", chatRestrictedTo: TICKET_ROLES },
                { name: "📅-events", chatRestrictedTo: TICKET_ROLES },
                { name: "🏢-organization-posts", chatRestrictedTo: TICKET_ROLES },
                "💼-internship-opportunities"
            ]
        },

        {
            name: "🎓 ACADEMIC HUB",
            channels: [
                "💻-programming-help",
                "📚-study-groups",
                { name: "📖-learning-resources", chatRestrictedTo: TICKET_ROLES },
                // Hidden from everyone except staff until the matching
                // interest role is picked from the 🎨 Interest Roles panel
                // in #role-select — same gateRole pattern as 🎮 GAMING.
                { name: "🖼-project-showcase", gateRole: "Innovator" },
                { name: "🎨-art-showcase", gateRole: "Artist" },
                "🤖-ai-discussion",
                "🛡-cybersecurity",
                "🌐-web-development",
                "📱-mobile-development"
            ]
        },

        {
            name: "💬 COMMUNITY",
            channels: [
                "💬-general-chat",
                "🙋-introductions",
                "🛋-lounge",
                { name: "📌-faq", chatRestrictedTo: TICKET_ROLES },
                "❓-questions",
                "😂-memes",
                "💡-suggestions",
                "🏆-achievements"
            ]
        },

        {
            name: "🎮 GAMING",
            // Each channel/VC is hidden from everyone except staff until
            // the matching game role is picked in #role-select — handled
            // by gateRole below.
            channels: [
                { name: "🔫-valorant", gateRole: "Valorant" },
                { name: "⚔-mobile-legends", gateRole: "Mobile Legends" },
                { name: "🪖-codm", gateRole: "CODM" },
                { name: "🧱-roblox", gateRole: "Roblox" },
                { name: "⛏-minecraft", gateRole: "Minecraft" },
                { name: "🐉-league-of-legends", gateRole: "League of Legends" },
                { name: "♟-teamfight-tactics", gateRole: "Teamfight Tactics" }
            ],
            // Voice channels that live inside this same category
            voiceChannels: [
                { name: "Valorant VC", gateRole: "Valorant" },
                { name: "Mobile Legends VC", gateRole: "Mobile Legends" },
                { name: "CODM VC", gateRole: "CODM" },
                { name: "Roblox VC", gateRole: "Roblox" },
                { name: "Minecraft VC", gateRole: "Minecraft" },
                { name: "League of Legends VC", gateRole: "League of Legends" },
                { name: "Teamfight Tactics VC", gateRole: "Teamfight Tactics" }
            ]
        },

        {
            name: "🎫 TICKETS",
            private: true,
            isTicketCategory: true,
            // Narrower than the default staffRoles — Student Council can't
            // see this category at all.
            allowedRoles: TICKET_ROLES,
            channels: [
                // chatRestrictedTo: [] -> nobody types here, not even
                // Admin/Student Welfare — only the bot posts, via the
                // "Open Ticket" panel message.
                { name: "🎫-ticket-panel", chatRestrictedTo: [] }
            ]
        },

        {
            name: "🔒 COUNCIL ROOM",
            private: true,
            channels: [
                "🗣-council-chat",
                "📌-council-announcements",
                // Only Administrator can see mod-logs — hidden from
                // Student Welfare and Student Council even though they can
                // see the rest of this category.
                { name: "📝-mod-logs", viewRestrictedTo: ["Administrator"] },
                "🗓-meeting-room"
            ]
        }

    ],

    voiceCategory: "🎙 VOICE CHANNELS",

    voiceChannels: [
        "🔊 General VC",
        "📖 Study Room 1",
        "📖 Study Room 2",
        "🗓 Meeting Room",
        "💤 AFK",
        "🎵 Music Room"
    ],

    // ── Channel name lookups used by features (welcome, logging, etc.) ──
    channelNames: {
        welcome: "👋-welcome",
        rules: "📜-rules",
        verify: "✅-verify-here",
        roleSelect: "🎭-role-select",
        modLogs: "📝-mod-logs",
        ticketPanel: "🎫-ticket-panel"
    },

    // ── Role selection wizard (posted as one flow in #role-select) ──────
    // Only step 0 is posted publicly. Picking a role there opens the next
    // step as an ephemeral (private) message, and so on down the list —
    // Year Level -> Program -> Notification Roles -> Game Roles.
    // The public entry message in #role-select never expires, so members
    // can always click it again later to change any of their picks —
    // exclusive steps swap the old pick for the new one, toggle steps just
    // re-apply whatever's checked when you press Continue/Finish.
    // exclusive: true  -> radio-button style, picking one sets it and
    //                     immediately advances to the next step.
    // exclusive: false -> checkbox style, toggle any number on/off, then
    //                     press Continue/Finish to save and advance.
    roleWizard: {
        steps: [
            {
                key: "yearLevel",
                title: "📚 Year Level",
                description: "Pick your year level.",
                color: 0xFEE75C,
                exclusive: true,
                roles: [
                    "1st Year",
                    "2nd Year",
                    "3rd Year",
                    "4th Year"
                ]
            },
            {
                key: "program",
                title: "🎓 Program",
                description: "Pick your program.",
                color: 0xEB459E,
                exclusive: true,
                roles: [
                    "BSCS",
                    "BSIT",
                    "BSIS",
                    "Diploma"
                ]
            },
            {
                key: "notification",
                title: "🔔 Notification Roles",
                description: "Pick what you want to be pinged for, then press Continue. You can select more than one.",
                color: 0x57F287,
                exclusive: false,
                roles: [
                    "📢 Announcements",
                    "🎓 Academic Updates",
                    "📅 Events"
                ]
            },
            {
                key: "gamer",
                title: "🎮 Game Roles",
                description: "Pick the games you play, then press Finish. You can select more than one — each one unlocks that game's channel and voice chat.",
                color: 0x5865F2,
                exclusive: false,
                roles: [
                    "Valorant",
                    "Mobile Legends",
                    "CODM",
                    "Roblox",
                    "Minecraft",
                    "League of Legends",
                    "Teamfight Tactics"
                ]
            }
        ]
    },

    // ── Interest role panel (posted in #role-select as its own, separate
    // message — NOT a step of roleWizard above, and not linked to it in
    // any way). Each button just toggles that one role on/off immediately
    // and unlocks the matching showcase channel via gateRole.
    interestPanel: {
        title: "🎨 Interest Roles",
        description: "Pick your interests to unlock extra channels below. Click a button again to remove it.",
        color: 0x1ABC9C,
        roles: [
            { name: "Innovator", emoji: "🚀", unlocks: "🖼-project-showcase" },
            { name: "Artist", emoji: "🎨", unlocks: "🎨-art-showcase" }
        ]
    },

    // ── Auto moderation ──────────────────────────────────────────────
    automod: {
        enabled: true,
        // Starter profanity list — expand freely in this array. Kept
        // short here; swap in whatever word list fits your community.
        bannedWords: [
            "fuck",
            "shit",
            "bitch",
            "asshole",
            "bastard",
            "dick",
            "puta",
            "putangina",
            "putanginamo",
            "gago",
            "gagoh",
            "gaguh",
            "gagu",
            "gaga",
            "tangina",
            "tanga",
            "ulol",
            "bobo",
            "leche",
            "punyeta",
            "hinayupak",
            "pakyu",
            "pakshet",
            "hayop ka",
            "peste"
        ],
        // Words/phrases that would otherwise trip a bannedWords match as a
        // false positive (e.g. "puta" inside "reputation", "dick" inside
        // "Dickinson") — matched and stripped out *before* the banned-word
        // check runs. Add to this list whenever a legitimate word collides
        // with something in bannedWords.
        profanityAllowlist: [
            "reputation",
            "reputable",
            "computation",
            "computational",
            "disputable",
            "disputation",
            "dickinson",
            "dickens"
        ],
        blockInviteLinks: true,
        maxMentionsPerMessage: 5,
        // Simple spam guard: N messages within windowMs from the same user
        spam: {
            maxMessages: 5,
            windowMs: 5000
        },
        // Auto-timeout ("limit") a member after repeated violations, on
        // top of whatever manual action staff take with /timeout, /kick,
        // or /ban.
        autoTimeout: {
            enabled: true,
            violationThreshold: 3,
            windowMs: 60 * 60 * 1000,
            timeoutMinutes: 10
        }
    },

    // ── Music ──────────────────────────────────────────────────────────
    // /play, /skip, /stop, /pause, /resume, /queue — gated to members
    // holding verifiedRole (or anyone in staffRoles). The bot joins
    // whichever voice channel the requester is in.
    music: {
        enabled: true,
        // If true, /play only works while the requester is sitting in
        // roomName below — keeps music out of study/meeting VCs. Set to
        // false to allow music in any voice channel.
        restrictToMusicRoom: true,
        roomName: "🎵 Music Room",
        maxQueueSize: 50,
        defaultVolume: 0.5,
        // Bot leaves the voice channel after this long with an empty queue
        idleTimeoutMs: 5 * 60 * 1000,
        // /play with a Spotify/Apple Music playlist/album link (or a
        // SoundCloud set) gets every track back in one Lavalink response
        // (resolved server-side by the LavaSrc plugin) — this just caps how
        // many of those get queued at once, also bounded by maxQueueSize.
        maxSpotifyPlaylistTracks: 25
    }

};
