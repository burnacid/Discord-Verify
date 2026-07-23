import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  discord: {
    token: required("DISCORD_TOKEN"),
    clientId: required("DISCORD_CLIENT_ID"),
    clientSecret: required("DISCORD_CLIENT_SECRET"),
    guildId: required("DISCORD_GUILD_ID"),
    verifiedRoleId: required("DISCORD_VERIFIED_ROLE_ID"),
    startHereChannelId: process.env.DISCORD_START_HERE_CHANNEL_ID ?? null,
    modReviewChannelId: process.env.DISCORD_MOD_REVIEW_CHANNEL_ID ?? null,
    auditLogChannelId: process.env.DISCORD_AUDIT_LOG_CHANNEL_ID ?? null,
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
} as const;
