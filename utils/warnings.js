const db = require("./db");

const insertWarning = db.prepare(`
    INSERT INTO warnings (guildId, userId, moderatorId, reason, createdAt)
    VALUES (@guildId, @userId, @moderatorId, @reason, @createdAt)
`);

const selectWarnings = db.prepare(`
    SELECT * FROM warnings
    WHERE guildId = ? AND userId = ?
    ORDER BY createdAt DESC
`);

const selectCount = db.prepare(`
    SELECT COUNT(*) AS count FROM warnings
    WHERE guildId = ? AND userId = ?
`);

const deleteWarnings = db.prepare(`
    DELETE FROM warnings WHERE guildId = ? AND userId = ?
`);

function addWarning(guildId, userId, moderatorId, reason) {
    insertWarning.run({ guildId, userId, moderatorId, reason, createdAt: Date.now() });
}

function listWarnings(guildId, userId) {
    return selectWarnings.all(guildId, userId);
}

function warningCount(guildId, userId) {
    return selectCount.get(guildId, userId).count;
}

function clearAllWarnings(guildId, userId) {
    return deleteWarnings.run(guildId, userId).changes;
}

module.exports = { addWarning, listWarnings, warningCount, clearAllWarnings };
