import { ChannelType } from "discord.js";
import { client } from "./client.js";

export type ChannelKind = "text" | "announcement" | "voice";

function channelKind(type: ChannelType): ChannelKind {
  if (type === ChannelType.GuildAnnouncement) return "announcement";
  if (type === ChannelType.GuildVoice) return "voice";
  return "text";
}

interface CategorizedChannel {
  id: string;
  name: string;
  // Drives the icon shown next to the channel in admin pickers.
  kind: ChannelKind;
  // Name of the category this channel sits in, or null for a channel with
  // no category — matches what a member sees in Discord's own channel list.
  category: string | null;
}

async function fetchAllChannels(guildId: string) {
  const guild = await client.guilds.fetch(guildId);
  return guild.channels.fetch();
}

// Ordered the same way Discord's own client shows the channel list: grouped
// by category (categories in their own position order, uncategorized
// channels first), and within each group by the channel's position —
// instead of a plain alphabetical sort, which scatters channels that are
// grouped together in Discord across an admin dropdown.
async function fetchGuildChannels(
  guildId: string,
  types: ChannelType[],
): Promise<CategorizedChannel[]> {
  const channels = await fetchAllChannels(guildId);

  const categories = new Map<string, { name: string; position: number }>();
  for (const c of channels.values()) {
    if (c?.type === ChannelType.GuildCategory) {
      categories.set(c.id, { name: c.name, position: c.position });
    }
  }

  return channels
    .filter((c) => c !== null && types.includes(c.type))
    .map((c) => ({
      id: c!.id,
      name: c!.name,
      kind: channelKind(c!.type),
      position: c!.position,
      category: c!.parentId ? (categories.get(c!.parentId) ?? null) : null,
    }))
    .sort((a, b) => {
      const categoryPositionA = a.category?.position ?? -1;
      const categoryPositionB = b.category?.position ?? -1;
      return categoryPositionA !== categoryPositionB ? categoryPositionA - categoryPositionB : a.position - b.position;
    })
    .map(({ id, name, kind, category }) => ({ id, name, kind, category: category?.name ?? null }));
}

export type GuildTextChannel = CategorizedChannel;

export function fetchGuildTextChannels(guildId: string): Promise<GuildTextChannel[]> {
  return fetchGuildChannels(guildId, [ChannelType.GuildText]);
}

// Text channels plus announcement channels — for features that only post
// messages (e.g. RSS), where an announcement channel is a natural target.
export function fetchGuildPostableChannels(guildId: string): Promise<GuildTextChannel[]> {
  return fetchGuildChannels(guildId, [ChannelType.GuildText, ChannelType.GuildAnnouncement]);
}

export type GuildVoiceChannel = CategorizedChannel;

export function fetchGuildVoiceChannels(guildId: string): Promise<GuildVoiceChannel[]> {
  return fetchGuildChannels(guildId, [ChannelType.GuildVoice]);
}

export interface GuildRole {
  id: string;
  name: string;
}

export async function fetchGuildRoles(guildId: string): Promise<GuildRole[]> {
  const guild = await client.guilds.fetch(guildId);
  const roles = await guild.roles.fetch();
  return roles
    .filter((r) => r.id !== guild.id) // exclude @everyone
    .map((r) => ({ id: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
