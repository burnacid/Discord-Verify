import { ChannelType } from "discord.js";
import { client } from "./client.js";
import { config } from "../config.js";
import { prisma } from "../db.js";

/**
 * Returns a still-valid (<1h old) invite URL for the given guild, reusing a
 * cached one if it hasn't expired yet, otherwise minting a fresh one via
 * the Discord API.
 */
export async function getOrCreateJoinInvite(guildId: string): Promise<string> {
  const now = new Date();

  const cached = await prisma.inviteLink.findFirst({
    where: { guildId, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (cached) {
    return `https://discord.gg/${cached.code}`;
  }

  const guild = await client.guilds.fetch(guildId);
  const channels = await guild.channels.fetch();
  const textChannel = channels.find((c) => c?.type === ChannelType.GuildText);
  if (!textChannel) {
    throw new Error("No invitable text channel found in guild");
  }

  const invite = await textChannel.createInvite({
    maxAge: config.invite.ttlSeconds,
    unique: true,
    reason: "Public join page invite",
  });

  await prisma.inviteLink.create({
    data: {
      code: invite.code,
      guildId,
      expiresAt: new Date(now.getTime() + config.invite.ttlSeconds * 1000),
    },
  });

  return `https://discord.gg/${invite.code}`;
}
