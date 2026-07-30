import { ChannelType } from "discord.js";
import { client } from "./client.js";
import { config } from "../config.js";

export interface GuildTextChannel {
  id: string;
  name: string;
}

export async function fetchGuildTextChannels(): Promise<GuildTextChannel[]> {
  const guild = await client.guilds.fetch(config.discord.guildId);
  const channels = await guild.channels.fetch();
  return channels
    .filter((c) => c?.type === ChannelType.GuildText)
    .map((c) => ({ id: c!.id, name: c!.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface GuildVoiceChannel {
  id: string;
  name: string;
}

export async function fetchGuildVoiceChannels(): Promise<GuildVoiceChannel[]> {
  const guild = await client.guilds.fetch(config.discord.guildId);
  const channels = await guild.channels.fetch();
  return channels
    .filter((c) => c?.type === ChannelType.GuildVoice)
    .map((c) => ({ id: c!.id, name: c!.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
