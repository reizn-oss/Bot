require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    Collection,
    Events
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const { handleButtonInteraction } = require('./interactions/buttonHandler');
const { handleMemberAdd, handleMemberRemove } = require('./features/welcome');
const { handleMessage: handleAutomod } = require('./features/automod');
const { handleMessageDelete, handleMessageUpdate } = require('./features/messageLog');
const { registerLavalinkEvents } = require('./features/music');
const { LavalinkManager } = require('lavalink-client');

// Opens/creates the SQLite file on first require and fails fast at boot
// if the data directory isn't writable, instead of surfacing as a
// mysterious crash the first time someone gets warned or auto-timed-out.
require('./utils/db');
const { pruneOldViolations } = require('./utils/violations');

// ── 24/7 crash protection ─────────────────────────────────────────────
// discord.js already auto-reconnects on dropped gateway connections; these
// two handlers stop a single bad promise/error from taking the whole
// process down. Pair this with a process manager (see ecosystem.config.js
// / README "Keeping the bot online 24/7") so the OS restarts it if it
// ever does exit.
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});

// Optional tiny HTTP server so free/sleep-prone hosts (e.g. Replit) can be
// pinged awake by an uptime monitor. Not needed on a VPS/pm2 setup — only
// starts if ENABLE_KEEPALIVE=true is set in .env.
if (process.env.ENABLE_KEEPALIVE === 'true') {
    require('./keepAlive')();
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Message, Partials.Channel]
});

client.commands = new Collection();

// Lavalink handles the actual audio fetching/decoding — this bot just tells
// it what to play. Node details are env-driven so you can point this at any
// node without touching code.
//
// This used to point at three free, third-party public Lavalink nodes.
// Those fail in two ways: fully disconnected (which lavalink-client already
// detects and reconnects on its own), and — more annoyingly — connected but
// returning broken/HTML responses to a specific search request while a
// shared node is overloaded, has an expired/rotated password, or the proxy
// in front of it is erroring out (that's what the "403 Unexpected server
// response" / "Unexpected token '<' ... is not valid JSON" errors meant).
// That's not something reconnect logic catches, since the node's WebSocket
// never actually drops — it just quietly stops working.
//
// This now points at a self-hosted node instead (see /lavalink-server in
// this repo, deployed as a second Render service) — you control it, so
// there's no third-party password rotation or overload to break /play out
// from under you. It also runs the LavaSrc plugin, so Spotify/Apple Music
// links resolve natively at the node instead of the bot scraping Spotify's
// web player internals in JS (see utils/spotify.js).
//
// A second/third node can still be added below for failover if you want
// belt-and-suspenders — music.js (searchWithFailover) will walk through
// every other *connected* node on a broken search before giving up.
client.lavalink = new LavalinkManager({
    nodes: [
        {
            id: process.env.LAVALINK_NODE_ID || 'node-1',
            host: process.env.LAVALINK_HOST,
            port: Number(process.env.LAVALINK_PORT) || 443,
            authorization: process.env.LAVALINK_PASSWORD,
            secure: process.env.LAVALINK_SECURE !== 'false'
        }
        // Optional second node for failover — only added if configured.
        // Uncomment and set LAVALINK_HOST2/PORT2/PASSWORD2/SECURE2 in .env
        // if you stand up a backup node (your own second instance, or a
        // fresh node from https://lavalink.darrennathanael.com/).
        // {
        //     id: process.env.LAVALINK_NODE_ID2 || 'node-2',
        //     host: process.env.LAVALINK_HOST2,
        //     port: Number(process.env.LAVALINK_PORT2) || 443,
        //     authorization: process.env.LAVALINK_PASSWORD2,
        //     secure: process.env.LAVALINK_SECURE2 !== 'false'
        // }
    ],
    sendToShard: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    },
    client: {
        id: process.env.CLIENT_ID,
        username: 'InfoCoreBot'
    },
    autoSkip: true,
    playerOptions: {
        // SoundCloud search (scsearch) instead of YouTube (ytsearch) —
        // YouTube aggressively blocks/rate-limits requests from cloud
        // hosting IPs (Render, most VPS providers), which is why /play was
        // failing even with a connected node. This is also the source
        // LavaSrc falls back to for Spotify/Apple Music tracks (see
        // lavalink-server/application.yml's "providers" section) so the
        // whole pipeline avoids YouTube consistently.
        defaultSearchPlatform: process.env.MUSIC_SEARCH_PLATFORM || 'scsearch',
        onDisconnect: { autoReconnect: true, destroyPlayer: false },
        onEmptyQueue: { destroyAfterMs: 30_000 }
    }
});

