import { prisma } from "../db.js";
import { client } from "../bot/client.js";
import { getRuntimeSettings } from "../runtimeSettings.js";
import { postAuditLog } from "../bot/auditLog.js";
import { runTracked } from "./jobTracking.js";

// Reconciles Member.status with actual Discord role membership. Verification
// is normally set via verifyMember()/unverifyMember() (adminActions.ts),
// which change the DB and the role together — but an admin can also add/
// remove the verified role directly in Discord, bypassing those functions
// entirely. This keeps the admin portal accurate regardless of how the role
// got assigned.
export async function syncGuildVerifiedRole(guildId: string): Promise<void> {
  const verifiedRoleId = getRuntimeSettings(guildId).verifiedRoleId;
  if (!verifiedRoleId) return;

  const guild = await client.guilds.fetch(guildId);
  const members = await guild.members.fetch();

  const dbVerified = await prisma.member.findMany({
    where: { guildId, status: "verified" },
    select: { discordId: true },
  });
  const dbVerifiedIds = new Set(dbVerified.map((m) => m.discordId));

  for (const member of members.values()) {
    const hasRole = member.roles.cache.has(verifiedRoleId);
    const isDbVerified = dbVerifiedIds.has(member.id);

    try {
      if (hasRole && !isDbVerified) {
        await prisma.member.upsert({
          where: { discordId_guildId: { discordId: member.id, guildId } },
          update: { status: "verified", verifiedAt: new Date() },
          create: { discordId: member.id, guildId, status: "verified", verifiedAt: new Date() },
        });
        await postAuditLog(
          guildId,
          `<@${member.id}> was marked **verified** (has the Verified role but wasn't marked verified).`,
        );
      } else if (!hasRole && isDbVerified) {
        await prisma.member.update({
          where: { discordId_guildId: { discordId: member.id, guildId } },
          data: { status: "unverified", verifiedAt: null },
        });
        await postAuditLog(
          guildId,
          `<@${member.id}> was marked **unverified** (lost the Verified role outside the bot).`,
        );
      }
    } catch (err) {
      console.error(`Verified role sync failed for member ${member.id} in guild ${guildId}`, err);
    }
  }
}

export async function syncAllGuildsVerifiedRole(): Promise<void> {
  const guilds = await prisma.guild.findMany();
  for (const guild of guilds) {
    try {
      await syncGuildVerifiedRole(guild.id);
    } catch (err) {
      console.error(`Verified role sync failed for guild ${guild.id}`, err);
    }
  }
}

export function runOnce(): Promise<void> {
  return runTracked("roleSync", syncAllGuildsVerifiedRole);
}

export function startRoleSyncJob(intervalMs: number): NodeJS.Timeout {
  runOnce().catch((err) => console.error("Role sync job failed", err));
  return setInterval(() => {
    runOnce().catch((err) => console.error("Role sync job failed", err));
  }, intervalMs);
}
