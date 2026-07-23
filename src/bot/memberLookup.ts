import { GuildMember } from "discord.js";
import { client } from "./client.js";
import { config } from "../config.js";

export async function fetchGuildMember(discordId: string): Promise<GuildMember | null> {
  const guild = await client.guilds.fetch(config.discord.guildId);
  try {
    return await guild.members.fetch(discordId);
  } catch {
    return null;
  }
}

export async function searchGuildMembers(query: string, limit = 10): Promise<GuildMember[]> {
  const guild = await client.guilds.fetch(config.discord.guildId);
  const results = await guild.members.search({ query, limit });
  return [...results.values()];
}
