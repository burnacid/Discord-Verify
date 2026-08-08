import { prisma } from "./db.js";
import { config } from "./config.js";

export interface RuntimeSettings {
  allowedCountries: string[];
  maxFraudScore: number;
  sendJoinDm: boolean;
  // Used to be DISCORD_VERIFIED_ROLE_ID / DISCORD_START_HERE_CHANNEL_ID /
  // DISCORD_MOD_REVIEW_CHANNEL_ID / DISCORD_AUDIT_LOG_CHANNEL_ID env vars —
  // impossible to keep as env vars once there's more than one guild, so
  // they're admin-configurable per guild now (see "Server setup" in /admin).
  verifiedRoleId: string | null;
  startHereChannelId: string | null;
  modReviewChannelId: string | null;
  auditLogChannelId: string | null;
}

interface SettingsRow {
  allowedCountries: string;
  maxFraudScore: number;
  sendJoinDm: boolean;
  verifiedRoleId: string | null;
  startHereChannelId: string | null;
  modReviewChannelId: string | null;
  auditLogChannelId: string | null;
}

const cache = new Map<string, RuntimeSettings>();

function fromRow(row: SettingsRow): RuntimeSettings {
  return {
    allowedCountries: row.allowedCountries
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
    maxFraudScore: row.maxFraudScore,
    sendJoinDm: row.sendJoinDm,
    verifiedRoleId: row.verifiedRoleId,
    startHereChannelId: row.startHereChannelId,
    modReviewChannelId: row.modReviewChannelId,
    auditLogChannelId: row.auditLogChannelId,
  };
}

// Loads every guild's Settings row into the in-memory cache — call once at
// boot, before any request/event handler needs getRuntimeSettings().
export async function initRuntimeSettings(): Promise<void> {
  const rows = await prisma.settings.findMany();
  for (const row of rows) {
    cache.set(row.guildId, fromRow(row));
  }
}

// Seeds a Settings row for a guild that doesn't have one yet (new guild via
// guildCreate, or the startup reconciliation pass backfilling a guild added
// while the bot was offline) — config.verificationDefaults is only used as
// the *template* new guilds start from now, not a global singleton.
export async function ensureGuildSettings(guildId: string): Promise<RuntimeSettings> {
  const row = await prisma.settings.upsert({
    where: { guildId },
    update: {},
    create: {
      guildId,
      allowedCountries: config.verificationDefaults.allowedCountries.join(","),
      maxFraudScore: config.verificationDefaults.maxFraudScore,
      sendJoinDm: config.verificationDefaults.sendJoinDm,
    },
  });
  const settings = fromRow(row);
  cache.set(guildId, settings);
  return settings;
}

export function getRuntimeSettings(guildId: string): RuntimeSettings {
  const settings = cache.get(guildId);
  if (!settings) {
    throw new Error(`Runtime settings accessed for guild ${guildId} before they were loaded`);
  }
  return settings;
}

export async function updateRuntimeSettings(
  guildId: string,
  patch: Partial<RuntimeSettings>,
): Promise<RuntimeSettings> {
  const next = { ...getRuntimeSettings(guildId), ...patch };
  const row = await prisma.settings.update({
    where: { guildId },
    data: {
      allowedCountries: next.allowedCountries.join(","),
      maxFraudScore: next.maxFraudScore,
      sendJoinDm: next.sendJoinDm,
      verifiedRoleId: next.verifiedRoleId,
      startHereChannelId: next.startHereChannelId,
      modReviewChannelId: next.modReviewChannelId,
      auditLogChannelId: next.auditLogChannelId,
    },
  });
  const settings = fromRow(row);
  cache.set(guildId, settings);
  return settings;
}
