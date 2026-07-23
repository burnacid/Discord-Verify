import { randomUUID } from "node:crypto";
import { PermissionFlagsBits } from "discord.js";
import { client } from "./client.js";
import { config } from "../config.js";
import { prisma } from "../db.js";

export async function ensureMember(discordId: string, guildId: string) {
  return prisma.member.upsert({
    where: { discordId },
    update: {},
    create: { discordId, guildId },
  });
}

export async function issueVerificationToken(discordId: string): Promise<string> {
  const token = randomUUID();
  await prisma.verificationToken.create({
    data: {
      token,
      discordId,
      expiresAt: new Date(Date.now() + config.verification.tokenTtlMs),
    },
  });
  return token;
}

export async function sendDirectMessage(discordId: string, message: string): Promise<boolean> {
  try {
    const user = await client.users.fetch(discordId);
    await user.send(message);
    return true;
  } catch {
    return false;
  }
}

export async function sendVerificationDm(discordId: string, token: string): Promise<boolean> {
  const link = `${config.web.publicBaseUrl}/verify/${token}`;
  return sendDirectMessage(
    discordId,
    `Welcome! Please verify your membership by opening the link below within 24 hours:\n${link}`,
  );
}

export async function postStartHereFallback(discordId: string, token: string): Promise<void> {
  if (!config.discord.startHereChannelId) return;
  const link = `${config.web.publicBaseUrl}/verify/${token}`;
  const channel = await client.channels.fetch(config.discord.startHereChannelId);
  if (channel?.isTextBased() && !channel.isThread() && !channel.isDMBased()) {
    await channel.send(`<@${discordId}> please enable DMs, or verify here: ${link}`);
  }
}

export async function assignVerifiedRole(discordId: string): Promise<void> {
  const guild = await client.guilds.fetch(config.discord.guildId);
  const member = await guild.members.fetch(discordId);
  await member.roles.add(config.discord.verifiedRoleId);
}

export async function hasVerifiedRole(discordId: string): Promise<boolean> {
  const guild = await client.guilds.fetch(config.discord.guildId);
  const member = await guild.members.fetch(discordId);
  return member.roles.cache.has(config.discord.verifiedRoleId);
}

/** Discord API code for "member not found in this guild" (e.g. they left). */
const UNKNOWN_MEMBER_CODE = 10_007;

export async function removeVerifiedRole(discordId: string): Promise<void> {
  const guild = await client.guilds.fetch(config.discord.guildId);
  let member;
  try {
    member = await guild.members.fetch(discordId);
  } catch (err) {
    if (isDiscordErrorCode(err, UNKNOWN_MEMBER_CODE)) return;
    throw err;
  }
  await member.roles.remove(config.discord.verifiedRoleId);
}

export async function isAdminMember(discordId: string): Promise<boolean> {
  const guild = await client.guilds.fetch(config.discord.guildId);
  try {
    const member = await guild.members.fetch(discordId);
    return member.permissions.has(PermissionFlagsBits.Administrator);
  } catch (err) {
    if (isDiscordErrorCode(err, UNKNOWN_MEMBER_CODE)) return false;
    throw err;
  }
}

export async function kickMember(discordId: string, reason?: string): Promise<void> {
  const guild = await client.guilds.fetch(config.discord.guildId);
  try {
    await guild.members.kick(discordId, reason);
  } catch (err) {
    if (isDiscordErrorCode(err, UNKNOWN_MEMBER_CODE)) return;
    throw err;
  }
}

function isDiscordErrorCode(err: unknown, code: number): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === code;
}
