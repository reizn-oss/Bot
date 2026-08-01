const { EmbedBuilder } = require("discord.js");

const config = require("../config/serverConfig");
const { isSpotifyLink, isSpotifyPlaylistLink, extractSpotifyPlaylistId, isAppleMusicLink } = require("../utils/spotify");
const { fetchPlaylistTracks } = require("../utils/spotifyPlaylistScraper");

// With Lavalink, the actual audio fetching/decoding/sending happens on the
// Lavalink node, not in this process — this file just tells the node what
// to play and reacts to its events. No @discordjs/voice connection code,
// no local streams, no ffmpeg needed here anymore.
//
// Spotify/Apple Music links used to be resolved here in the bot process —
// fetching track names via a scraped Spotify Web API workaround, then
// running each one through a separate YouTube/SoundCloud search. That's
// gone now: the self-hosted Lavalink node (see /lavalink-server) runs the
// LavaSrc plugin, which resolves Spotify/Apple Music links natively —
// player.search() below just works for those URLs directly, the same way
// it already did for plain queries and SoundCloud links, so there's no
// separate code path needed for them anymore.

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

    // Spotify playlists specifically can't be resolved by LavaSrc's
    // clientId/clientSecret auth (Spotify requires a logged-in user for
    // playlist contents) — see utils/spotifyPlaylistScraper.js. Tracks
    // and albums don't have this problem and keep using the normal path
    // below, resolved natively by the Lavalink node.
    if (isSpotifyPlaylistLink(query)) {
        return enqueueScrapedSpotifyPlaylist(interaction, player, query);
    }

    return enqueueSingleQuery(interaction, player, query);

}

