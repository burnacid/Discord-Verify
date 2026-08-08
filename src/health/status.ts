import { client } from "../bot/client.js";
import { prisma } from "../db.js";

export const startedAt = new Date();

export interface HealthStatus {
  ok: boolean;
  uptimeSeconds: number;
  discord: {
    ready: boolean;
    tag: string | null;
    wsPingMs: number | null;
    guildCount: number;
    memberCount: number;
  };
  database: {
    ok: boolean;
    error: string | null;
  };
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const ready = client.isReady();

  // Multi-guild: "healthy" no longer means one specific configured guild is
  // reachable — it means the bot is connected to at least one of the guilds
  // it serves. memberCount sums across all of them.
  const guildCount = ready ? client.guilds.cache.size : 0;
  const memberCount = ready
    ? [...client.guilds.cache.values()].reduce((sum, guild) => sum + guild.memberCount, 0)
    : 0;

  let dbOk = true;
  let dbError: string | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    dbOk = false;
    dbError = err instanceof Error ? err.message : "Unknown database error";
  }

  return {
    ok: ready && guildCount > 0 && dbOk,
    uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    discord: {
      ready,
      tag: client.user?.tag ?? null,
      wsPingMs: ready ? Math.round(client.ws.ping) : null,
      guildCount,
      memberCount,
    },
    database: {
      ok: dbOk,
      error: dbError,
    },
  };
}
