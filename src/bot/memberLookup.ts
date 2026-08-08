import { GuildMember } from "discord.js";
import { client } from "./client.js";

export async function fetchGuildMember(discordId: string, guildId: string): Promise<GuildMember | null> {
  const guild = await client.guilds.fetch(guildId);
  try {
    return await guild.members.fetch(discordId);
  } catch {
    return null;
  }
}

export async function searchGuildMembers(query: string, guildId: string, limit = 10): Promise<GuildMember[]> {
  const guild = await client.guilds.fetch(guildId);
  const results = await guild.members.search({ query, limit });
  return [...results.values()];
}
