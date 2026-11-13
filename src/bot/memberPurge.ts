import { EmbedBuilder } from "discord.js";
import { prisma } from "../db.js";
import { client } from "./client.js";
import { getRuntimeSettings } from "../runtimeSettings.js";
import { postAuditLog } from "./auditLog.js";

// Removals the bot itself is about to cause (currently: kicking a member
// whose manual review was denied — see decideReviewEntry in adminActions.ts).
// That flow annotates the mod-review message itself ("Denied by …"), so the
// purge triggered by the resulting guildMemberRemove must not also stamp it
// "Left the server" — the two can arrive in either order.
const expectedRemovals = new Set<string>();

const key = (guildId: string, discordId: string) => `${guildId}:${discordId}`;

export function expectRemoval(guildId: string, discordId: string): void {
  expectedRemovals.add(key(guildId, discordId));
}

export function clearExpectedRemoval(guildId: string, discordId: string): void {
  expectedRemovals.delete(key(guildId, discordId));
}

// Keeps `IN (...)` lists to a sane size when the periodic sweep finds a
// large backlog (e.g. the first run after this was introduced).
const CHUNK_SIZE = 500;

/**
 * Deletes everything stored about members who are no longer in the guild:
 * their Member row, verification tokens, verification visit history and
 * review queue entries. A rejoin therefore starts from scratch — including
 * previously verified or rejected members.
 *
 * Pending review entries still have live Approve/Deny buttons in the
 * mod-review channel; those messages are updated to say the member left
 * first, so a mod doesn't click a button that can only answer "not found".
 */
export async function purgeMemberData(
  guildId: string,
  discordIds: string[],
  reason: "left" | "sweep" = "left",
): Promise<number> {
  let purged = 0;
  for (let i = 0; i < discordIds.length; i += CHUNK_SIZE) {
    const chunk = discordIds.slice(i, i + CHUNK_SIZE);

    // Captured before deletion so only users we actually held data for get an
    // audit entry (a leave by someone who never interacted with the bot is
    // not worth logging).
    const known = await prisma.member.findMany({
      where: { guildId, discordId: { in: chunk } },
      select: { discordId: true, status: true },
    });

    const pendingReviews = await prisma.reviewQueueEntry.findMany({
      where: { guildId, discordId: { in: chunk }, status: "pending", messageId: { not: null } },
      select: { discordId: true, messageId: true },
    });
    for (const review of pendingReviews) {
      if (expectedRemovals.has(key(guildId, review.discordId))) continue;
      await markReviewMessageMemberLeft(guildId, review.messageId!);
    }

    const [, , , members] = await prisma.$transaction([
      prisma.verificationToken.deleteMany({ where: { guildId, discordId: { in: chunk } } }),
      prisma.reviewQueueEntry.deleteMany({ where: { guildId, discordId: { in: chunk } } }),
      prisma.verificationVisit.deleteMany({ where: { guildId, discordId: { in: chunk } } }),
      prisma.member.deleteMany({ where: { guildId, discordId: { in: chunk } } }),
    ]);
    purged += members.count;

    const how = reason === "left" ? "left the server" : "is no longer in the server (found by the periodic sweep)";
    for (const m of known) {
      await postAuditLog(guildId, `<@${m.discordId}> ${how} — stored data deleted (was **${m.status}**).`, {
        category: "member",
        targetId: m.discordId,
        discord: false,
      });
    }
  }
  return purged;
}

/**
 * Purges data for every user the DB knows about in this guild who isn't in
 * `presentIds` (the guild's full, freshly fetched member list). Catches
 * leaves that happened while the bot was offline, when no
 * guildMemberRemove event was delivered.
 */
export async function sweepDepartedMembers(guildId: string, presentIds: Set<string>): Promise<number> {
  // Defensive: the bot is itself a member, so an empty list means the fetch
  // went wrong — never treat that as "everyone left".
  if (presentIds.size === 0) return 0;

  // VerificationVisit has no FK to Member, so it can hold users with no
  // Member row — include those too.
  const [members, visits] = await Promise.all([
    prisma.member.findMany({ where: { guildId }, select: { discordId: true } }),
    prisma.verificationVisit.findMany({ where: { guildId }, select: { discordId: true }, distinct: ["discordId"] }),
  ]);

  const departed = new Set<string>();
  for (const { discordId } of [...members, ...visits]) {
    if (!presentIds.has(discordId)) departed.add(discordId);
  }
  if (departed.size === 0) return 0;

  return purgeMemberData(guildId, [...departed], "sweep");
}

async function markReviewMessageMemberLeft(guildId: string, messageId: string): Promise<void> {
  const modReviewChannelId = getRuntimeSettings(guildId).modReviewChannelId;
  if (!modReviewChannelId) return;

  try {
    const channel = await client.channels.fetch(modReviewChannelId);
    if (!channel?.isTextBased() || channel.isThread() || channel.isDMBased()) return;

    const message = await channel.messages.fetch(messageId);
    const existingEmbed = message.embeds[0];
    const embed = existingEmbed ? EmbedBuilder.from(existingEmbed) : new EmbedBuilder();
    embed.addFields({ name: "Resolved", value: "Member left the server" }).setColor(0x80848e);

    await message.edit({ embeds: [embed], components: [] });
  } catch (err) {
    console.error("Failed to update the mod-review message for a departed member", err);
  }
}