registerLavalinkEvents(client);

// Lavalink needs raw voice-state/voice-server gateway events forwarded to it
// to manage voice connections.
client.on('raw', d => client.lavalink.sendRawData(d));

const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {

    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {

        const command = require(path.join(commandsPath, file));

        if (command.data && command.execute) {
            client.commands.set(command.data.name, command);
        }
    }
}

client.once(Events.ClientReady, async readyClient => {
    console.log(`✅ ${readyClient.user.tag} is online!`);
    await client.lavalink.init({ ...readyClient.user });
});

// Housekeeping: drop automod violation rows older than 24h once an hour
// so the SQLite table doesn't grow forever on a long-running 24/7 bot.
setInterval(() => {
    pruneOldViolations(24 * 60 * 60 * 1000);
}, 60 * 60 * 1000);

// Visibility into reconnects/outages — useful when checking logs on a
// 24/7 host to confirm the bot recovered from a network blip on its own.
client.on(Events.ShardDisconnect, (event, shardId) => {
    console.warn(`⚠️ Shard ${shardId} disconnected (code ${event.code}). Reconnecting...`);
});

client.on(Events.ShardReconnecting, (shardId) => {
    console.log(`🔄 Shard ${shardId} reconnecting...`);
});

client.on(Events.ShardResume, (shardId) => {
    console.log(`✅ Shard ${shardId} resumed.`);
});

client.on(Events.Error, (err) => {
    console.error('Client error:', err);
});

// Slash commands + buttons (verify, reaction roles, tickets, poll votes)
client.on(Events.InteractionCreate, async interaction => {

    try {

        if (interaction.isChatInputCommand()) {

            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            await command.execute(interaction);

        } else if (interaction.isButton()) {

            await handleButtonInteraction(interaction);

        }

    } catch (error) {

        console.error(error);

        if (!interaction.replied && !interaction.deferred) {

            await interaction.reply({
                content: "❌ Something went wrong.",
                flags: 64
            }).catch(() => {});

        } else {

            await interaction.followUp({
                content: "❌ Something went wrong.",
                flags: 64
            }).catch(() => {});

        }

    }

});

// Welcome embed + auto-assign Unverified role
client.on(Events.GuildMemberAdd, member => {
    handleMemberAdd(member).catch(err => console.error("welcome/join handler error:", err));
});

client.on(Events.GuildMemberRemove, member => {
    handleMemberRemove(member).catch(err => console.error("leave handler error:", err));
});

// Auto moderation
client.on(Events.MessageCreate, message => {
    handleAutomod(message).catch(err => console.error("automod error:", err));
});

// Logging: message edits/deletes
client.on(Events.MessageDelete, message => {
    handleMessageDelete(message).catch(err => console.error("message log error:", err));
});

client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
    handleMessageUpdate(oldMessage, newMessage).catch(err => console.error("message log error:", err));
});

// Sanity-check + explicit success/failure logging around login, so a bad
// or missing token shows up clearly in the deploy logs instead of just
// silently never reaching ClientReady. This does NOT print the token
// itself anywhere — only its length — so it's safe to leave in logs.
const rawToken = process.env.TOKEN;
console.log(`🔑 TOKEN env var present: ${Boolean(rawToken)}, length: ${rawToken ? rawToken.length : 0}`);

