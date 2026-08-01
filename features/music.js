const { EmbedBuilder } = require("discord.js");

const config = require("../config/serverConfig");
const spotify = require("../utils/spotify");

// With Lavalink, the actual audio fetching/decoding/sending happens on the
// Lavalink node, not in this process — this file just tells the node what
// to play and reacts to its events. No @discordjs/voice connection code,
// no local streams, no ffmpeg needed here anymore.

function isSoundcloudUrl(query) {
    return /^https?:\/\/(www\.|m\.)?(soundcloud\.com|snd\.sc)\//i.test(query.trim());
}

/**
 * Free public Lavalink nodes fail in two ways: fully disconnected (which
 * lavalink-client already detects and reconnects on its own), and — more
 * annoyingly — connected but returning broken/HTML responses to a specific
 * search request while a node is overloaded, mid-restart, or sitting
 * behind a proxy that's erroring out (rotated/wrong password, etc.). That
 * second kind isn't something reconnect logic catches, since the node
 * never actually drops its WebSocket. So: if a search throws, walk through
 * every *other* currently-connected node (player.moveNode(id)) and retry
 * the search on each one in turn before giving up — not just a single
 * alternate. See index.js for the configured node list.
 */
async function searchWithFailover(player, searchOpts, requestUser) {

    try {
        return await player.search(searchOpts, requestUser);
    } catch (firstErr) {

        const client = player.LavalinkManager;
        const originalNodeId = player.node?.id;

        const otherNodeIds = Array.from(client.nodeManager.nodes.values())
            .filter(node => node.connected && node.id !== originalNodeId)
            .map(node => node.id);

        let lastErr = firstErr;

        for (const nodeId of otherNodeIds) {

            try {
                await player.moveNode(nodeId);
            } catch {
                continue; // that node disappeared/rejected the move — try the next one
            }

            try {
                return await player.search(searchOpts, requestUser);
            } catch (err) {
                lastErr = err;
            }

        }

        throw lastErr;

    }

}

function canRequestMusic(member) {

    const roleNames = member.roles.cache.map(r => r.name);

    return roleNames.includes(config.verifiedRole) ||
        roleNames.some(r => config.staffRoles.includes(r));

}

// Called once from index.js after the LavalinkManager is created, to wire
// up now-playing / queue-end announcements and node connection logging.
function registerLavalinkEvents(client) {

    client.lavalink.on("trackStart", (player, track) => {

        const channel = client.channels.cache.get(player.textChannelId);
        if (!channel) return;

        channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🎵 Now Playing")
                    .setDescription(`[${track.info.title}](${track.info.uri})`)
                    .setColor(0x5865F2)
                    .setFooter({ text: `Requested by ${track.requester?.username ?? track.requester?.tag ?? "Unknown"}` })
            ]
        }).catch(() => {});

    });

    client.lavalink.on("trackError", (player, track, payload) => {

        console.error("Lavalink track error:", payload?.exception?.message || payload);

        const channel = client.channels.cache.get(player.textChannelId);
        if (channel && track) {
            channel.send(`❌ Couldn't play **${track.info?.title ?? "that track"}** — skipping.`).catch(() => {});
        }

    });

    client.lavalink.on("queueEnd", (player) => {

        const channel = client.channels.cache.get(player.textChannelId);
        if (channel) channel.send("👋 Queue finished — leaving the voice channel.").catch(() => {});

        player.destroy().catch(() => {});

    });

    client.lavalink.nodeManager.on("connect", (node) => {
        console.log(`Lavalink node "${node.id}" connected.`);
    });

    client.lavalink.nodeManager.on("error", (node, error) => {
        console.error(`Lavalink node "${node.id}" error:`, error?.message || error);
    });

    client.lavalink.nodeManager.on("disconnect", (node) => {
        console.warn(`Lavalink node "${node.id}" disconnected.`);
    });

}

function hasConnectedNode(client) {
    return Array.from(client.lavalink.nodeManager.nodes.values()).some(node => node.connected);
}

async function getOrCreatePlayer(interaction, voiceChannel) {

    const client = interaction.client;
    let player = client.lavalink.getPlayer(interaction.guild.id);

    if (!player) {
        player = client.lavalink.createPlayer({
            guildId: interaction.guild.id,
            voiceChannelId: voiceChannel.id,
            textChannelId: interaction.channel.id,
            selfDeaf: true,
            selfMute: false,
            volume: Math.round((config.music.defaultVolume ?? 0.5) * 100)
        });
    }

    if (!player.connected) {
        await player.connect();
    }

    return player;

}

