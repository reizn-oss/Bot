// Spotify/Apple Music resolution used to happen here — fetching an
// anonymous Spotify web-player token via a TOTP trick (secret scraped
// from a community mirror of Spotify's JS bundle, see the old version of
// this file in git history if you're curious) and then searching YouTube
// per track. That was fragile: Spotify broke it twice already (Feb 2026's
// Client Credentials restriction, then the TOTP requirement itself).
//
// That whole approach is gone now. The self-hosted Lavalink node (see
// /lavalink-server) runs the LavaSrc plugin with a normal, registered
// Spotify app (SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET — the officially
// supported path, not a scrape), and resolves Spotify + Apple Music links
// natively when features/music.js calls player.search() with the URL
// directly. This file now only detects link types so the bot can give a
// clearer error message if the node isn't configured for them yet.

const SPOTIFY_URL_RE = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?(track|album|playlist)\/([a-zA-Z0-9]+)/i;
const SPOTIFY_URI_RE = /spotify:(track|album|playlist):([a-zA-Z0-9]+)/i;
const APPLE_MUSIC_URL_RE = /music\.apple\.com\/[a-z]{2}\/(album|playlist|song)\//i;

function isSpotifyLink(query) {
    return SPOTIFY_URL_RE.test(query) || SPOTIFY_URI_RE.test(query);
}

function isAppleMusicLink(query) {
    return APPLE_MUSIC_URL_RE.test(query);
}

module.exports = { isSpotifyLink, isAppleMusicLink };
