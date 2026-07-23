import { prisma } from "../db.js";

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
}

export function startCleanupJob(intervalMs: number): NodeJS.Timeout {
  cleanupExpiredRecords().catch((err) => console.error("Cleanup job failed", err));
  return setInterval(() => {
    cleanupExpiredRecords().catch((err) => console.error("Cleanup job failed", err));
  }, intervalMs);
}
