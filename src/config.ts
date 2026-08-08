import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  // guildId and its sibling role/channel IDs used to live here as single
  // global env vars — structurally impossible once the bot serves many
  // guilds. They're per-guild, admin-configurable DB settings now (see
  // src/runtimeSettings.ts's verifiedRoleId/startHereChannelId/
  // modReviewChannelId/auditLogChannelId, set from /admin's "Server setup").
  // Only the bot's own application-level credentials remain here — one
  // Discord Application (and its one bot token) can be installed into any
  // number of guilds simultaneously.
  discord: {
    token: required("DISCORD_TOKEN"),
    clientId: required("DISCORD_CLIENT_ID"),
    clientSecret: required("DISCORD_CLIENT_SECRET"),
  },
  web: {
    port: Number(process.env.PORT ?? 3000),
    publicBaseUrl: required("PUBLIC_BASE_URL"),
    sessionSecret: required("SESSION_SECRET"),
  },
  // Seed/default values for the DB-backed Settings row (see src/runtimeSettings.ts).
  // Only used the very first time the app boots against a fresh database —
  // after that, the admin panel is the source of truth and these are ignored.
  verificationDefaults: {
    allowedCountries: (process.env.ALLOWED_COUNTRIES ?? "")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
    maxFraudScore: Number(process.env.MAX_FRAUD_SCORE ?? 75),
    sendJoinDm: process.env.SEND_JOIN_DM !== "false",
  },
  verification: {
    tokenTtlMs: 24 * 60 * 60 * 1000,
  },
  invite: {
    ttlSeconds: 60 * 60,
  },
  captcha: {
    siteKey: required("TURNSTILE_SITE_KEY"),
    secretKey: required("TURNSTILE_SECRET_KEY"),
  },
  geo: {
    // Off by default: trusting a client-reported IP is only safe when the
    // server genuinely can't see a real one (local dev, or a reverse proxy
    // that isn't forwarding it) — see src/geo/privateIp.ts and the
    // POST /verify/:token/local-ip route in src/web/routes/verify.ts.
    allowClientIpFallback: process.env.GEO_ALLOW_CLIENT_IP_FALLBACK === "true",
  },
} as const;
