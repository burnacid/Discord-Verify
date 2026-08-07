import type { Message } from "discord.js";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { ensureMember, issueVerificationToken, sendVerificationDm } from "./verificationService.js";

export interface VerifyPromptSettingsView {
  enabled: boolean;
  channelId: string | null;
}

export async function getVerifyPromptSettings(): Promise<VerifyPromptSettingsView> {
  const row = await prisma.verifyPromptSettings.findUnique({ where: { id: 1 } });
  return {
    enabled: row?.enabled ?? false,
    channelId: row?.channelId ?? null,
  };
}

// Debounces repeat prompts per member so rapid-fire posting in the trigger
// channel doesn't spam DMs — process-local (resets on restart) rather than
// a DB column, since losing the cooldown on a restart is harmless.
const PROMPT_COOLDOWN_MS = 10 * 60 * 1000;
const lastPromptedAt = new Map<string, number>();

// Sends a verification DM whenever a not-yet-verified member posts in the
// configured channel (reusing their existing active token — from a join DM,
// /verify, or an earlier prompt — instead of minting a new one each time),
// throttled to once per PROMPT_COOLDOWN_MS per member so posting again
// moments later doesn't re-send it.
export async function maybePromptVerification(message: Message): Promise<void> {
  if (message.author.bot || !message.guild) return;

  const settings = await getVerifyPromptSettings();
  if (!settings.enabled || !settings.channelId || message.channelId !== settings.channelId) return;

  const member = await ensureMember(message.author.id, message.guild.id);
  if (member.status === "verified" || member.status === "pending_review") return;

  const lastPrompt = lastPromptedAt.get(message.author.id);
  if (lastPrompt && Date.now() - lastPrompt < PROMPT_COOLDOWN_MS) return;
  lastPromptedAt.set(message.author.id, Date.now());

  const existingToken = await prisma.verificationToken.findFirst({
    where: { discordId: message.author.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  const token = existingToken?.token ?? (await issueVerificationToken(message.author.id));

  const dmSent = await sendVerificationDm(message.author.id, token);
  if (!dmSent) {
    await message
      .reply(
        `<@${message.author.id}> I couldn't DM you — please enable DMs from server members, or verify here: ${config.web.publicBaseUrl}/verify/${token}`,
      )
      .catch(() => {});
  }
}
