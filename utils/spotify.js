// Spotify/Apple Music resolution used to happen here — fetching an
// anonymous Spotify web-player token via a TOTP trick (secret scraped
// from a community mirror of Spotify's JS bundle, see the old version of
// this file in git history if you're curious) and then searching YouTube
// per track. That was fragile: Spotify broke it twice already (Feb 2026's
// Client Credentials restriction, then the TOTP requirement itself).
//
// Track and album links no longer need any of that: the self-hosted
// Lavalink node (see /lavalink-server) runs the LavaSrc plugin with a
// normal, registered Spotify app (SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET
// — the officially supported path, not a scrape), and resolves those
// natively when features/music.js calls player.search() with the URL
// directly.
//
// Playlists are the one exception: as of Feb 2026, Spotify's API 401s on
// playlist *contents* for any app using only Client ID/Secret — it now
// requires either a logged-in user's session or Spotify partner status,
// neither of which LavaSrc's clientId/clientSecret config can satisfy.
// See utils/spotifyPlaylistScraper.js for how playlists are handled
// instead (deliberately chosen over the sp_dc cookie approach — no
// personal account tied to it, at the cost of depending on Spotify's
// public embed page instead of an official API).
//
// This file just detects link types so features/music.js can route each
// one to the right path and give a clearer error message otherwise.

const SPOTIFY_URL_RE = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?(track|album|playlist)\/([a-zA-Z0-9]+)/i;
const SPOTIFY_URI_RE = /spotify:(track|album|playlist):([a-zA-Z0-9]+)/i;
const SPOTIFY_PLAYLIST_URL_RE = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?playlist\/([a-zA-Z0-9]+)/i;
const SPOTIFY_PLAYLIST_URI_RE = /spotify:playlist:([a-zA-Z0-9]+)/i;
const APPLE_MUSIC_URL_RE = /music\.apple\.com\/[a-z]{2}\/(album|playlist|song)\//i;

function isSpotifyLink(query) {
    return SPOTIFY_URL_RE.test(query) || SPOTIFY_URI_RE.test(query);
}

function isSpotifyPlaylistLink(query) {
    return SPOTIFY_PLAYLIST_URL_RE.test(query) || SPOTIFY_PLAYLIST_URI_RE.test(query);
}

function extractSpotifyPlaylistId(query) {
    const urlMatch = query.match(SPOTIFY_PLAYLIST_URL_RE);
    if (urlMatch) return urlMatch[1];

    const uriMatch = query.match(SPOTIFY_PLAYLIST_URI_RE);
    if (uriMatch) return uriMatch[1];

    return null;
}

function isAppleMusicLink(query) {
    return APPLE_MUSIC_URL_RE.test(query);
}

module.exports = { isSpotifyLink, isSpotifyPlaylistLink, extractSpotifyPlaylistId, isAppleMusicLink };
