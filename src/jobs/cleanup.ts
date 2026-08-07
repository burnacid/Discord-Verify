import { prisma } from "../db.js";
import { sweepEmptyJtcChannels } from "../bot/events/voiceStateUpdate.js";

export async function cleanupExpiredRecords(): Promise<void> {
  const now = new Date();

  const [tokens, invites] = await Promise.all([
    prisma.verificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.inviteLink.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);

  if (tokens.count || invites.count) {
    console.log(
      `Cleanup: removed ${tokens.count} expired verification token(s), ${invites.count} expired invite link(s)`,
    );
  }

  // Self-heals JtcChannel rows for voice channels deleted outside the bot's
  // control (e.g. manually by a mod) — previously only ran once at startup
  // (src/index.ts), so a mid-session deletion would linger tracked until
  // the next restart.
  await sweepEmptyJtcChannels().catch((err) => console.error("JTC sweep during cleanup failed", err));
}

export function startCleanupJob(intervalMs: number): NodeJS.Timeout {
  cleanupExpiredRecords().catch((err) => console.error("Cleanup job failed", err));
  return setInterval(() => {
    cleanupExpiredRecords().catch((err) => console.error("Cleanup job failed", err));
  }, intervalMs);
}
