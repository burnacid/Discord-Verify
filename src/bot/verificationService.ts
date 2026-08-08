import { randomUUID } from "node:crypto";
import { PermissionFlagsBits } from "discord.js";
import { client } from "./client.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { getRuntimeSettings } from "../runtimeSettings.js";

export async function ensureMember(discordId: string, guildId: string) {
  return prisma.member.upsert({
    where: { discordId_guildId: { discordId, guildId } },
    update: {},
    create: { discordId, guildId },
  });
}

export async function issueVerificationToken(discordId: string, guildId: string): Promise<string> {
  const token = randomUUID();
  await prisma.verificationToken.create({
    data: {
      token,
      discordId,
      guildId,
      expiresAt: new Date(Date.now() + config.verification.tokenTtlMs),
    },
  });
  return token;
}

/**
 * Shared self-service reply logic behind /verify and DMing the bot directly:
 * already verified (self-heals a missing role), pending review, or a fresh
 * verification link.
 */
export async function getVerifyStatusMessage(discordId: string, guildId: string): Promise<string> {
  const member = await ensureMember(discordId, guildId);

  if (member.status === "verified") {
    if (await hasVerifiedRole(discordId, guildId)) {
      return "You're already verified.";
    }
    // DB says verified but the role is missing (e.g. a prior role assignment failed) — retry.
    try {
      await assignVerifiedRole(discordId, guildId);
      return "You're verified! The Verified role has been re-applied.";
    } catch (err) {
      console.error("Failed to re-apply verified role", err);
      return "You're marked as verified, but I couldn't apply the role. Please contact a moderator.";
    }
  }

  if (member.status === "pending_review") {
    return "Your verification is already pending moderator review.";
  }

  const token = await issueVerificationToken(discordId, guildId);
  const link = `${config.web.publicBaseUrl}/verify/${token}`;
  return `Verify here (link expires in 24 hours): ${link}`;
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

export async function postStartHereFallback(discordId: string, guildId: string, token: string): Promise<void> {
  const startHereChannelId = getRuntimeSettings(guildId).startHereChannelId;
  if (!startHereChannelId) return;
  const link = `${config.web.publicBaseUrl}/verify/${token}`;
  const channel = await client.channels.fetch(startHereChannelId);
  if (channel?.isTextBased() && !channel.isThread() && !channel.isDMBased()) {
    await channel.send(`<@${discordId}> please enable DMs, or verify here: ${link}`);
  }
}

function requireVerifiedRoleId(guildId: string): string {
  const roleId = getRuntimeSettings(guildId).verifiedRoleId;
  if (!roleId) {
    throw new Error(`Guild ${guildId} has no verified role configured yet — set one in /admin`);
  }
  return roleId;
}

export async function assignVerifiedRole(discordId: string, guildId: string): Promise<void> {
  const guild = await client.guilds.fetch(guildId);
  const member = await guild.members.fetch(discordId);
  await member.roles.add(requireVerifiedRoleId(guildId));
}

export async function hasVerifiedRole(discordId: string, guildId: string): Promise<boolean> {
  const guild = await client.guilds.fetch(guildId);
  const member = await guild.members.fetch(discordId);
  return member.roles.cache.has(requireVerifiedRoleId(guildId));
}

/** Discord API code for "member not found in this guild" (e.g. they left). */
const UNKNOWN_MEMBER_CODE = 10_007;

export async function removeVerifiedRole(discordId: string, guildId: string): Promise<void> {
  const guild = await client.guilds.fetch(guildId);
  let member;
  try {
    member = await guild.members.fetch(discordId);
  } catch (err) {
    if (isDiscordErrorCode(err, UNKNOWN_MEMBER_CODE)) return;
    throw err;
  }
  await member.roles.remove(requireVerifiedRoleId(guildId));
}

export async function isAdminMember(discordId: string, guildId: string): Promise<boolean> {
  const guild = await client.guilds.fetch(guildId);
  try {
    const member = await guild.members.fetch(discordId);
    return member.permissions.has(PermissionFlagsBits.Administrator);
  } catch (err) {
    if (isDiscordErrorCode(err, UNKNOWN_MEMBER_CODE)) return false;
    throw err;
  }
}

export async function kickMember(discordId: string, guildId: string, reason?: string): Promise<void> {
  const guild = await client.guilds.fetch(guildId);
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
