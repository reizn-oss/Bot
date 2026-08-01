# Music fix — what to actually do

Your code is fine. The failures came from deployment state, not bugs. Do these in order:

## 1. Rotate your secrets first
Your Discord bot token, Spotify client secret, Lavalink password, and YouTube
refresh token were visible in plaintext in screenshots you shared. Treat all
four as compromised:
- Discord Developer Portal → your app → Bot → **Reset Token**
- Spotify Developer Dashboard → your app → **Reset client secret**
- Pick a new long random string for `LAVALINK_PASSWORD`
- Revoke the YouTube OAuth grant on the Google account you used, then redo
  the device-code flow (step 4 below) to get a fresh refresh token

Update the new values everywhere they're used (both Render services) before
moving on.

## 2. On the **Lavalink** Render service: actually save and deploy
Your Environment tab had `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` /
`YOUTUBE_REFRESH_TOKEN` typed in, sitting above an unclicked
**"Save, rebuild, and deploy"** button. Typing values into that form does
nothing until you click that button — the live node was running without
them. Click it.

## 3. Push the updated `application.yml`
This zip's `lavalink-server/application.yml` has one change:
`oauth.skipInitialization` is now `true`. With it `false`, the plugin
re-runs the OAuth device-code flow every boot instead of trusting your
saved `YOUTUBE_REFRESH_TOKEN` — that's why YouTube kept failing even after
you'd completed OAuth once. Commit this file to your repo and push, then
let Render redeploy the Lavalink service (Dockerfile bakes this file into
the image, so an env-var-only change won't pick it up).

## 4. If YouTube still fails after that
Your refresh token may be stale/revoked (likely, since it was exposed).
Redo the one-time device flow:
1. Temporarily set `skipInitialization: false` again, clear
   `YOUTUBE_REFRESH_TOKEN`, push, redeploy.
2. Watch the Lavalink service's Render logs for a device code + URL.
3. Approve it in a browser, copy the new refresh token from the logs.
4. Set the new `YOUTUBE_REFRESH_TOKEN` env var, flip
   `skipInitialization` back to `true`, push, redeploy.

## 5. Clean up the Bot-1 service's environment
`YOUTUBE_COOKIE`, `SPOTIFY_CLIENT_ID`, and `SPOTIFY_CLIENT_SECRET` on the
**bot** service are unused now — Spotify/Apple Music resolution happens
entirely on the Lavalink node via LavaSrc. Delete these three from Bot-1's
env to reduce what's exposed there.

## 6. Confirm
Check Spotify albums/tracks and a plain search first (SoundCloud is the
default search platform). Once you see `Lavalink is ready to accept
connections.` in the Lavalink service logs and no OAuth errors, try
YouTube.

## 7. Spotify playlists now work too (embed-page scraping)
Track and album links already worked natively. Playlists now resolve via
`utils/spotifyPlaylistScraper.js`, which reads Spotify's public embed page
instead of the official API (which requires a logged-in user for playlist
contents as of Feb 2026). No new env vars or account needed for this.

Trade-off: it's an unofficial page, so it can break if Spotify changes its
structure — see `PLAYLIST_SCRAPE_TROUBLESHOOTING.md` if that happens.
