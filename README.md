# Discord Verify

A Discord bot + companion webpage that gates channel posting behind
verification. Verification runs an automatic GeoIP + VPN/proxy check and
auto-approves members from an allow-listed set of countries; everyone else
(VPN users, non-allow-listed countries) is routed to a moderator review
queue.

## How it works

- **`GET /join`** — public join funnel. Redirects visitors into the Discord
  server via a bot-generated invite that's valid for 1 hour (reused while
  still fresh, re-minted once it expires). No identity check happens here.
- On join, the bot DMs the new member a unique `/verify/<token>` link
  (falls back to a message in `DISCORD_START_HERE_CHANNEL_ID` if their DMs
  are closed). Set `SEND_JOIN_DM=false` to disable this entirely — members
  can still verify anytime with `/verify`. Members can also run the
  `/verify` slash command at any time to get a fresh link as an ephemeral
  reply, or simply **DM the bot directly** (any message works) for the same
  result — handy if `/verify` isn't visible due to a channel permission
  override, since DMs bypass that entirely. Non-members who DM the bot get
  pointed to `/join` instead. If a **previously-verified** member rejoins,
  the bot restores their `Verified` role directly instead of sending them
  through GeoIP/VPN checks again (falls back to the normal flow only if
  role restoration fails).
- **`GET /verify/:token`** — looks up the token, runs the visitor's IP
  through the GeoIP/VPN provider (cached on the token so page reloads don't
  re-query it), and either:
  - auto-assigns the `Verified` Discord role (allow-listed country + low
    fraud/VPN risk) and shows a success page, or
  - shows a form asking for **name, email, and a Cloudflare Turnstile
    CAPTCHA**. Submitting it (`POST /verify/:token`) verifies the CAPTCHA
    server-side, then creates a review-queue entry — including that
    name/email — and posts an embed with Approve/Deny buttons in
    `DISCORD_MOD_REVIEW_CHANNEL_ID`. The CAPTCHA guards this specific step
    against scripted submissions flooding the review queue with fake
    name/email pairs; the auto-verify path above never shows one.