async function enqueue(interaction, query) {

    const member = interaction.member;

    if (!config.music.enabled) {
        return interaction.reply({ content: "❌ Music is currently disabled.", flags: 64 });
    }

    if (!canRequestMusic(member)) {
        return interaction.reply({ content: "❌ You need the Verified role to request music.", flags: 64 });
    }

    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
        return interaction.reply({ content: "❌ Join a voice channel first.", flags: 64 });
    }

    if (config.music.restrictToMusicRoom && voiceChannel.name !== config.music.roomName) {
        return interaction.reply({
            content: `❌ Music requests only work in **${config.music.roomName}**. Join that voice channel and try again.`,
            flags: 64
        });
    }

    if (!hasConnectedNode(interaction.client)) {
        return interaction.reply({ content: "❌ Music backend isn't connected right now — try again in a moment.", flags: 64 });
    }

    await interaction.deferReply();

    const player = await getOrCreatePlayer(interaction, voiceChannel);

    if (spotify.isSpotifyLink(query)) {
        return enqueueSpotify(interaction, player, query);
    }

    return enqueueSingleQuery(interaction, player, query);

}

function describeMusicLookupError(err) {

    // A raw "Unexpected token '<' ... is not valid JSON" means a Lavalink
    // node sent back an HTML page instead of a JSON response — almost
    // always a wrong/rotated node password or the node's proxy erroring
    // out, not anything wrong with the query itself.
    if (/unexpected token/i.test(err.message) && /json/i.test(err.message)) {
        return "the music backend node(s) sent back an invalid response (likely a stale node password or the node itself is down) — see index.js/.env for how to swap in fresh nodes from https://lavalink.darrennathanael.com/.";
    }

    return err.message;

}

async function enqueueSingleQuery(interaction, player, query) {

    let res;

    try {
        res = await searchWithFailover(player, {
            query,
            source: isSoundcloudUrl(query) ? "soundcloud" : undefined
        }, interaction.user);
    } catch (err) {
        return interaction.editReply(`❌ Couldn't look that up: ${describeMusicLookupError(err)}`);
    }

    if (!res || res.loadType === "error" || res.loadType === "empty" || !res.tracks?.length) {
        return interaction.editReply("❌ No results found.");
    }

    const track = res.tracks[0];

    if (config.music.maxQueueSize && player.queue.tracks.length >= config.music.maxQueueSize) {
        return interaction.editReply("❌ The queue is full — try again once it's shorter.");
    }

    await player.queue.add(track);

    if (!player.playing && !player.paused) {
        await interaction.editReply(`🎵 Playing **${track.info.title}** now.`);
        await player.play();
    } else {
        await interaction.editReply(`➕ Queued **${track.info.title}** (position ${player.queue.tracks.length}).`);
    }

}

/**
 * Spotify's API only ever gives back metadata (track/artist names) — it
 * doesn't let anyone stream its actual audio outside Spotify's own apps.
 * So for a playlist/album/track link, we resolve the track names via the
 * Spotify Web API, then run each one through the same YouTube search
 * Lavalink already uses for a plain /play query, and queue whatever
 * matches. Sequential on purpose: this hits a shared free Lavalink node,
 * and firing 25+ searches at once would be a bad neighbor to it.
 */
