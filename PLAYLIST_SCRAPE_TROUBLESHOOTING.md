# Spotify playlist scraping — when it breaks

Spotify playlist support (`utils/spotifyPlaylistScraper.js`) reads Spotify's
public embed page instead of the official API, because the official API
now requires a logged-in user for playlist contents. This is an
unofficial, undocumented surface — it *will* eventually break when
Spotify changes that page, with no warning and no changelog to check.

Spotify **track** and **album** links don't use this file at all (LavaSrc
resolves those natively) — if playlists stop working but tracks/albums
still play fine, this file is the cause.

## How to tell what broke

Check the bot process's logs (not the Lavalink service — this runs in the
bot itself) for a line starting with `Spotify playlist scrape failed:`.
The message after it tells you which of these happened:

- **`Spotify's embed page returned 4xx/5xx`** — the specific playlist may
  have gone private/been deleted, or Spotify blocked the request
  entirely (rate limiting, or they started requiring headers/cookies
  this scraper doesn't send). Try a different public playlist to tell
  these apart.
- **`couldn't find playlist data on Spotify's embed page`** — Spotify
  renamed or removed the `__NEXT_DATA__` script tag the parser looks
  for. This means Spotify changed their embed page's underlying
  framework/structure — the fix requires updating the HTML parsing in
  `utils/spotifyPlaylistScraper.js` to match whatever they changed it to.
- **`couldn't parse Spotify's embed page data`** — the tag was found but
  its contents aren't valid JSON anymore, or the shape changed. Same fix
  path as above: inspect the current embed page's source and update the
  parser.
- **`that doesn't look like a public playlist`** — the JSON parsed fine
  but `entity.type`/`entity.trackList` isn't where the code expects it.
  Spotify likely restructured the data inside that same JSON blob.

## How to actually fix a break

1. Open `https://open.spotify.com/embed/playlist/<any-public-playlist-id>`
   directly in a browser.
2. View page source (not DevTools' rendered DOM — the raw HTML) and
   search for `__NEXT_DATA__`.
3. Compare what you find there to what `fetchPlaylistTracks()` in
   `utils/spotifyPlaylistScraper.js` expects (`entity.name`,
   `entity.trackList[].title`, `entity.trackList[].subtitle`). Update the
   property paths to match.
4. Test locally with a couple of different public playlists before
   redeploying — Spotify sometimes serves slightly different shapes for
   different playlist types (e.g. algorithmic/Spotify-owned playlists vs.
   user-created ones).

## If it keeps breaking often

That's this approach's known cost — it's inherently reactive maintenance.
If it's breaking more than a couple of times a year, it's worth
revisiting the `sp_dc` cookie approach (ties to a real account session,
same restriction as before, but Spotify has less incentive to change a
surface used by their own logged-in web player) or just accepting
track/album-only support and telling users to link those instead of
playlists.
