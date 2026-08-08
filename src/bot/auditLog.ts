import { EmbedBuilder } from "discord.js";
import { client } from "./client.js";
import { getRuntimeSettings } from "../runtimeSettings.js";

export async function postAuditLog(guildId: string, description: string): Promise<void> {
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