function describeMusicLookupError(err) {

    // A raw "Unexpected token '<' ... is not valid JSON" means a Lavalink
    // node sent back an HTML page instead of a JSON response — almost
    // always a wrong/rotated node password or the node's proxy erroring
    // out, not anything wrong with the query itself.
    if (/unexpected token/i.test(err.message) && /json/i.test(err.message)) {
        return "the music backend node sent back an invalid response (likely LAVALINK_PASSWORD not matching between the bot and lavalink-server, or the node still starting up) — check the lavalink-server Render service's logs, or hit its /debug/lavalink endpoint via keepAlive.js.";
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
        // Playlist links never reach this function (see enqueue() above),
        // so this hint only needs to cover tracks/albums now.
        const hint = ((isSpotifyLink(query) && !isSpotifyPlaylistLink(query)) || isAppleMusicLink(query))
            ? " (if this is a Spotify/Apple Music link, double check the self-hosted Lavalink node has SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET configured — see lavalink-server/README.md)"
            : "";
        return interaction.editReply(`❌ No results found.${hint}`);
    }

    // loadType "playlist" covers Spotify albums/playlists, Apple Music
    // playlists/albums, and SoundCloud sets — LavaSrc/Lavalink hand back
    // every track in one response, resolved server-side. Anything else
    // ("track"/"search") is a single result.
    if (res.loadType === "playlist") {
        return enqueuePlaylistResult(interaction, player, res);
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
 * Handles Spotify albums/playlists, Apple Music playlists/albums, and
 * SoundCloud sets in one place — LavaSrc/Lavalink already resolved every
 * track server-side by the time this runs, so there's no per-track
 * network round trip needed here anymore (that used to be a sequential
 * loop of Spotify Web API + YouTube search calls in this file).
 */
async function enqueuePlaylistResult(interaction, player, res) {

    const cap = Math.max(1, config.music.maxSpotifyPlaylistTracks ?? 25);
    const spaceLeft = config.music.maxQueueSize
        ? Math.max(0, config.music.maxQueueSize - player.queue.tracks.length)
        : cap;

    if (spaceLeft === 0) {
        return interaction.editReply("❌ The queue is full — try again once it's shorter.");
    }

    const toQueue = res.tracks.slice(0, Math.min(cap, spaceLeft));
    const wasIdle = !player.playing && !player.paused;

    await player.queue.add(toQueue);

    if (wasIdle) await player.play();

    const playlistName = res.playlist?.name ?? "that playlist/album";
    const truncatedNote = res.tracks.length > toQueue.length
        ? ` (queue/limit only had room for ${toQueue.length} of ${res.tracks.length})`
        : "";

    const summary = wasIdle
        ? `🎵 Playing **${toQueue[0].info.title}** now — queued ${toQueue.length} track${toQueue.length === 1 ? "" : "s"} from **${playlistName}**${truncatedNote}.`
        : `➕ Queued ${toQueue.length} track${toQueue.length === 1 ? "" : "s"} from **${playlistName}**${truncatedNote}.`;

    await interaction.editReply(summary);

}

/**
 * Spotify playlists only, via utils/spotifyPlaylistScraper.js — reads the
 * track list off Spotify's public embed page (no login/API creds needed),
 * then resolves each title+artist through the normal search backend
 * (SoundCloud/YouTube, same as everything else) one at a time. Sequential
 * on purpose: a burst of parallel searches is more likely to get
 * rate-limited by the search backend than a steady stream, and this only
 * runs once per playlist request, not per track added normally.
 */
async function enqueueScrapedSpotifyPlaylist(interaction, player, query) {

    const playlistId = extractSpotifyPlaylistId(query);

    if (!playlistId) {
        return interaction.editReply("❌ Couldn't read that as a Spotify playlist link.");
    }

    let playlist;

    try {
        playlist = await fetchPlaylistTracks(playlistId);
    } catch (err) {
        console.error("Spotify playlist scrape failed:", err.message);
        return interaction.editReply(
            `❌ Couldn't read that Spotify playlist — ${err.message}. ` +
            "Track and album links still work fine either way."
        );
    }

    if (!playlist.tracks.length) {
        return interaction.editReply("❌ That Spotify playlist looks empty (or Spotify didn't return any tracks for it).");
    }

    const cap = Math.max(1, config.music.maxSpotifyPlaylistTracks ?? 25);
    const spaceLeft = config.music.maxQueueSize
        ? Math.max(0, config.music.maxQueueSize - player.queue.tracks.length)
        : cap;

    if (spaceLeft === 0) {
        return interaction.editReply("❌ The queue is full — try again once it's shorter.");
    }

    const toResolve = playlist.tracks.slice(0, Math.min(cap, spaceLeft));

    await interaction.editReply(`🔎 Found **${playlist.tracks.length}** track${playlist.tracks.length === 1 ? "" : "s"} in **${playlist.name}** — resolving ${toResolve.length} now...`);

    const resolved = [];
    let failed = 0;

    for (const track of toResolve) {

        try {
            const res = await searchWithFailover(player, { query: track.query }, interaction.user);
            if (res && res.tracks?.length && res.loadType !== "error" && res.loadType !== "empty") {
                resolved.push(res.tracks[0]);
            } else {
                failed++;
            }
        } catch {
            failed++;
        }

    }

    if (!resolved.length) {
        return interaction.editReply(
            `❌ Found **${playlist.name}** but couldn't resolve any of its ${toResolve.length} tracks to something playable.`
        );
    }

    const wasIdle = !player.playing && !player.paused;

    await player.queue.add(resolved);

    if (wasIdle) await player.play();

    const truncatedNote = playlist.tracks.length > toResolve.length
        ? ` (limit only had room for ${toResolve.length} of ${playlist.tracks.length})`
        : "";
    const failedNote = failed ? ` — ${failed} couldn't be found and ${failed === 1 ? "was" : "were"} skipped` : "";

    const summary = wasIdle
        ? `🎵 Playing **${resolved[0].info.title}** now — queued ${resolved.length} track${resolved.length === 1 ? "" : "s"} from **${playlist.name}**${truncatedNote}${failedNote}.`
        : `➕ Queued ${resolved.length} track${resolved.length === 1 ? "" : "s"} from **${playlist.name}**${truncatedNote}${failedNote}.`;

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