- **Review decisions**: approving a review-queue entry DMs the member and
  assigns the `Verified` role. Denying it DMs the member and **kicks them
  from the server**, unless they have the **Administrator** permission (in
  which case they're just marked denied, not removed). Either way, the
  review-queue message is deleted from `DISCORD_MOD_REVIEW_CHANNEL_ID`
  afterward to keep the channel clean.

Posting access is controlled by denying **Send Messages** for `@everyone`
at the channel/category level and granting it back via the `Verified` role
(`DISCORD_VERIFIED_ROLE_ID`) — no separate "Unverified" role is needed.

### Audit log

Set `DISCORD_AUDIT_LOG_CHANNEL_ID` to get a permanent, read-only record of
every verification decision — `/verify-user`, `/unverify-user`, and each
review-queue approve/deny (including whether a denied member was kicked or
spared for being an admin). This is the only lasting trace of a decision in
Discord, since the review-queue embed itself gets deleted afterward; the
database also keeps `reviewedBy`/`reviewedAt` on `ReviewQueueEntry` if you
need to query it directly. Optional — if unset, decisions simply aren't
logged to a channel.

### Health check

**`GET /health`** shows live status: whether the bot is logged in, connected
to the configured guild (with member count), gateway latency, and database
connectivity. Auto-refreshes every 30s in a browser for monitoring at a
glance; returns HTTP `503` (instead of `200`) when anything is unhealthy, so
uptime monitors (UptimeRobot, Pingdom, etc.) can alert on status code alone.
Request with `Accept: application/json` or `?format=json` for a machine-
readable response instead of the HTML page, or use **`GET /health.json`**
directly — a fixed URL that's always JSON, handy for monitoring tools that
can't set a custom `Accept` header.

### Cleanup job

Every hour (and once on startup), expired `VerificationToken` and
`InviteLink` rows are deleted from the database so it doesn't grow
unbounded. This only removes rows that are already unusable (past their
`expiresAt`) — verification history (`Member`, `ReviewQueueEntry`) is never
touched. See `src/jobs/cleanup.ts`.

### Rate limiting & 404s

`GET`/`POST /verify/:token` are capped at 20 requests per 15 minutes per IP
(the GeoIP/VPN check is a local lookup, not a rate-limited external API call,
but this still guards against abuse); `GET /join/invite`
is capped at 60 per 15 minutes. Both return a styled/JSON error respectively
on `429`. Unmatched routes get a styled 404 page (`/join/invite` and
`/health.json` get a JSON 404 instead, matching what callers of those
endpoints expect). See `src/web/rateLimit.ts`.

### Admin commands

- **`/verify-user <user>`** — manually verifies a member (assigns the
  `Verified` role, sets `Member.status = verified` in the DB).
- **`/unverify-user <user>`** — manually revokes a member's verification
  (removes the `Verified` role, sets `Member.status = unverified`).

Both require the **Manage Roles** permission (Discord enforces this at the
command level) and work regardless of how the member was previously
verified — useful for correcting mistakes or handling manual reports.

### Admin web panel

**`GET /admin`** is a browser-based dashboard, gated behind Discord OAuth2
login. Only accounts with the **Administrator** permission in the guild can
log in — this is re-checked on every request (via `src/web/admin/session.ts`),
so a revoked Administrator permission logs someone out immediately, not just
at their next login.

- **Login**: `/admin` redirects to `/admin/login`, which bounces to Discord's
  OAuth2 consent screen (`identify` scope only — just enough to know who
  logged in) and back to `/admin/callback`. No password is stored anywhere;
  Discord is the only identity provider.
- **Dashboard**: counts of verified/pending/rejected/unverified members, plus
  the full pending review queue with **Approve**/**Deny** buttons — a web
  equivalent of the Discord embed buttons, using the exact same underlying
  logic (`src/bot/adminActions.ts`) so behavior never diverges between
  Discord and the web (role assignment, DM, kick-unless-admin, audit log —
  all identical either way).
- **Members** (`/admin/members`): search by Discord ID or username (matches
  guild members via Discord's search API), see their status/country/last
  IP/verified-at, and **Verify**/**Unverify** them — the web equivalent of
  `/verify-user` and `/unverify-user`. The dashboard's stat tiles link
  straight here filtered by status (`?status=verified`, `pending_review`,
  `rejected`, or `unverified`), capped at the 100 most recent per status.
- **Settings**: edit the allow-listed countries, max fraud score, and the
  join-DM toggle live, without touching `.env` or restarting. These are now
  stored in the database (`Settings` table) — `.env`'s `ALLOWED_COUNTRIES`,
  `MAX_FRAUD_SCORE`, and `SEND_JOIN_DM` are only used to seed that row the
  very first time the app boots against a fresh database.
- **Restart bot** (dashboard, under "System"): triggers the same graceful
  shutdown used for `SIGTERM`/`SIGINT` — closes the DB connection and logs
  the bot out cleanly, then exits and relies on the process manager's
  auto-restart (PM2's `autorestart`, Passenger, etc.) to bring it back up.
  Briefly interrupts verification; all admin sessions are lost since they're
  in-memory (see below) — you'll need to log in again afterward.
- **Health** nav link opens `/health` (see the Health check section above)
  in a new tab for a quick status glance without leaving the panel.

Sessions use `express-session` with the default in-memory store — fine for
this app's single-process deployment, but it means logins don't survive a
restart (`pm2 restart` etc.) and won't work if you ever scale to multiple
instances without adding a shared session store.

**Setup requirement**: in the Discord Developer Portal, under your
application's **OAuth2** tab, add `{PUBLIC_BASE_URL}/admin/callback` (e.g.
`https://discord.gameforce.nl/admin/callback`) to the **Redirects** list —
the login flow will fail with a Discord-side error if this doesn't exactly
match `PUBLIC_BASE_URL` in `.env`.

## Setup

1. Create a Discord application/bot at https://discord.com/developers, invite
   it to your server with the `bot` and `applications.commands` scopes
   (the latter is required for slash commands), and these bot permissions:
   Create Instant Invite, View Channels, Send Messages, Manage Roles,
   Kick Members (needed to remove members denied manual verification).
2. Enable the **Server Members Intent** for the bot in the Developer Portal
   (required for `guildMemberAdd`).
3. Create a `Verified` role below the bot's own role in the hierarchy, and
   set channel/category permissions so `@everyone` cannot send messages but
   `Verified` can.
4. GeoIP/VPN detection is self-hosted and needs no signup — data downloads
   automatically on first startup (see notes below).
5. Add a site in the [Cloudflare Turnstile dashboard](https://dash.cloudflare.com/)
   (the domain doesn't need to already use Cloudflare) to get
   `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.
6. On the same Discord application's **OAuth2** tab: copy the **Client Secret**
   (for `DISCORD_CLIENT_SECRET` — needed for the admin panel's login,
   separate from the bot token), and add `{PUBLIC_BASE_URL}/admin/callback`
   to the **Redirects** list (e.g. `https://discord.gameforce.nl/admin/callback`
   in production, `http://localhost:3000/admin/callback` for local dev).
7. Copy `.env.example` to `.env` and fill in all values, including a random
   `SESSION_SECRET` (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
8. Install dependencies and sync the schema:

   ```bash
   npm install
   npx prisma db push
   ```

   Note: on a Virtualmin-provisioned DB, the app's database user is usually
   scoped to only its own database and can't create the temporary "shadow
   database" that `prisma migrate dev` needs. `prisma db push` syncs the
   schema directly without requiring that permission (no migration history
   is kept — fine for this project's needs). If your DB user *does* have
   `CREATE DATABASE` rights, `npx prisma migrate dev --name init` works too
   and gives you tracked migration files.

9. Run locally:

   ```bash
   npm run dev
   ```

## Deploying on Virtualmin

1. Provision a MariaDB/MySQL database for the app under Virtualmin's
   database manager, and set `DATABASE_URL` accordingly. Use the `mysql://`
   scheme even for MariaDB, and percent-encode any special characters in
   the username/password.
2. Create the app as a Node.js Application in Virtualmin (Passenger). Point
   the app root at this project, entry point `dist/index.js`.
3. Double-check the Developer Portal's OAuth2 **Redirects** entry matches
   this server's `PUBLIC_BASE_URL` exactly (e.g. `https://discord.gameforce.nl/admin/callback`)
   — a mismatch here is the most common cause of admin login failing only in
   production while working locally.
4. Build before deploying:

   ```bash
   npm run build
   npx prisma db push
   ```

5. Make sure the domain/subdomain used for `PUBLIC_BASE_URL` is served over
   HTTPS (Let's Encrypt via Virtualmin) — verification links are shared
   over DM and should not be plain HTTP, and admin session cookies require
   HTTPS to be sent at all (`cookie.secure` is `"auto"` — see Admin web panel
   section above).
6. The Express app trusts exactly one reverse-proxy hop (`app.set("trust proxy", 1)`)
   so `req.ip` reflects the real visitor IP for GeoIP/VPN checks — confirm
   Virtualmin's Apache/Nginx front end sets `X-Forwarded-For` (default
   behavior), and that there's exactly one proxy between the internet and
   this app (adjust the number if you ever add another hop, e.g. a CDN).
7. Keep the bot process and web server running as a single process, managed
   by PM2 so it auto-restarts on crash or server reboot:

   ```bash
   npm install -g pm2   # if not already installed
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup          # follow the printed instructions to run PM2 on boot
   ```

   The app handles `SIGTERM`/`SIGINT` gracefully — it stops accepting new
   requests, closes the DB connection, and logs the bot out cleanly before
   exiting — so `pm2 restart discord-verify` / `pm2 stop discord-verify`
   won't cut off in-flight requests. `ecosystem.config.cjs` gives it 10s
   (`kill_timeout`) to finish before PM2 force-kills it.
   If you'd rather use Virtualmin's built-in Node.js Application (Passenger)
   support instead of PM2, that works too — Passenger manages the process
   lifecycle itself, so skip the PM2 steps above.

### PM2 command reference

All commands target the app by the name set in `ecosystem.config.cjs`
(`discord-verify`). Run from anywhere once it's started — PM2 tracks
processes globally, not per-directory.

| Command | What it does |
| --- | --- |
| `pm2 start ecosystem.config.cjs` | Start the app (first time, or after `pm2 delete`) |
| `pm2 restart discord-verify` | Stop and start again — brief downtime, picks up a new build (`npm run build`) or `.env` changes |
| `pm2 reload discord-verify` | Graceful restart via the app's `SIGINT` handler; behaves like `restart` here since this runs as a single fork-mode instance, not a cluster |
| `pm2 stop discord-verify` | Stop the process but keep it in PM2's list (won't survive a reboot until started again) |
| `pm2 delete discord-verify` | Remove it from PM2 entirely |
| `pm2 status` | List all PM2-managed processes and their state (online/stopped/errored, restarts, uptime, memory) |
| `pm2 describe discord-verify` | Detailed info on this one process (script path, restart count, env vars, etc.) |
| `pm2 logs discord-verify` | Tail logs live (`Ctrl+C` to stop watching) |
| `pm2 logs discord-verify --lines 200 --nostream` | Dump the last 200 log lines without tailing — useful for pasting into a bug report |
| `pm2 flush discord-verify` | Clear accumulated log files |
| `pm2 monit` | Live CPU/memory dashboard for all processes |
| `pm2 save` | Snapshot the current process list, so `pm2 resurrect` / boot-time startup restores it |
| `pm2 startup` | Print (and optionally run) the OS-level command to launch PM2 automatically on server reboot |
| `pm2 unstartup` | Undo `pm2 startup` |
| `pm2 resurrect` | Restore the process list from the last `pm2 save` |

Typical redeploy after pulling code changes:

```bash
cd /home/gameforce/domains/discord.gameforce.nl/Discord-Verify
npm install        # only needed if dependencies changed
npm run build
pm2 restart discord-verify
pm2 logs discord-verify --lines 50 --nostream   # confirm it came back up cleanly
```

## Notes / follow-ups

- Tune the auto-verify threshold (allowed countries, max fraud score) and
  the join-DM toggle live from `/admin` — no `.env` edits or restarts
  needed. `ALLOWED_COUNTRIES`/`MAX_FRAUD_SCORE`/`SEND_JOIN_DM` in `.env` only
  matter once, to seed the database on first boot.
- The GeoIP/VPN provider is behind `src/geo/provider.ts`'s `GeoProvider`
  interface — swap in a different service without touching route logic.
  The default implementation is fully self-hosted and open source: a
  GeoLite2-derived country database ([sapics/ip-location-db](https://github.com/sapics/ip-location-db))
  and a known-VPN-network CIDR list ([X4BNet/lists_vpn](https://github.com/X4BNet/lists_vpn))
  are downloaded into `data/geoip/` on startup and refreshed every 12h
  (`src/geo/updater.ts`, `src/jobs/geoUpdater.ts`) — no API key, no
  per-request rate limit. There's no granular fraud score from these open
  sources, so `fraudScore`/`MAX_FRAUD_SCORE` is effectively a 0/100 stand-in
  for the VPN flag now, kept only for DB/UI compatibility.
- X4BNet's CIDR list has no IPv6 data at all, so IPv6 VPN detection instead
  matches the visitor's ASN (via a combined IPv4+IPv6 ASN mmdb, same source
  as the country database) against X4BNet's curated list of known-VPN ASN
  numbers — this also runs as a secondary signal for IPv4, alongside the
  CIDR list. ASN data is best-effort: if it fails to download, country
  lookups and IPv4 CIDR-based VPN detection keep working unaffected. Check
  current status (loaded, last refreshed, range/ASN counts) and manually
  trigger a refresh or test an IP from `/admin` → **GeoIP / VPN**
  (`src/web/admin/geoRoutes.ts`).
- Private/loopback IPs (local dev with no reverse proxy, or a proxy that
  isn't forwarding the real IP) have no GeoIP data. Set
  `GEO_ALLOW_CLIENT_IP_FALLBACK=true` to have the visitor's browser report
  its own public IP for the check in that case (`src/geo/privateIp.ts`,
  `detectingIpPage()` in `src/web/views/verifyPages.ts`,
  `POST /verify/:token/local-ip`). Off by default — a visitor's browser can
  report any IP it wants, so only enable this where you trust the visitor's
  browser more than your network path (i.e. not in production behind a
  correctly configured reverse proxy).
