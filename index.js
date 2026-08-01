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
// it what to play. Node details are env-driven since public nodes go up and
// down; swap the LAVALINK_* vars in Render's/Katabump's env vars to switch
// nodes without touching code.
//
// Three nodes are configured, not one — and deliberately from three
// *different* operators/providers, not just three different hostnames.
// Free public Lavalink nodes fail in two ways: fully disconnected (which
// lavalink-client already detects and reconnects on its own), and — more
// annoyingly — connected but returning broken/HTML responses to a specific
// search request while a shared node is overloaded, has an expired/rotated
// password, or the proxy in front of it is erroring out (that's what an
// "Unexpected token '<' ... is not valid JSON" error means: the node sent
// back an HTML error page instead of a JSON response). That second kind
// isn't something reconnect logic catches, since the node's WebSocket
// never actually drops. Earlier versions of this file pointed both nodes
// at serenetia.com — which turned out to be the same operator under two
// hostnames, so one password rotation (dsc.gg/ajidevserver ->
// seretia.link/discord, mid-2026) silently broke *both* "nodes" at once.
// Fixed here by using three genuinely independent hosts; music.js
// (searchWithFailover) walks through every other connected node in turn
// on a broken search before giving up. See
// https://lavalink.darrennathanael.com/ for more/fresher options if all
// three of these are ever down at once — that page is updated regularly
// and is the source of truth for current host/port/password, not this file.
client.lavalink = new LavalinkManager({
    nodes: [
        {
            id: process.env.LAVALINK_NODE_ID || 'node-1',
            host: process.env.LAVALINK_HOST || 'lavalinkv4.serenetia.com',
            port: Number(process.env.LAVALINK_PORT) || 443,
            authorization: process.env.LAVALINK_PASSWORD || 'https://seretia.link/discord',
            secure: process.env.LAVALINK_SECURE !== 'false'
        },
        {
            id: process.env.LAVALINK_NODE_ID2 || 'node-2',
            host: process.env.LAVALINK_HOST2 || 'lava-v4.millohost.my.id',
            port: Number(process.env.LAVALINK_PORT2) || 443,
            authorization: process.env.LAVALINK_PASSWORD2 || 'https://discord.gg/mjS5J2K3ep',
            secure: process.env.LAVALINK_SECURE2 !== 'false'
        },
        {
            id: process.env.LAVALINK_NODE_ID3 || 'node-3',
            host: process.env.LAVALINK_HOST3 || 'lavalink-v4.triniumhost.com',
            port: Number(process.env.LAVALINK_PORT3) || 443,
            authorization: process.env.LAVALINK_PASSWORD3 || 'free',
            secure: process.env.LAVALINK_SECURE3 !== 'false'
        }
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
        // YouTube search (ytsearch) is the historical default, but YouTube
        // has been aggressively blocking/rate-limiting requests from cloud
        // hosting IPs (Render, most VPS providers), which is why /play was
        // failing even with a connected node. SoundCloud search (scsearch)
        // doesn't have that problem, so it's the new default — override
        // with MUSIC_SEARCH_PLATFORM in your env if you want ytsearch,
        // ytmsearch, etc. back (only works if your Lavalink node has that
        // source enabled).
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

client.login(process.env.TOKEN);
