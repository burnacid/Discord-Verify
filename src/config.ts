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
    guildId: required("DISCORD_GUILD_ID"),
    verifiedRoleId: required("DISCORD_VERIFIED_ROLE_ID"),
    startHereChannelId: process.env.DISCORD_START_HERE_CHANNEL_ID ?? null,
    modReviewChannelId: process.env.DISCORD_MOD_REVIEW_CHANNEL_ID ?? null,
    auditLogChannelId: process.env.DISCORD_AUDIT_LOG_CHANNEL_ID ?? null,
  },
  web: {
    port: Number(process.env.PORT ?? 3000),
    publicBaseUrl: required("PUBLIC_BASE_URL"),
  },
  verification: {
    allowedCountries: (process.env.ALLOWED_COUNTRIES ?? "")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
    maxFraudScore: Number(process.env.MAX_FRAUD_SCORE ?? 75),
    tokenTtlMs: 24 * 60 * 60 * 1000,
  },
  invite: {
    ttlSeconds: 60 * 60,
  },
} as const;
