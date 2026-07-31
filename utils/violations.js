const db = require("./db");

const insertViolation = db.prepare(`
    INSERT INTO automod_violations (guildId, userId, createdAt)
    VALUES (?, ?, ?)
`);

const selectRecent = db.prepare(`
    SELECT id, createdAt FROM automod_violations
    WHERE guildId = ? AND userId = ? AND createdAt > ?
    ORDER BY createdAt ASC
`);

const deleteById = db.prepare(`DELETE FROM automod_violations WHERE id = ?`);

const deleteOlderThan = db.prepare(`DELETE FROM automod_violations WHERE createdAt < ?`);

const clearTransaction = db.transaction((ids) => {
    for (const id of ids) deleteById.run(id);
});

function recordViolation(guildId, userId) {
    insertViolation.run(guildId, userId, Date.now());
}

// Returns the violation rows (id + createdAt) still inside the window.
function recentViolations(guildId, userId, windowMs) {
    return selectRecent.all(guildId, userId, Date.now() - windowMs);
}

// Wipes a specific set of violation rows (used right after an
// escalation fires, so the counter resets to zero).
function clearViolations(ids) {
    if (ids.length) clearTransaction(ids);
}

// Housekeeping — call periodically so the table doesn't grow forever.
function pruneOldViolations(maxAgeMs) {
    deleteOlderThan.run(Date.now() - maxAgeMs);
}

module.exports = { recordViolation, recentViolations, clearViolations, pruneOldViolations };
