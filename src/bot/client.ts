import { Client, GatewayIntentBits, Partials } from "discord.js";
import { config } from "../config.js";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

// Resolves once the gateway is fully ready (clientReady), not just once
// login() returns — login() resolves as soon as the token is accepted, before
// the guild cache is populated or gateway requests like a full
// guild.members.fetch() can succeed. Background jobs started right after
// this rely on that.
export async function startBot(): Promise<void> {
  const ready = new Promise<void>((resolve) => client.once("clientReady", () => resolve()));
  await client.login(config.discord.token);
  await ready;
}
