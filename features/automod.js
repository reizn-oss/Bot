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
//
// Only collapses runs of 3+ repeated letters, not 2+. A more aggressive
// 2+ threshold was tried and reverted: several of the words we need to
// match (e.g. "nigger", "coon", "faggot") contain a natural double
// letter, and collapsing that away turns them into short, generic
// strings that collide with completely innocent words — "coon" -> "con"
// then matches inside "control"/"contact"/"continue", and "nigger" ->
// "niger" then matches inside "Nigeria". Catching every possible
// obfuscation isn't worth silently flagging normal conversation; the
// leetspeak map + letter-by-letter spelling defense below still catch
// the common evasions without this collateral damage.
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

// Strips allowlisted words first so a banned word that only appears as a
// substring of a legitimate word (e.g. "puta" inside "reputation")
// doesn't false-positive. Since normalize() preserves spaces between
// real words, this can't accidentally eat a genuine banned word that
// happens to share letters with an allowlisted one.
function scrubAllowlisted(normalized) {

    let scrubbed = normalized;
    for (const safe of config.automod.profanityAllowlist || []) {
        const cleanSafe = normalize(safe);
        if (cleanSafe) scrubbed = scrubbed.split(cleanSafe).join("");
    }
    return scrubbed;

}

function matchesWordList(content, wordList) {

    const scrubbed = scrubAllowlisted(normalize(content));

    return (wordList || []).some(word => {
        const cleanWord = normalize(word);
        return cleanWord && scrubbed.includes(cleanWord);
    });

}

function containsBannedWord(content) {
    return matchesWordList(content, config.automod.bannedWords);
}

// Slurs/hate speech — checked separately from the regular profanity list
// so it can get an immediate, harsher response instead of the normal
// delete-and-count-toward-threshold flow. Goes through the exact same
// normalize()/leetspeak/letter-repeat/allowlist pipeline as
// containsBannedWord, so obfuscated variants are still caught.
function containsSevereWord(content) {
    return matchesWordList(content, config.automod.severeWords);
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

    if (!member || !member.moderatable) {

        // This is the #1 cause of "auto-timeout doesn't seem to do
        // anything" reports: the bot's own role sits below the member's
        // highest role (or the bot lacks Timeout Members), so Discord
        // silently refuses the timeout. Surface it instead of failing
        // quietly so staff can actually fix the role order.
        await logAction(message.guild, {
            title: "⚠️ Auto-Timeout Failed",
            description: `${message.author} crossed the auto-mod violation threshold (${recent.length} in ${Math.round(windowMs / 60000)} minute(s)), but I couldn't time them out — check that my role is above theirs and that I have the "Timeout Members" permission.`,
            color: 0xED4245
        });

        return;

    }

    try {

        await member.timeout(timeoutMinutes * 60 * 1000, "Automatic: repeated auto-mod violations");

        await logAction(message.guild, {
            title: "⏳ Auto-Timeout (Limited)",
            description: `${member} was automatically timed out for ${timeoutMinutes} minute(s) after ${recent.length} violations in the last ${Math.round(windowMs / 60000)} minute(s). This expires on its own — Discord handles the countdown server-side, not the bot, so it lifts on schedule even through restarts/redeploys.`,
            color: 0xED4245
        });

    } catch (err) {

        await logAction(message.guild, {
            title: "⚠️ Auto-Timeout Failed",
            description: `${member} crossed the auto-mod violation threshold, but the timeout request itself errored: ${err.message}`,
            color: 0xED4245
        });

    }

}

/**
 * Handles a slur/hate-speech hit: deletes the message, immediately times
 * the member out (no threshold/warning grace period — one message is
 * enough), and logs it distinctly from a normal auto-mod action so staff
 * can spot it in #mod-logs at a glance.
 */
async function handleSevereWord(message) {

    await message.delete().catch(() => {});

    const { timeoutMinutes } = config.automod.severeAction;
    const member = message.member;

    let timeoutApplied = false;

    if (member && member.moderatable) {
        await member.timeout(timeoutMinutes * 60 * 1000, "Automatic: hate speech / slur detected")
            .then(() => { timeoutApplied = true; })
            .catch(() => {});
    }

    await logAction(message.guild, {
        title: "🚫 Hate Speech Detected",
        description: timeoutApplied
            ? `${message.author} was auto-timed-out for ${timeoutMinutes} minute(s) in ${message.channel} for using a slur/hate speech. This requires manual review — consider a kick/ban.`
            : `${message.author} used a slur/hate speech in ${message.channel}, but I couldn't time them out automatically — check role hierarchy and my "Timeout Members" permission. **Manual action needed.**`,
        color: 0x992D22
    });

    // Also feed it into the regular violation tracker, so a repeat
    // offender still escalates toward /ban even if staff don't act on
    // the log above right away.
    await trackViolationAndMaybeLimit(message);

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

    // No role exemption: automod runs on every member's messages,
    // staff included. Note that Discord itself still refuses to time
    // out anyone with the Administrator permission (that's enforced
    // server-side by Discord, not by this bot), so a true Administrator
    // will still show up as a "couldn't time out — manual action
    // needed" log entry rather than actually being muted; every other
    // role, including Student Council/Computer Society, is fully in
    // scope.

    if (containsSevereWord(message.content)) {
        return handleSevereWord(message);
    }

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
