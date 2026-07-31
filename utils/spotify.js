// Spotify locked down its Web API twice in a row on us:
//
// 1. Feb 2026: Client Credentials tokens (the kind a registered "Development
//    Mode" app gets) can now only read the contents of playlists the token
//    owns/collaborates on — never true for a bot. /playlists/{id}/tracks was
//    also renamed to /playlists/{id}/items.
// 2. The anonymous "web-player" token open.spotify.com hands out to logged-out
//    visitors (our workaround for #1) now requires a TOTP code alongside the
//    request, generated from a secret embedded in Spotify's web player JS
//    bundle. That secret rotates every few days/weeks.
//
// So: this fetches the current secret from a community repo that watches
// Spotify's web player bundle and republishes the secret whenever it
// rotates (https://github.com/xyloflake/spot-secrets-go), derives a TOTP
// code from it the same way the real web player does, and uses that to get
// an anonymous token. This is unofficial and Spotify can break it again —
// if that happens, the error message below will say so, and the real,
// durable fix is requesting Extended Quota Mode for the app on
// https://developer.spotify.com/dashboard, which removes the ownership
// restriction from #1 entirely and lets us go back to normal app auth.

const crypto = require("crypto");

const SECRETS_URL = "https://raw.githubusercontent.com/xyloflake/spot-secrets-go/main/secrets/secretDict.json";
const SERVER_TIME_URL = "https://open.spotify.com/";
const TOKEN_URL = "https://open.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let cachedSecrets = null;
let cachedSecretsAt = 0;
const SECRETS_TTL_MS = 6 * 60 * 60 * 1000;

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getSecretDict() {

    if (cachedSecrets && Date.now() - cachedSecretsAt < SECRETS_TTL_MS) {
        return cachedSecrets;
    }

    const res = await fetch(SECRETS_URL);
    if (!res.ok) {
        throw new Error(`Couldn't fetch the Spotify TOTP secret (${res.status}).`);
    }

    cachedSecrets = await res.json();
    cachedSecretsAt = Date.now();

    return cachedSecrets;

}

function totpSecretBytes(cipherBytes) {
    const transformed = cipherBytes.map((byte, i) => byte ^ ((i % 33) + 9));
    return Buffer.from(transformed.join(""), "utf8");
}

function generateTotp(secretBytes, unixSeconds) {

    const counter = Math.floor(unixSeconds / 30);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuf.writeUInt32BE(counter >>> 0, 4);

    const hmac = crypto.createHmac("sha1", secretBytes).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const binary =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

    return (binary % 1_000_000).toString().padStart(6, "0");

}

async function fetchServerTimeSeconds() {

    const res = await fetch(SERVER_TIME_URL, { method: "HEAD", headers: { "User-Agent": BROWSER_UA } });
    const dateHeader = res.headers.get("date");

    if (!dateHeader) {
        throw new Error("Spotify didn't return a Date header for server time.");
    }

    return Math.floor(new Date(dateHeader).getTime() / 1000);

}

async function getAnonymousToken() {

    if (cachedToken && Date.now() < cachedTokenExpiresAt) {
        return cachedToken;
    }

    const secrets = await getSecretDict();
    const version = Math.max(...Object.keys(secrets).map(Number));
    const cipherBytes = secrets[String(version)];

    const [serverTime] = await Promise.all([fetchServerTimeSeconds()]);
    const totp = generateTotp(totpSecretBytes(cipherBytes), serverTime);

    const params = new URLSearchParams({
        reason: "transport",
        productType: "web-player",
        totp,
        totpServer: totp,
        totpVer: String(version)
    });

    const res = await fetch(`${TOKEN_URL}?${params.toString()}`, {
        headers: {
            "User-Agent": BROWSER_UA,
            "Accept": "application/json",
            "Referer": "https://open.spotify.com/",
            "App-Platform": "WebPlayer"
        }
    });

    if (!res.ok) {
        throw new Error(`Couldn't get a Spotify access token (${res.status}). Spotify may have changed how anonymous tokens work again — see utils/spotify.js for the current workaround, or request Extended Quota Mode for the app.`);
    }

    const data = await res.json();
    if (!data.accessToken) {
        throw new Error("Spotify didn't return an access token.");
    }

    cachedToken = data.accessToken;
    cachedTokenExpiresAt = data.accessTokenExpirationTimestampMs - 30_000;

    return cachedToken;

}

async function spotifyGet(path) {

    const token = await getAnonymousToken();

    const res = await fetch(`${API_BASE}${path}`, {
        headers: {
            "Authorization": `Bearer ${token}`,
            "User-Agent": BROWSER_UA
        }
    });

    if (res.status === 404) return null;

    if (!res.ok) {
        throw new Error(`Spotify API error (${res.status}) on ${path}`);
    }

    return res.json();

}

const SPOTIFY_URL_RE = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?(track|album|playlist)\/([a-zA-Z0-9]+)/i;
const SPOTIFY_URI_RE = /spotify:(track|album|playlist):([a-zA-Z0-9]+)/i;

function parseSpotifyLink(query) {
    const match = query.match(SPOTIFY_URL_RE) || query.match(SPOTIFY_URI_RE);
    if (!match) return null;
    return { type: match[1].toLowerCase(), id: match[2] };
}

function isSpotifyLink(query) {
    return SPOTIFY_URL_RE.test(query) || SPOTIFY_URI_RE.test(query);
}

function trackToQuery(track) {
    const artists = (track.artists || []).map(a => a.name).join(", ");
    return artists ? `${artists} - ${track.name}` : track.name;
}

// Feb 2026: /playlists/{id}/tracks was replaced by /playlists/{id}/items.
async function fetchPlaylistTracks(id, limit) {

    const meta = await spotifyGet(`/playlists/${id}?fields=name`);
    if (!meta) return null;

    const tracks = [];
    let path = `/playlists/${id}/items?limit=100&fields=items(track(name,artists(name),type)),next`;

    while (path && tracks.length < limit) {

        const page = await spotifyGet(path);
        if (!page) break;

        for (const item of page.items || []) {
            const t = item.track;
            if (t && t.type === "track" && t.name) {
                tracks.push({ name: t.name, artists: t.artists });
                if (tracks.length >= limit) break;
            }
        }

        path = page.next ? page.next.replace(API_BASE, "") : null;

    }

    return { name: meta.name, tracks };

}

async function fetchAlbumTracks(id, limit) {

    const meta = await spotifyGet(`/albums/${id}?fields=name`);
    if (!meta) return null;

    const tracks = [];
    let path = `/albums/${id}/tracks?limit=50`;

    while (path && tracks.length < limit) {

        const page = await spotifyGet(path);
        if (!page) break;

        for (const t of page.items || []) {
            if (t && t.name) {
                tracks.push({ name: t.name, artists: t.artists });
                if (tracks.length >= limit) break;
            }
        }

        path = page.next ? page.next.replace(API_BASE, "") : null;

    }

    return { name: meta.name, tracks };

}

async function fetchTrack(id) {

    const t = await spotifyGet(`/tracks/${id}`);
    if (!t) return null;

    return { name: t.name, tracks: [{ name: t.name, artists: t.artists }] };

}

async function resolveSpotifyLink(query, limit) {

    const parsed = parseSpotifyLink(query);
    if (!parsed) return null;

    if (parsed.type === "playlist") return fetchPlaylistTracks(parsed.id, limit);
    if (parsed.type === "album") return fetchAlbumTracks(parsed.id, limit);
    if (parsed.type === "track") return fetchTrack(parsed.id);

    return null;

}

module.exports = { isSpotifyLink, resolveSpotifyLink, trackToQuery };
