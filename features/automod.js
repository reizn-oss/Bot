const config = require("../config/serverConfig");
const { logAction } = require("./logging");
const { recordViolation, recentViolations, clearViolations } = require("../utils/violations");

// userId -> array of message timestamps (ms), for the spam-rate check.
// Kept in-memory on purpose: the window is only 5 seconds, so losing this
// on a restart is harmless and a DB round-trip per message would be
// wasted overhead for something this short-lived.
const messageTimestamps = new Map();

const INVITE_REGEX = /(discord\.gg|discord(?:app)?\.com\/invite)\/\S+/i;

// Common leetspeak/lookalike substitutions used to dodge word filters
// (e.g. "g4g0", "g@go"). Applied before matching.
const LEET_MAP = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

// Cleans one token: leetspeak -> letters, drop any leftover punctuation/
// digits, then collapse letter-repeat spam ("gaaagooo" -> "gago").
function cleanToken(token) {

    let t = token.split("").map(ch => LEET_MAP[ch] ?? ch).join("");
    t = t.replace(/[^a-z]/g, "");
    t = t.replace(/([a-z])\1{2,}/g, "$1");

    return t;

}

/**
 * Normalizes a message into a space-separated list of cleaned tokens.
 * Deliberately keeps the space *between* separate words (so "light
 * angina" never collapses into something containing "tangina") while
 * still catching someone spelling a word out one letter per "word"
 * ("g a g o" -> merged into a single "gago" token before cleaning,
 * since every raw token in that run is exactly one character).
 */
function normalize(content) {

    const rawTokens = content.toLowerCase().split(/\s+/).filter(Boolean);
    const merged = [];
    let buffer = "";

    for (const tok of rawTokens) {
        if (tok.length === 1) {
            buffer += tok;
        } else {
            if (buffer) { merged.push(buffer); buffer = ""; }
            merged.push(tok);
        }
    }
    if (buffer) merged.push(buffer);

    return merged.map(cleanToken).filter(Boolean).join(" ");

}

function containsBannedWord(content) {

    const normalized = normalize(content);

    // Strip out allowlisted words first so a banned word that only
    // appears as a substring of a legitimate word (e.g. "puta" inside
    // "reputation") doesn't false-positive. Since normalize() preserves
    // spaces between real words, this can't accidentally eat a genuine
    // banned word that happens to share letters with an allowlisted one.
    let scrubbed = normalized;
    for (const safe of config.automod.profanityAllowlist || []) {
        const cleanSafe = normalize(safe);
        if (cleanSafe) scrubbed = scrubbed.split(cleanSafe).join("");
    }

    return config.automod.bannedWords.some(word => {
        const cleanWord = normalize(word);
        return cleanWord && scrubbed.includes(cleanWord);
    });

}

function isSpamming(userId) {

    const now = Date.now();
    const { maxMessages, windowMs } = config.automod.spam;

    const timestamps = (messageTimestamps.get(userId) || [])
        .filter(t => now - t < windowMs);

    timestamps.push(now);
    messageTimestamps.set(userId, timestamps);

    return timestamps.length > maxMessages;

}

/**
 * Tracks violations per user (persisted in SQLite so counts survive a
 * restart/redeploy) and auto-times-out ("limits") them once they cross
 * the configured threshold within the configured window. This is on top
 * of whatever staff do manually with /timeout, /kick, or /ban.
 */
async function trackViolationAndMaybeLimit(message) {

    const { enabled, violationThreshold, windowMs, timeoutMinutes } = config.automod.autoTimeout;
    if (!enabled) return;

    const guildId = message.guild.id;
    const userId = message.author.id;

    recordViolation(guildId, userId);

    const recent = recentViolations(guildId, userId, windowMs);

    if (recent.length < violationThreshold) return;

    // Reset the counter now that an escalation is firing.
    clearViolations(recent.map(v => v.id));

    const member = message.member;
    if (!member || !member.moderatable) return;

    await member.timeout(timeoutMinutes * 60 * 1000, "Automatic: repeated auto-mod violations").catch(() => {});

    await logAction(message.guild, {
        title: "⏳ Auto-Timeout (Limited)",
        description: `${member} was automatically timed out for ${timeoutMinutes} minute(s) after ${recent.length} violations in the last ${Math.round(windowMs / 60000)} minute(s).`,
        color: 0xED4245
    });

}

async function warn(message, reason) {

    await message.delete().catch(() => {});

    await message.channel.send({
        content: `${message.author}, your message was removed: **${reason}**`
    }).then(m => setTimeout(() => m.delete().catch(() => {}), 6000))
      .catch(() => {});

    await logAction(message.guild, {
        title: "🛡️ Auto-mod Action",
        description: `Deleted a message from ${message.author} in ${message.channel}`,
        color: 0xFEE75C,
        fields: [
            { name: "Reason", value: reason },
            { name: "Content", value: message.content?.slice(0, 500) || "(no text content)" }
        ]
    });

    await trackViolationAndMaybeLimit(message);

}

async function handleMessage(message) {

    if (!config.automod.enabled) return;
    if (message.author.bot) return;
    if (!message.guild) return;

    // Staff are exempt
    const isStaff = message.member?.roles.cache.some(r =>
        config.staffRoles.includes(r.name)
    );
    if (isStaff) return;

    if (containsBannedWord(message.content)) {
        return warn(message, "vulgar/blocked word");
    }

    if (config.automod.blockInviteLinks && INVITE_REGEX.test(message.content)) {
        return warn(message, "invite links aren't allowed here");
    }

    if (message.mentions.users.size > config.automod.maxMentionsPerMessage) {
        return warn(message, "too many mentions");
    }

    if (isSpamming(message.author.id)) {
        return warn(message, "sending messages too quickly");
    }

}

module.exports = { handleMessage };
