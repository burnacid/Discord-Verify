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

// Discord's built-in onboarding links — not real channels, but Discord's
// own composer offers them alongside real channels when typing "#", so
// they're resolved the same way. `<id:...>` is a fixed literal Discord's
// client recognizes; the "id" is not a placeholder for a real snowflake.
// https://support.discord.com/hc/en-us/community/posts/16815195387799
const SPECIAL_CHANNEL_MENTIONS: Record<string, string> = {
  "#channels & roles": "<id:customize>",
};

function resolveSpecialMentions(text: string): string {
  let result = text;
  for (const [phrase, mention] of Object.entries(SPECIAL_CHANNEL_MENTIONS)) {
    result = result.replace(new RegExp(escapeRegExp(phrase), "gi"), mention);
  }
  return result;
}

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Matches "@Role Name" written in plain text, the same way #channel-name is
// resolved above. Unlike channel names, role names can contain spaces, so
// this can't use a simple word-charset regex — instead it looks for the
// longest matching role name after each "@", trying roles longest-name-first
// so e.g. "@Event Team Lead" isn't cut short by a shorter "@Event Team" role.
// The guild's own @everyone role is excluded (there's no legitimate way to
// "mention" it that isn't already just typing the literal text @everyone).
async function resolveRoleMentions(text: string, member: GuildMember): Promise<string> {
  if (!text.includes("@")) return text;

  const roles = await member.guild.roles.fetch();
  const sorted = [...roles.values()]
    .filter((r) => r.id !== member.guild.id)
    .sort((a, b) => b.name.length - a.name.length);

  let result = text;
  for (const role of sorted) {
    result = result.replace(new RegExp(`@${escapeRegExp(role.name)}`, "gi"), `<@&${role.id}>`);
  }
  return result;
}

export async function renderWelcomeTemplate(template: string, member: GuildMember): Promise<string> {
  const values: Record<string, string> = {
    mention: `<@${member.id}>`,
    username: member.user.username,
    servername: member.guild.name,
    memberCount: String(member.guild.memberCount),
  };
  const substituted = template.replace(PLACEHOLDER_RE, (_, key: string) => values[key] ?? "");
  const withSpecial = resolveSpecialMentions(substituted);
  const withChannels = await resolveChannelMentions(withSpecial, member);
  const rendered = await resolveRoleMentions(withChannels, member);
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
