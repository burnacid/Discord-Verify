import { ChannelType } from "discord.js";
import { client } from "./client.js";
import { config } from "../config.js";

interface CategorizedChannel {
  id: string;
  name: string;
  // Name of the category this channel sits in, or null for a channel with
  // no category — matches what a member sees in Discord's own channel list.
  category: string | null;
}

async function fetchAllChannels() {
  const guild = await client.guilds.fetch(config.discord.guildId);
  return guild.channels.fetch();
}

// Ordered the same way Discord's own client shows the channel list: grouped
// by category (categories in their own position order, uncategorized
// channels first), and within each group by the channel's position —
// instead of a plain alphabetical sort, which scatters channels that are
// grouped together in Discord across an admin dropdown.
async function fetchGuildChannels(type: ChannelType.GuildText | ChannelType.GuildVoice): Promise<CategorizedChannel[]> {
  const channels = await fetchAllChannels();

  const categories = new Map<string, { name: string; position: number }>();
  for (const c of channels.values()) {
    if (c?.type === ChannelType.GuildCategory) {
      categories.set(c.id, { name: c.name, position: c.position });
    }
  }

  return channels
    .filter((c) => c?.type === type)
    .map((c) => ({
      id: c!.id,
      name: c!.name,
      position: c!.position,
      category: c!.parentId ? (categories.get(c!.parentId) ?? null) : null,
    }))
    .sort((a, b) => {
      const categoryPositionA = a.category?.position ?? -1;
      const categoryPositionB = b.category?.position ?? -1;
      return categoryPositionA !== categoryPositionB ? categoryPositionA - categoryPositionB : a.position - b.position;
    })
    .map(({ id, name, category }) => ({ id, name, category: category?.name ?? null }));
}

export type GuildTextChannel = CategorizedChannel;

export function fetchGuildTextChannels(): Promise<GuildTextChannel[]> {
  return fetchGuildChannels(ChannelType.GuildText);
}

export type GuildVoiceChannel = CategorizedChannel;

export function fetchGuildVoiceChannels(): Promise<GuildVoiceChannel[]> {
  return fetchGuildChannels(ChannelType.GuildVoice);
}

export interface GuildRole {
  id: string;
  name: string;
}

export async function fetchGuildRoles(): Promise<GuildRole[]> {
  const guild = await client.guilds.fetch(config.discord.guildId);
  const roles = await guild.roles.fetch();
  return roles
    .filter((r) => r.id !== guild.id) // exclude @everyone
    .map((r) => ({ id: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
