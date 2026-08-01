// Reads a Spotify playlist's track list from Spotify's public embed page
// (open.spotify.com/embed/playlist/<id>) instead of the official Web API.
//
// Why this exists: Spotify's Web API has required a logged-in user's
// session to read *playlist contents* since Feb 2026 — Client
// ID/Secret alone (what LavaSrc/the Lavalink node uses) gets a 401. The
// embed page is the one Spotify surface that still returns full track
// listings for a public playlist with no login and no API credentials at
// all, because it's what powers the little playlist preview widget sites
// embed — same technique many "no-setup" Discord music bots use for this.
//
// The trade-off, spelled out: this is an undocumented, unofficial
// surface. Spotify can change the embed page's HTML/JSON structure at any
// time with no notice and no changelog, and this will break when they do
// — the same way the old TOTP-based approach in this project's history
// broke twice already. If playlist resolution suddenly stops working and
// track/album links still work fine, this file is almost certainly why —
// check PLAYLIST_SCRAPE_TROUBLESHOOTING.md in the repo root for what to
// do about it.
//
// Requires Node 18+ for the global `fetch` (Render's Node runtime has
// this by default).

const EMBED_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function embedUrl(playlistId) {
    return `https://open.spotify.com/embed/playlist/${playlistId}`;
}

/**
 * Fetches and parses a Spotify playlist's track list via the public embed
 * page. Returns { name, tracks: [{ title, artist, query }] }.
 *
 * Throws a plain Error with a message safe to show the user directly —
 * callers in features/music.js do exactly that, so keep these messages
 * free of stack traces / internal detail.
 */
async function fetchPlaylistTracks(playlistId) {

    let res;

    try {
        res = await fetch(embedUrl(playlistId), {
            headers: {
                "User-Agent": EMBED_USER_AGENT,
                "Accept": "text/html"
            }
        });
    } catch (err) {
        throw new Error(`couldn't reach Spotify (${err.message})`);
    }

    if (!res.ok) {
        throw new Error(`Spotify's embed page returned ${res.status} — the playlist may be private, region-locked, or removed`);
    }

    const html = await res.text();

    // The embed page ships its data as a JSON blob inside a
    // <script id="__NEXT_DATA__" type="application/json"> tag — this is
    // the exact spot that breaks first if Spotify redesigns the embed
    // page. If this stops matching, that's the first thing to check.
    const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);

    if (!match) {
        throw new Error("couldn't find playlist data on Spotify's embed page (Spotify may have changed its page layout — see PLAYLIST_SCRAPE_TROUBLESHOOTING.md)");
    }

    let data;

    try {
        data = JSON.parse(match[1]);
    } catch {
        throw new Error("couldn't parse Spotify's embed page data (Spotify may have changed its page format — see PLAYLIST_SCRAPE_TROUBLESHOOTING.md)");
    }

    const entity = data?.props?.pageProps?.state?.data?.entity;

    if (!entity || entity.type !== "playlist") {
        throw new Error("that doesn't look like a public playlist (it may be private, or Spotify's embed page changed its data format)");
    }

    const rawTracks = Array.isArray(entity.trackList) ? entity.trackList : [];

    const tracks = rawTracks
        .filter(t => t && typeof t.title === "string" && t.title.trim())
        .map(t => {
            const title = t.title.trim();
            const artist = typeof t.subtitle === "string" ? t.subtitle.trim() : "";
            return {
                title,
                artist,
                query: artist ? `${title} ${artist}` : title
            };
        });

    return {
        name: typeof entity.name === "string" && entity.name.trim() ? entity.name.trim() : "Spotify Playlist",
        tracks
    };

}

module.exports = { fetchPlaylistTracks };
