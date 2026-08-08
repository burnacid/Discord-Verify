import type { Message } from "discord.js";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { ensureMember, issueVerificationToken, sendVerificationDm } from "./verificationService.js";

export interface VerifyPromptSettingsView {
  enabled: boolean;
  channelId: string | null;
}

export async function getVerifyPromptSettings(guildId: string): Promise<VerifyPromptSettingsView> {
  const row = await prisma.verifyPromptSettings.findUnique({ where: { guildId } });
  return {
    enabled: row?.enabled ?? false,
    channelId: row?.channelId ?? null,
  };
}

// Debounces repeat prompts per (guild, member) so rapid-fire posting in the
// trigger channel doesn't spam DMs — process-local (resets on restart)
// rather than a DB column, since losing the cooldown on a restart is
// harmless. Keyed by guild+member, not member alone, so being active in one
// managed guild doesn't suppress a prompt in another.
const PROMPT_COOLDOWN_MS = 10 * 60 * 1000;
const lastPromptedAt = new Map<string, number>();

// Sends a verification DM whenever a not-yet-verified member posts in the
// configured channel (reusing their existing active token — from a join DM,
// /verify, or an earlier prompt — instead of minting a new one each time),
// throttled to once per PROMPT_COOLDOWN_MS per member so posting again
// moments later doesn't re-send it.
export async function maybePromptVerification(message: Message): Promise<void> {
  if (message.author.bot || !message.guild) return;
  const guildId = message.guild.id;

  const settings = await getVerifyPromptSettings(guildId);
  if (!settings.enabled || !settings.channelId || message.channelId !== settings.channelId) return;

  const member = await ensureMember(message.author.id, guildId);
  if (member.status === "verified" || member.status === "pending_review") return;

  const cooldownKey = `${guildId}:${message.author.id}`;
  const lastPrompt = lastPromptedAt.get(cooldownKey);
  if (lastPrompt && Date.now() - lastPrompt < PROMPT_COOLDOWN_MS) return;
  lastPromptedAt.set(cooldownKey, Date.now());

  const existingToken = await prisma.verificationToken.findFirst({
    where: { discordId: message.author.id, guildId, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  const token = existingToken?.token ?? (await issueVerificationToken(message.author.id, guildId));

  const dmSent = await sendVerificationDm(message.author.id, token);
  if (!dmSent) {
    await message
      .reply(
        `<@${message.author.id}> I couldn't DM you — please enable DMs from server members, or verify here: ${config.web.publicBaseUrl}/verify/${token}`,
      )
      .catch(() => {});
  }
}
