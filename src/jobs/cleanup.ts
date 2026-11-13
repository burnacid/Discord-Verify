import { prisma } from "../db.js";
import { sweepEmptyJtcChannels } from "../bot/events/voiceStateUpdate.js";
import { runTracked } from "./jobTracking.js";
import { AUDIT_LOG_RETENTION_DAYS } from "../bot/auditLog.js";

export async function cleanupExpiredRecords(): Promise<void> {
  const now = new Date();

  const auditCutoff = new Date(now.getTime() - AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const [tokens, invites, auditEntries] = await Promise.all([
    prisma.verificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.inviteLink.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.auditLogEntry.deleteMany({ where: { createdAt: { lt: auditCutoff } } }),
  ]);

  if (tokens.count || invites.count || auditEntries.count) {
    console.log(
      `Cleanup: removed ${tokens.count} expired verification token(s), ${invites.count} expired invite link(s), ` +
        `${auditEntries.count} audit log entr${auditEntries.count === 1 ? "y" : "ies"} older than ${AUDIT_LOG_RETENTION_DAYS} days`,
    );
  }

  // Self-heals JtcChannel rows for voice channels deleted outside the bot's
  // control (e.g. manually by a mod) — previously only ran once at startup
  // (src/index.ts), so a mid-session deletion would linger tracked until
  // the next restart.
  await sweepEmptyJtcChannels().catch((err) => console.error("JTC sweep during cleanup failed", err));
}

export function runOnce(): Promise<void> {
  return runTracked("cleanup", cleanupExpiredRecords);
}

export function startCleanupJob(intervalMs: number): NodeJS.Timeout {
  runOnce().catch((err) => console.error("Cleanup job failed", err));
  return setInterval(() => {
    runOnce().catch((err) => console.error("Cleanup job failed", err));
  }, intervalMs);
}
