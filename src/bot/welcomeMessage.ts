import type { GuildMember } from "discord.js";
import { client } from "./client.js";
import { prisma } from "../db.js";

export const DEFAULT_WELCOME_TEMPLATE =
  "👋 Welcome {{mention}} to {{servername}}! We're now {{memberCount}} members strong.";

export interface WelcomeSettingsView {
  enabled: boolean;
  channelId: string | null;
  template: string;
}

export async function getWelcomeSettings(): Promise<WelcomeSettingsView> {
  const row = await prisma.welcomeSettings.findUnique({ where: { id: 1 } });
  return {
    enabled: row?.enabled ?? false,
    channelId: row?.channelId ?? null,
    template: row?.template ?? DEFAULT_WELCOME_TEMPLATE,
  };
}

const PLACEHOLDER_RE = /\{\{\s*(\w+)\s*\}\}/g;
// Matches "#channel-name" written in plain text (Discord only auto-links
// the literal <#channelId> form, not "#name", so we resolve it ourselves).
const CHANNEL_MENTION_RE = /#([a-z0-9_-]+)/gi;

async function resolveChannelMentions(text: string, member: GuildMember): Promise<string> {
  if (!CHANNEL_MENTION_RE.test(text)) return text;
  CHANNEL_MENTION_RE.lastIndex = 0;

  const channels = await member.guild.channels.fetch();
  return text.replace(CHANNEL_MENTION_RE, (match, name: string) => {
    const channel = channels.find((c) => c?.name.toLowerCase() === name.toLowerCase());
    return channel ? `<#${channel.id}>` : match;
  });
}

export async function renderWelcomeTemplate(template: string, member: GuildMember): Promise<string> {
  const values: Record<string, string> = {
    mention: `<@${member.id}>`,
    username: member.user.username,
    servername: member.guild.name,
    memberCount: String(member.guild.memberCount),
  };
  const substituted = template.replace(PLACEHOLDER_RE, (_, key: string) => values[key] ?? "");
  const rendered = await resolveChannelMentions(substituted, member);
  // Discord hard-caps message content at 2000 chars.
  return rendered.length > 2000 ? rendered.slice(0, 1997) + "…" : rendered;
}

export async function sendWelcomeMessage(member: GuildMember): Promise<void> {
  const settings = await getWelcomeSettings();
  if (!settings.enabled || !settings.channelId) return;

  const channel = await client.channels.fetch(settings.channelId);
  if (!channel?.isTextBased() || channel.isThread() || channel.isDMBased()) return;

  await channel.send({ content: await renderWelcomeTemplate(settings.template, member) });
}
