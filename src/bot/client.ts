import { Client, GatewayIntentBits, Partials } from "discord.js";
import { config } from "../config.js";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

export async function startBot(): Promise<void> {
  await client.login(config.discord.token);
}
