import { EmbedBuilder } from "discord.js";
import { client } from "./client.js";
import { prisma } from "../db.js";
import { getRuntimeSettings } from "../runtimeSettings.js";

export const AUDIT_CATEGORIES = {
  verification: "Verification",
  review: "Manual review",
  role_sync: "Role sync",
  member: "Members",
  admin: "Admin panel",
} as const;

export type AuditCategory = keyof typeof AUDIT_CATEGORIES;

export interface AuditOptions {
  category: AuditCategory;
  // Who performed the action; omit for the system or the member themselves.
  actorId?: string | null;
  // Whom the action was about — lets the admin page filter by user.
  targetId?: string | null;
  // Also post to the guild's Discord audit-log channel (if configured).
  // Defaults to true; high-volume/low-signal entries pass false so the
  // channel keeps its existing noise level.
  discord?: boolean;
}

// Entries older than this are deleted by the cleanup job (src/jobs/cleanup.ts).
export const AUDIT_LOG_RETENTION_DAYS = 180;

/**
 * Records an audit entry in the database (shown on the admin "Audit Log"
 * page) and, unless `discord: false`, mirrors it to the guild's Discord
 * audit-log channel. Never throws — auditing must not break the action
 * being audited.
 */
export async function postAuditLog(guildId: string, description: string, options: AuditOptions): Promise<void> {
  try {
    await prisma.auditLogEntry.create({
      data: {
        guildId,
        category: options.category,
        message: description,
        actorId: options.actorId ?? null,
        targetId: options.targetId ?? null,
      },
    });
  } catch (err) {
    console.error("Failed to store audit log entry", err);
  }

  if (options.discord === false) return;

  const auditLogChannelId = getRuntimeSettings(guildId).auditLogChannelId;
  if (!auditLogChannelId) return;

  try {
    const channel = await client.channels.fetch(auditLogChannelId);
    if (!channel?.isTextBased() || channel.isThread() || channel.isDMBased()) return;

    const embed = new EmbedBuilder().setDescription(description).setColor(0x5865f2).setTimestamp();
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Failed to post audit log entry", err);
  }
}
