# Self-hosted Lavalink node (replaces the free public nodes)

## Why this exists

Your bot's music feature was pointed at three free, third-party Lavalink
nodes run by volunteers. That's why `/play` kept failing: those nodes go
down, get overloaded, or rotate their passwords with no warning — the
403 you saw from `node-3` in your Render logs is exactly that (the node
was up, but rejecting requests, most likely a rotated/expired password on
their end). Nothing in your bot's code was broken; the free node you
depended on stopped cooperating, which is a risk with *any* free public
node, not just that one.

This folder replaces all three with one Lavalink node you run yourself,
with LavaSrc added for real, direct Spotify + Apple Music support
(instead of the TOTP-scraping workaround that used to live in
`utils/spotify.js` — that trick works until Spotify changes something
again, which it already had twice).

## Cost, honestly

Render's free web service tier spins down after ~15 minutes of no HTTP
traffic — fine for the bot itself, since Discord pings keep it awake, but
it'll kill a Lavalink node mid-song. Running this reliably 24/7 needs
Render's **Starter** instance type (~$7/month) for *this* service. Your
bot service can usually stay on whatever plan it's already on. If that
cost doesn't work for you, say so and I can help you evaluate a cheaper
box (a $4–6/month VPS from someone like Hetzner/DigitalOcean runs this
exact same Docker setup, or a free-tier Oracle Cloud VM if you don't mind
the setup work) instead of a second Render service.

## Deploy steps

1. Push this repo (including this `lavalink-server/` folder) to GitHub —
   Render deploys from a git repo, not a raw drag-and-drop of files.
2. In the Render dashboard: **New +** → **Web Service** → connect the
   same repo.
3. Set **Root Directory** to `lavalink-server`, **Runtime** to **Docker**.
4. Instance type: **Starter** (or higher) — not Free, see above.
5. Add these environment variables on *this* service:
   - `LAVALINK_PASSWORD` — make up a long random string.
   - `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — from a free app at
     https://developer.spotify.com/dashboard (Create app → any
     name/description → Redirect URI can be anything, e.g.
     `http://localhost` → you only need the Web API).
6. Deploy. Once live, copy this service's `.onrender.com` URL.
7. On your **bot** service, set:
   - `LAVALINK_HOST` = the host from step 6's URL (no `https://`, no
     trailing slash)
   - `LAVALINK_PORT` = `443`
   - `LAVALINK_SECURE` = `true`
   - `LAVALINK_PASSWORD` = the same value you set in step 5
8. Redeploy the bot service.

Check this service's Render logs for `Lavalink is ready to accept
connections.` — once you see that, `/play` should work, including
`open.spotify.com/album/...`, `/playlist/...`, `/track/...`, and
`music.apple.com/...` links straight in `/play`, no extra bot-side code
needed for those.

## Known limitations as of Aug 1 2026 testing

**Spotify playlists specifically return 401 "Valid user authentication
required."** This is a real Spotify API restriction (Feb 2026) on reading
playlist contents with an app's Client ID/Secret — it does *not* affect
albums or individual tracks, only playlists. Fix: LavaSrc supports
authenticating as a real logged-in Spotify user instead
(`plugins.lavasrc.spotify.spDc` in `application.yml`, using your own
account's `sp_dc` browser cookie). Ask me if you want this set up — it
works, but ties resolution to your personal account's session, and that
cookie can expire and need refreshing periodically.

**YouTube rejects every unauthenticated client** ("This video requires
login" / "Sign in to confirm you're not a bot") from this Render
instance. This is YouTube's normal anti-bot check, not a bug. SoundCloud
is the working default for now (see `MUSIC_SEARCH_PLATFORM` in the bot's
`.env.example`) — but SoundCloud has also intermittently failed in
earlier testing, so neither source is 100% guaranteed reliable on its
own right now. The real fix for YouTube specifically is OAuth:

### One-time YouTube OAuth setup
1. Deploy with the current `application.yml` as-is (`oauth.enabled: true`,
   `skipInitialization: false`, empty `refreshToken`).
2. Watch this service's **Logs** right after it boots. Within a minute or
   two you should see a message with a URL (`google.com/device` or
   similar) and a short code.
3. On any browser (phone's fine), go to that URL, log into any Google
   account you're comfortable using for this (doesn't need YouTube
   Premium or anything special), enter the code.
4. Back in the logs, a `refreshToken` value will be printed after you
   approve it. Copy that whole string.
5. On this Render service's **Environment** tab, add:
   `YOUTUBE_REFRESH_TOKEN` = the value from step 4.
6. In `application.yml`, change `skipInitialization: false` to `true`
   (so it doesn't try to re-run the device flow every boot).
7. Commit, push, redeploy.

After this, YouTube should stop hitting the bot-detection wall. If it
still does, that specific Google account may need a few hours of "aging"
after first login before YouTube trusts it for this — this is a known
quirk, not a setup mistake.
