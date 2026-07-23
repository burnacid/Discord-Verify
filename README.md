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
  reply. If a **previously-verified** member rejoins, the bot restores
  their `Verified` role directly instead of sending them through GeoIP/VPN
  checks again (falls back to the normal flow only if role restoration
  fails).
- **`GET /verify/:token`** — looks up the token, runs the visitor's IP
  through the GeoIP/VPN provider (cached on the token so page reloads don't
  re-query it), and either:
  - auto-assigns the `Verified` Discord role (allow-listed country + low
    fraud/VPN risk) and shows a success page, or
  - shows a form asking for **name and email**. Submitting it
    (`POST /verify/:token`) creates a review-queue entry — including that
    name/email — and posts an embed with Approve/Deny buttons in
    `DISCORD_MOD_REVIEW_CHANNEL_ID`.
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
(each fresh check can trigger a paid GeoIP/VPN lookup); `GET /join/invite`
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
4. Sign up for an [IPQualityScore](https://www.ipqualityscore.com/) API key
   (or swap the provider in `src/geo/provider.ts`).
5. Copy `.env.example` to `.env` and fill in all values.
6. Install dependencies and sync the schema:

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

7. Run locally:

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
3. Build before deploying:

   ```bash
   npm run build
   npx prisma db push
   ```

4. Make sure the domain/subdomain used for `PUBLIC_BASE_URL` is served over
   HTTPS (Let's Encrypt via Virtualmin) — verification links are shared
   over DM and should not be plain HTTP.
5. The Express app trusts the reverse proxy (`app.set("trust proxy", true)`)
   so `req.ip` reflects the real visitor IP for GeoIP/VPN checks — confirm
   Virtualmin's Apache/Nginx front end sets `X-Forwarded-For` (default
   behavior).
6. Keep the bot process and web server running as a single process, managed
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

## Notes / follow-ups

- `ALLOWED_COUNTRIES` and `MAX_FRAUD_SCORE` in `.env` tune the auto-verify
  threshold; adjust based on observed false positives/negatives in the
  review queue.
- The GeoIP/VPN provider is behind `src/geo/provider.ts`'s `GeoProvider`
  interface — swap in a different service without touching route logic.
