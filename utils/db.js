const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// Persistent storage for warnings + automod violation counters, so both
// survive a restart/redeploy on Katabump instead of resetting to zero.
const dataDir = path.join(__dirname, "..", "data");

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, "infocorebot.db"));

// WAL mode = safer/faster for a process that's writing frequently
// (automod violations) while a 24/7 process manager might restart it.
db.pragma("journal_mode = WAL");

db.exec(`
    CREATE TABLE IF NOT EXISTS warnings (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        guildId     TEXT NOT NULL,
        userId      TEXT NOT NULL,
        moderatorId TEXT NOT NULL,
        reason      TEXT NOT NULL,
        createdAt   INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_warnings_guild_user
        ON warnings (guildId, userId);

    CREATE TABLE IF NOT EXISTS automod_violations (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        guildId   TEXT NOT NULL,
        userId    TEXT NOT NULL,
        createdAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_violations_guild_user
        ON automod_violations (guildId, userId);
`);

module.exports = db;
