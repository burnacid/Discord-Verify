import { EmbedBuilder } from "discord.js";
import { client } from "./client.js";
import { config } from "../config.js";

export async function postAuditLog(description: string): Promise<void> {
  if (!config.discord.auditLogChannelId) return;

  try {
    const channel = await client.channels.fetch(config.discord.auditLogChannelId);
    if (!channel?.isTextBased() || channel.isThread() || channel.isDMBased()) return;

    const embed = new EmbedBuilder().setDescription(description).setColor(0x5865f2).setTimestamp();
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Failed to post audit log entry", err);
  }
}