if (!rawToken) {
    console.error('❌ TOKEN is missing/empty in this environment. The process will now attempt login and fail — check the Environment tab on Render for a variable named exactly "TOKEN" (no extra spaces in the name).');
}

// REST self-check: hits Discord's REST API directly (no WebSocket/gateway
// involved) with this token, BEFORE attempting the gateway login. This
// isolates "is the token itself valid" from "is the gateway handshake
// hanging" — the two symptoms look identical from the outside (silence in
// the logs) but need completely different fixes. This call cannot hang
// the way the gateway can; it either gets an HTTP response or it doesn't.
async function restSelfCheck() {
    if (!rawToken) return;
    try {
        const res = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bot ${rawToken}` }
        });
        if (res.ok) {
            const me = await res.json();
            console.log(`🌐 REST self-check OK — token is valid for application "${me.username}" (id ${me.id}). If the gateway still hangs after this, the token is fine and the problem is specifically the WebSocket handshake (duplicate session, network/proxy block, or Discord-side outage).`);
        } else if (res.status === 429) {
            const retryAfter = res.headers.get('retry-after');
            const body = await res.text().catch(() => '');
            console.error(`🌐 REST self-check RATE LIMITED — Discord returned HTTP 429 for this token/IP. Retry-After: ${retryAfter ?? 'not provided'} seconds. Body: ${body}. This is NOT a bad token — it means Discord (or Render's shared outbound IP, which other apps also use) is throttling requests. This commonly happens after several rapid redeploys/restarts in a short window. Fix: stop redeploying for a few minutes and let the limit clear, then deploy once and leave it running — do not repeatedly restart to "test" while rate limited, as that resets the backoff.`);
        } else {
            console.error(`🌐 REST self-check FAILED — Discord's API rejected this token with HTTP ${res.status} ${res.statusText}. This means the TOKEN value set in this environment is wrong/stale (not a gateway or intents issue) — go back to the Developer Portal → Bot page and click "Reset Token", then update it on Render.`);
        }
    } catch (err) {
        console.error('🌐 REST self-check errored (network issue reaching Discord\'s API from this environment):', err);
    }
}

console.log('🔐 Attempting Discord login...');
restSelfCheck();

// Watchdog: client.login() can hang forever with ZERO error output if the
// gateway handshake never completes — most commonly because a privileged
// intent this bot requests (GuildMembers / MessageContent) is toggled OFF
// in the Discord Developer Portal (Bot page → Privileged Gateway Intents),
// or because another running instance is holding/conflicting with the
// session for this same token. Neither of those rejects the login()
// promise, so without this timer the logs just stop after "Attempting
// Discord login..." with no indication of what's wrong.
let loginSettled = false;

const loginWatchdog = setTimeout(() => {
    if (!loginSettled) {
        console.error(
            '⏱️ Still not logged in 20s after calling client.login(). ' +
            'This almost always means one of: (1) a privileged intent ' +
            '(SERVER MEMBERS INTENT / MESSAGE CONTENT INTENT) is disabled ' +
            'in the Discord Developer Portal for this bot, (2) another ' +
            'process/deploy is already running with this same TOKEN, or ' +
            '(3) the TOKEN in this environment is stale/invalid in a way ' +
            'that did not raise a rejection. The process will keep running ' +
            'in case it eventually connects, but treat this as a real problem.'
        );
    }
}, 20_000);

client.login(rawToken)
    .then(() => {
        loginSettled = true;
        clearTimeout(loginWatchdog);
        console.log('✅ login() resolved — waiting for ClientReady...');
    })
    .catch(err => {
        loginSettled = true;
        clearTimeout(loginWatchdog);
        console.error('❌ client.login() rejected:', err);
    });
