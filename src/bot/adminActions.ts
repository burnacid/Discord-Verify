import { EmbedBuilder } from "discord.js";
import { prisma } from "../db.js";
import { client } from "./client.js";
import { config } from "../config.js";
import { postAuditLog } from "./auditLog.js";
import {
  assignVerifiedRole,
  ensureMember,
  isAdminMember,
  kickMember,
  removeVerifiedRole,
  sendDirectMessage,
} from "./verificationService.js";

export type ActionResult = { ok: true } | { ok: false; reason: string };

/**
 * Shared logic behind both the /verify-user Discord command and the admin
 * web panel's "verify" action, so the two surfaces can never drift.
 */
export async function verifyMember(
  discordId: string,
  guildId: string,
  decidedById: string,
  via: string,
): Promise<ActionResult> {
  await ensureMember(discordId, guildId);

  try {
    await assignVerifiedRole(discordId);
  } catch (err) {
    console.error(`Failed to assign verified role via ${via}`, err);
    return {
      ok: false,
      reason: "Couldn't assign the Verified role. Check the bot's permissions/role position and try again.",
    };
  }

  await prisma.member.update({
    where: { discordId },
    data: { status: "verified", verifiedAt: new Date() },
  });

  await sendDirectMessage(discordId, "You've been manually verified! You can now post in the server.");
  await postAuditLog(`<@${discordId}> was manually **verified** by <@${decidedById}> via ${via}.`);

  return { ok: true };
}

/** Shared logic behind /unverify-user and the admin web panel's "unverify" action. */
export async function unverifyMember(
  discordId: string,
  guildId: string,
  decidedById: string,
  via: string,
): Promise<ActionResult> {
  await ensureMember(discordId, guildId);

  try {
    await removeVerifiedRole(discordId);
  } catch (err) {
    console.error(`Failed to remove verified role via ${via}`, err);
    return {
      ok: false,
      reason: "Couldn't remove the Verified role. Check the bot's permissions/role position and try again.",
    };
  }

  await prisma.member.update({
    where: { discordId },
    data: { status: "unverified", verifiedAt: null },
  });

  await postAuditLog(`<@${discordId}> was manually **unverified** by <@${decidedById}> via ${via}.`);

  return { ok: true };
}

export type ReviewDecisionResult =
  | { ok: true; deniedAdmin: boolean }
  | { ok: false; reason: "not_found" | "already_resolved" | "role_failed" | "kick_failed"; entryStatus?: string };

/**
 * Shared logic behind the Discord review-queue Approve/Deny buttons and the
 * admin web panel's review actions. Handles role assignment or kick-unless-
 * admin, DB updates, the member DM, and the audit log entry.
 */
export async function decideReviewEntry(
  entryId: string,
  approve: boolean,
  decidedById: string,
  note?: string,
): Promise<ReviewDecisionResult> {
  const entry = await prisma.reviewQueueEntry.findUnique({ where: { id: entryId } });
  if (!entry) {
    return { ok: false, reason: "not_found" };
  }
  if (entry.status !== "pending") {
    return { ok: false, reason: "already_resolved", entryStatus: entry.status };
  }

  let deniedAdmin = false;

  if (approve) {
    try {
      await assignVerifiedRole(entry.discordId);
    } catch (err) {
      console.error("Failed to assign verified role from review queue", err);
      return { ok: false, reason: "role_failed" };
    }
  } else {
    deniedAdmin = await isAdminMember(entry.discordId);
    if (!deniedAdmin) {
      await sendDirectMessage(
        entry.discordId,
        "Your verification request was denied, and you have been removed from the server.",
      );
      try {
        await kickMember(entry.discordId, "Denied manual verification");
      } catch (err) {
        console.error("Failed to kick member after denial", err);
        return { ok: false, reason: "kick_failed" };
      }
    } else {
      await sendDirectMessage(entry.discordId, "Your verification request was denied.");
    }
  }

  const reviewNote = !approve && note ? note : null;

  await prisma.reviewQueueEntry.update({
    where: { id: entryId },
    data: {
      status: approve ? "approved" : "denied",
      reviewedBy: decidedById,
      reviewedAt: new Date(),
      reviewNote,
    },
  });

  await prisma.member.update({
    where: { discordId: entry.discordId },
    data: {
      status: approve ? "verified" : "rejected",
      verifiedAt: approve ? new Date() : null,
    },
  });

  const noteSuffix = reviewNote ? ` — note: ${reviewNote}` : "";

  if (approve) {
    await sendDirectMessage(
      entry.discordId,
      "Your verification request was approved! You can now post in the server.",
    );
    await postAuditLog(
      `<@${entry.discordId}> was **approved** by <@${decidedById}> (reason: ${entry.reason}).`,
    );
  } else {
    await postAuditLog(
      `<@${entry.discordId}> was **denied** by <@${decidedById}> (reason: ${entry.reason})` +
        `${deniedAdmin ? " — not kicked (admin)" : " and removed from the server"}.${noteSuffix}`,
    );
  }

  await markReviewMessageResolved(entry.messageId, approve, decidedById, reviewNote);

  return { ok: true, deniedAdmin };
}

// Removes the Approve/Deny buttons from the original mod-review message and
// adds a "Resolved" field showing who decided and (on deny) their note —
// covers both the Discord-button and web-panel decision paths, since both
// go through decideReviewEntry. Never lets a failure here fail the overall
// decision — the role assignment/DB update already succeeded by this point.
async function markReviewMessageResolved(
  messageId: string | null,
  approve: boolean,
  decidedById: string,
  note: string | null,
): Promise<void> {
  if (!messageId || !config.discord.modReviewChannelId) return;

  try {
    const channel = await client.channels.fetch(config.discord.modReviewChannelId);
    if (!channel?.isTextBased() || channel.isThread() || channel.isDMBased()) return;

    const message = await channel.messages.fetch(messageId);
    const existingEmbed = message.embeds[0];
    const embed = existingEmbed ? EmbedBuilder.from(existingEmbed) : new EmbedBuilder();

    const resolutionText = approve ? `Approved by <@${decidedById}>` : `Denied by <@${decidedById}>`;
    embed
      .addFields({ name: "Resolved", value: note ? `${resolutionText}\n${note}` : resolutionText })
      .setColor(approve ? 0x23a559 : 0xf23f42);

    await message.edit({ embeds: [embed], components: [] });
  } catch (err) {
    console.error("Failed to update the mod-review message after a decision", err);
  }
}
