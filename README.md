# InfoCore: CCIS Link-Hub Bot

A Discord bot that builds and manages **The InfoCore: CCIS Link-Hub** server —
roles, categories, channels, verification, a step-by-step role wizard,
tickets, polls, moderation, and logging — from one `/setup` command.

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer
- A Discord bot application (from https://discord.com/developers/applications)
- The bot invited with the `applications.commands` and `bot` scopes, and at
  minimum **Manage Roles**, **Manage Channels**, **Kick Members**,
  **Ban Members**, and **Moderate Members** permissions (or just
  Administrator, for simplicity)
- **Important:** in the Developer Portal, under your app's **Bot** tab, enable
  the **Server Members Intent** and **Message Content Intent**. Without these
  the welcome messages, verification, and auto-moderation features won't work.
- **Important:** the bot's own role must sit *above* Moderator, Student
  Council, and every member role it needs to act on in your server's role
  list (Server Settings → Roles), or kicks/bans/timeouts/role changes will
  silently fail due to Discord's role hierarchy rules.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure your credentials**

   Copy the template and fill it in:

   ```bash
   cp .env.example .env
   ```

   ```
   TOKEN=your-bot-token
   CLIENT_ID=your-application-id
   GUILD_ID=your-server-id
   ```

   - `TOKEN` — Developer Portal → your app → **Bot** → Reset Token
   - `CLIENT_ID` — Developer Portal → your app → **General Information** → Application ID
   - `GUILD_ID` — In Discord, enable Developer Mode (User Settings → Advanced),
     then right-click your server icon → **Copy Server ID**

   ⚠️ **Never commit `.env` or share your token.** If a token is ever
   exposed, regenerate it immediately from the Developer Portal.

3. **Register the slash commands** (run again any time you add/change a command)

   ```bash
   npm run deploy
   ```

4. **Start the bot**

   ```bash
   npm start
   ```

5. **Run the setup command** in your Discord server:

   ```
   /setup
   ```

   This creates every role, category, and channel in
   `config/serverConfig.js`, then posts the verify panel and the first
   step of the role wizard. It's safe to run more than once — anything
   that already exists is skipped and re-synced (including Moderator's
   permissions), and existing panels aren't duplicated.

6. **Keep it running 24/7** — see "Keeping the bot online 24/7" below.
   `npm start` only keeps the bot running while your terminal/session is
   open; for a real server you want a process manager.

## What gets built

**📢 Information Center** — `welcome`, `rules`, and `verify-here` are
visible to everyone, even before verifying. Everything else in this
category (server-guide, role-select, announcements, academic-updates,
events, organization-posts, internship-opportunities) is unlocked only
after verifying, same as the rest of the server.

**🎓 Academic Hub** *(unlocked after verifying)* — programming-help,
study-groups, learning-resources, project-showcase, ai-discussion,
cybersecurity, web-development, mobile-development

**💬 Community** *(unlocked after verifying)* — general-chat,
introductions, lounge, questions, memes, suggestions, achievements

**🎮 Gaming** *(unlocked after verifying)* — valorant, mobile-legends,
codm, roblox, minecraft, plus a voice channel for each game

**🎫 Tickets** *(staff-only category; individual ticket channels are
per-user)*

**🔒 Staff** *(staff-only — the one area verifying never unlocks)* —
staff-chat, staff-announcements, mod-logs, meeting-room

**🎙 Voice Channels** — General VC, Study Room 1 & 2, Meeting Room, AFK

**👑 Roles** — Administrator (full permissions), Moderator (Kick, Ban,
Timeout/"limit", Manage Messages, Manage Nicknames, View Audit Log),
Student Council, program roles (BSCS, BSIT, BSIS), year level roles
(1st–4th Year), one role per game (Valorant, Mobile Legends, CODM, Roblox,
Minecraft), notification roles (Announcements, Academic Updates, Events),
plus the internal Verified/Unverified tags

## Advanced features

| Feature | How it works |
|---|---|
| **Verification** | New members get the `Unverified` tag and can only see `#welcome`, `#rules`, and `#verify-here`. Clicking **Verify** there (or running `/verify`) grants `Verified`, unlocking the rest of the server — everything except the 🔒 Staff category and 🎫 Tickets. |
| `/verify` | Slash-command shortcut that does the same thing as the button. |
| **Role wizard** | `#role-select` only ever shows the **Year Level** step publicly. Picking a year level privately (ephemeral) opens **Program**; picking a program opens **Notification Roles**; toggle any you want and press Continue to open **Game Roles**; toggle and press Finish. Year Level and Program are radio-button style (one at a time); Notification and Game Roles are checkboxes (pick as many as you like before continuing). Anyone can restart the flow any time from the public Year Level buttons. |
| `/ticket open` / `/ticket close` | Opens a private channel under 🎫 TICKETS visible only to the requester + staff. A button-based panel in `#ticket-panel` does the same thing. |
| `/poll` | `/poll question:"..." option1:"..." option2:"..."` (up to 5 options) posts a live-updating button poll. Votes are stored in memory, so they reset on a bot restart. |
| **Moderation powers** | The Moderator role has real Discord permissions: Kick, Ban, Timeout ("limit"), Manage Messages, Manage Nicknames, View Audit Log. Staff can act via `/kick`, `/ban`, `/timeout`, or Discord's own right-click menu — either way it's logged to `#mod-logs`. |
| **Auto moderation** | Deletes messages containing vulgar/banned words, invite links, or excessive mentions, and rate-limits spam. Staff (per `staffRoles`) are exempt. After repeated violations from the same member within an hour (configurable), the bot automatically times them out ("limits" them) on top of anything staff do manually. Configure the word list and thresholds in `config/serverConfig.js` under `automod`. |
| **Music** | `/play` accepts a song name, YouTube link, SoundCloud link, or a Spotify track/album/playlist link — Spotify links are resolved to track names via the Spotify Web API (needs `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` in `.env`, see `.env.example`) and each one is then searched via `MUSIC_SEARCH_PLATFORM` (SoundCloud by default — see `.env.example`), since Spotify itself can't be streamed outside its own apps. Runs on two Lavalink nodes (see `.env.example`) — a search that fails on one automatically retries on the other, since free public nodes intermittently misbehave while staying "connected". Requests only work while the requester is in the Music Room (configurable in `config/serverConfig.js` under `music`). |
| **Logging** | Member joins/leaves, message edits/deletes, verifications, role wizard picks, ticket open/close, kicks/bans/timeouts, and auto-mod actions are all posted to `#mod-logs`. |
| **Welcome embeds** | New members get a welcome embed in `#welcome` pointing them to rules + verification. |

## Commands

| Command | Description |
|---|---|
| `/setup` | (Admin) Builds/repairs the entire server structure and panels |
| `/verify` | Verify yourself to unlock the server |
| `/ticket open` | Open a private support ticket |
| `/ticket close` | Close the ticket channel you're in |
| `/poll` | Create a quick poll with up to 5 options |
| `/play` | Play/queue a song, Spotify link, or SoundCloud link in the Music Room |
| `/skip` | Skip the current track |
| `/pause` | Pause playback |
| `/resume` | Resume playback |
| `/stop` | Stop playback and leave the voice channel |
| `/queue` | Show what's currently playing and up next |
| `/kick` | (Staff — needs Kick Members) Kick a member |
| `/ban` | (Staff — needs Ban Members) Ban a member, optionally purging recent messages |
| `/timeout` | (Staff — needs Moderate Members) Time out ("limit") a member for N minutes |
| `/help` | Lists available commands |

The moderation commands are gated by Discord's own permission system
(`setDefaultMemberPermissions`), so Discord itself hides/greys them out
for anyone who isn't a Moderator/Administrator — no extra role checks
needed on top.

## Project structure

```
InfoCoreBot/
├── builders/
│   ├── roles.js          # Creates roles from config; re-syncs Moderator's permissions
│   ├── categories.js     # Creates categories, applies public/gated/staff permissions
│   ├── channels.js       # Creates text + per-category + general voice channels
│   ├── permissions.js    # Permission overwrites for public/gated/private categories
│   ├── panels.js         # Posts the verify panel + role wizard entry point + ticket panel
│   └── serverBuilder.js  # Orchestrates roles -> categories -> channels -> panels
├── commands/
│   ├── setup.js          # /setup
│   ├── verify.js         # /verify
│   ├── ticket.js         # /ticket open|close
│   ├── poll.js           # /poll
│   ├── kick.js           # /kick
│   ├── ban.js             # /ban
│   ├── timeout.js        # /timeout
│   └── help.js           # /help
├── features/
│   ├── welcome.js        # Welcome embeds + auto-assign Unverified on join
│   ├── tickets.js        # Shared ticket create/close logic
│   ├── automod.js        # Vulgar words / invites / mentions / spam filter + auto-timeout
│   ├── messageLog.js     # Message edit/delete logging
│   └── logging.js        # Shared #mod-logs embed helper
├── interactions/
│   ├── buttonHandler.js  # Routes all button clicks (verify/wizard/tickets/poll)
│   └── roleWizard.js     # Year Level -> Program -> Notification -> Game step flow
├── config/
│   └── serverConfig.js   # Single source of truth: roles, channels, wizard steps, automod
├── utils/
│   └── logger.js         # Console output formatting during /setup
├── keepAlive.js          # Optional tiny HTTP server for free-host uptime pings
├── ecosystem.config.js   # pm2 process config for 24/7 VPS hosting
├── deploy-commands.js    # Registers slash commands with Discord
├── index.js              # Bot entry point — wires up commands + all events
└── .env                  # Your credentials (not committed)
```

## Editing the server structure

Everything the bot creates comes from `config/serverConfig.js` — the
builders contain no hardcoded names. To add a channel, add it to the right
category's `channels` array (a plain string, or `{ name, public: true }` if
it should stay visible before verifying, like `welcome`/`rules`/
`verify-here` in the Information Center); to add a role, add it to the
right group in `roleGroups`; to make a whole category staff-only add
`private: true`, or `public: true` to make the whole category visible
pre-verification. Re-run `/setup` to apply changes — it only creates
what's missing and re-syncs permissions each time.