async function enqueueSpotify(interaction, player, query) {

    let resolved;

    try {
        const cap = Math.max(1, config.music.maxSpotifyPlaylistTracks ?? 25);
        resolved = await spotify.resolveSpotifyLink(query, cap);
    } catch (err) {
        return interaction.editReply(`❌ ${err.message}`);
    }

    if (!resolved || !resolved.tracks.length) {
        return interaction.editReply("❌ Couldn't find any tracks in that Spotify link.");
    }

    const spaceLeft = config.music.maxQueueSize
        ? Math.max(0, config.music.maxQueueSize - player.queue.tracks.length)
        : resolved.tracks.length;

    if (spaceLeft === 0) {
        return interaction.editReply("❌ The queue is full — try again once it's shorter.");
    }

    const toQueue = resolved.tracks.slice(0, spaceLeft);
    const wasIdle = !player.playing && !player.paused;

    let queued = 0;
    let firstTrackTitle = null;

    for (const spotifyTrack of toQueue) {

        let res;
        try {
            res = await searchWithFailover(player, { query: spotify.trackToQuery(spotifyTrack) }, interaction.user);
        } catch {
            continue;
        }

        const track = res?.tracks?.[0];
        if (!track) continue;

        await player.queue.add(track);
        queued++;
        if (!firstTrackTitle) firstTrackTitle = track.info.title;

    }

    if (queued === 0) {
        return interaction.editReply("❌ Found that Spotify link, but couldn't find a matching track on YouTube for any of it.");
    }

    if (wasIdle) await player.play();

    const skipped = toQueue.length - queued;
    const truncatedNote = resolved.tracks.length > spaceLeft ? ` (queue only had room for ${spaceLeft})` : "";
    const skippedNote = skipped > 0 ? ` (${skipped} skipped — no YouTube match found)` : "";

    const summary = wasIdle
        ? `🎵 Playing **${firstTrackTitle}** now — queued ${queued} track${queued === 1 ? "" : "s"} from **${resolved.name}**${truncatedNote}${skippedNote}.`
        : `➕ Queued ${queued} track${queued === 1 ? "" : "s"} from **${resolved.name}**${truncatedNote}${skippedNote}.`;

    await interaction.editReply(summary);

}

function requireActivePlayer(interaction) {

    const player = interaction.client.lavalink.getPlayer(interaction.guild.id);

    if (!player || (!player.playing && !player.paused)) {
        interaction.reply({ content: "❌ Nothing is playing right now.", flags: 64 });
        return null;
    }

    return player;

}

async function skip(interaction) {

    const player = requireActivePlayer(interaction);
    if (!player) return;

    const current = player.queue.current;
    await player.skip();

    await interaction.reply(`⏭️ Skipped **${current?.info?.title ?? "the current track"}**.`);

}

async function stop(interaction) {

    const player = interaction.client.lavalink.getPlayer(interaction.guild.id);

    if (!player) {
        return interaction.reply({ content: "❌ Nothing is playing right now.", flags: 64 });
    }

    await player.destroy();

    await interaction.reply("⏹️ Stopped playback and left the voice channel.");

}

async function pause(interaction) {

    const player = requireActivePlayer(interaction);
    if (!player) return;

    if (player.paused) {
        return interaction.reply({ content: "❌ Already paused.", flags: 64 });
    }

    await player.pause();
    await interaction.reply("⏸️ Paused.");

}

async function resume(interaction) {

    const player = requireActivePlayer(interaction);
    if (!player) return;

    if (!player.paused) {
        return interaction.reply({ content: "❌ Playback isn't paused.", flags: 64 });
    }

    await player.resume();
    await interaction.reply("▶️ Resumed.");

}

async function shuffle(interaction) {

    const player = interaction.client.lavalink.getPlayer(interaction.guild.id);

    if (!player || !player.queue.tracks.length) {
        return interaction.reply({ content: "❌ There's nothing queued up to shuffle.", flags: 64 });
    }

    const count = await player.queue.shuffle();

    await interaction.reply(`🔀 Shuffled **${count}** track${count === 1 ? "" : "s"} in the queue.`);

}

async function showQueue(interaction) {

    const player = interaction.client.lavalink.getPlayer(interaction.guild.id);

    if (!player || !player.queue.current) {
        return interaction.reply({ content: "❌ The queue is empty.", flags: 64 });
    }

    const current = player.queue.current;
    const upNext = player.queue.tracks;

    const embed = new EmbedBuilder()
        .setTitle("🎵 Music Queue")
        .setColor(0x5865F2)
        .addFields({
            name: "Now Playing",
            value: `[${current.info.title}](${current.info.uri}) — ${current.requester?.username ?? current.requester?.tag ?? "Unknown"}`
        });

    if (upNext.length) {
        embed.addFields({
            name: "Up Next",
            value: upNext.slice(0, 10)
                .map((t, i) => `**${i + 1}.** [${t.info.title}](${t.info.uri}) — ${t.requester?.username ?? t.requester?.tag ?? "Unknown"}`)
                .join("\n")
        });
    }

    await interaction.reply({ embeds: [embed] });

}

module.exports = { enqueue, skip, stop, pause, resume, shuffle, showQueue, registerLavalinkEvents };
