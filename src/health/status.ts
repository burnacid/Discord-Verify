import { client } from "../bot/client.js";
import { config } from "../config.js";
import { prisma } from "../db.js";

export const startedAt = new Date();

export interface HealthStatus {
  ok: boolean;
  uptimeSeconds: number;
  discord: {
    ready: boolean;
    tag: string | null;
    wsPingMs: number | null;
    guildConnected: boolean;
    memberCount: number | null;
  };
  database: {
    ok: boolean;
    error: string | null;
  };
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const ready = client.isReady();

  let guildConnected = false;
  let memberCount: number | null = null;
  if (ready) {
    try {
      const guild = await client.guilds.fetch(config.discord.guildId);
      guildConnected = true;
      memberCount = guild.memberCount;
    } catch {
      guildConnected = false;
    }
  }

  let dbOk = true;
  let dbError: string | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    dbOk = false;
    dbError = err instanceof Error ? err.message : "Unknown database error";
  }

  return {
    ok: ready && guildConnected && dbOk,
    uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    discord: {
      ready,
      tag: client.user?.tag ?? null,
      wsPingMs: ready ? Math.round(client.ws.ping) : null,
      guildConnected,
      memberCount,
    },
    database: {
      ok: dbOk,
      error: dbError,
    },
  };
}