To change the role wizard (add a step, reorder steps, change which roles
are in a step), edit `roleWizard.steps` — it's an ordered array, so
whatever order you list steps in is the order members see them in.
`exclusive: true` gives radio-button behavior (pick one, auto-advance);
leave it `false` for checkboxes (pick several, then Continue/Finish).
Only the first step in the array is ever posted publicly by `/setup`;
every step after that is only ever shown as an ephemeral reply.

To change the vulgar/banned-word list, invite-link blocking, mention
limit, spam thresholds, or the auto-timeout escalation (how many
violations before an automatic "limit", and for how long), edit the
`automod` block in the same file. To change what Moderator (or any other
role) can do in Discord itself, edit `ROLE_OPTIONS` in `builders/roles.js`.

## Keeping the bot online 24/7

`npm start` only runs the bot while that process is alive — closing your
terminal, restarting your computer, or a crash will take the bot offline.
For a server that needs to be online all the time, you have two solid options:

**Recommended: a small always-on host + pm2**
A cheap VPS (e.g. Oracle Cloud free tier, DigitalOcean, a Raspberry Pi at
home) or a host like Railway/Fly.io running the bot under
[pm2](https://pm2.keymetrics.io/) gives you automatic restarts on crash
*and* on server reboot:

```bash
npm install -g pm2
npm run pm2:start      # starts the bot via ecosystem.config.js
pm2 save               # remembers this process across reboots
pm2 startup            # prints a command to run so pm2 itself starts on boot
npm run pm2:logs       # tail logs
npm run pm2:restart    # restart after pulling code changes
```

`ecosystem.config.js` is already set up to auto-restart on crash (with a
backoff so a bad token doesn't loop forever) and cap memory usage.

**Alternative: a free/sleep-prone host + uptime pings**
Platforms like Replit's free tier spin down when idle. If you use one of
these, set `ENABLE_KEEPALIVE=true` in `.env` to start a tiny HTTP server
(`keepAlive.js`), then point a free monitor like
[UptimeRobot](https://uptimerobot.com/) or
[cron-job.org](https://cron-job.org/) at your app's URL every 5 minutes to
keep it awake. This is less reliable than a real always-on host — Discord
bots that go to sleep will miss messages and drop their gateway
connection until pinged back awake.

Either way, `index.js` already has `unhandledRejection`/`uncaughtException`
handlers so one bad promise doesn't crash the whole process, and
discord.js automatically reconnects on dropped gateway connections (watch
for the 🔄/✅ reconnect logs) — the process manager is your safety net for
the cases those two don't cover (out-of-memory, host reboot, etc).

## Notes & limitations

- Poll votes live in memory and reset if the bot restarts — swap in a
  database if you need polls to survive restarts.
- The banned-word list ships with a small starter set — add your own
  terms in `config/serverConfig.js` under `automod.bannedWords`.
- Auto-moderation is a lightweight custom filter, not a replacement for
  Discord's built-in AutoMod — the two can be used together.
- Role wizard selections for the checkbox steps (Notification, Game
  Roles) are held in memory until the member presses Continue/Finish, and
  are lost (silently reset) if the bot restarts mid-flow — the member
  would just need to press the buttons again.
