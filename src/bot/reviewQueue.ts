import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { client } from "./client.js";
import { prisma } from "../db.js";
import { getRuntimeSettings } from "../runtimeSettings.js";
import type { IpCheckResult } from "../geo/provider.js";

export interface ReviewSubmission {
  name: string;
  email: string;
}

export async function createReviewEntry(
  discordId: string,
  guildId: string,
  reason: "vpn" | "country",
  ip: string,
  ipCheck: IpCheckResult,
  submission: ReviewSubmission,
): Promise<void> {
  const entry = await prisma.reviewQueueEntry.create({
    data: {
      discordId,
      guildId,
      reason,
      ipInfo: ipCheck.raw as object,
      name: submission.name,
      email: submission.email,
    },
  });

  const modReviewChannelId = getRuntimeSettings(guildId).modReviewChannelId;
  if (!modReviewChannelId) return;
  const channel = await client.channels.fetch(modReviewChannelId);
  if (!channel?.isTextBased() || channel.isThread() || channel.isDMBased()) return;

  const embed = new EmbedBuilder()
    .setTitle("Verification review requested")
    .addFields(
      { name: "User", value: `<@${discordId}>`, inline: true },
      { name: "Reason", value: reason, inline: true },
      { name: "IP", value: ip, inline: true },
      { name: "Country", value: ipCheck.countryCode ?? "unknown", inline: true },
      { name: "Fraud score", value: String(ipCheck.fraudScore), inline: true },
      { name: "Name", value: submission.name, inline: true },
      { name: "Email", value: submission.email, inline: true },
    )
    .setColor(0xf5a623)
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`review_approve:${entry.id}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`review_deny:${entry.id}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger),
  );

  const sent = await channel.send({ embeds: [embed], components: [row] });
  await prisma.reviewQueueEntry.update({ where: { id: entry.id }, data: { messageId: sent.id } });
}

// Shared by the dashboard and the /review-queue command so both list the
// same pending entries the same way, scoped to one guild.
export function listPendingReviewEntries(guildId: string) {
  return prisma.reviewQueueEntry.findMany({
    where: { status: "pending", guildId },
    include: { member: true },
    orderBy: { createdAt: "asc" },
  });
}
