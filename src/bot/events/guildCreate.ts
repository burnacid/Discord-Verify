import type { Guild } from "discord.js";
import { client } from "../client.js";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { ensureGuildSettings } from "../../runtimeSettings.js";
import { registerCommands } from "../commands.js";

client.on("guildCreate", async (guild: Guild) => {
  try {
    await provisionGuild(guild, true);
  } catch (err) {
    console.error(`Failed to provision newly-joined guild ${guild.id} (${guild.name})`, err);
  }
});

// Shared by the guildCreate event above and the startup reconciliation pass
// in src/index.ts (which covers guilds added while the bot was offline, and
// bootstraps whatever guild(s) already existed the first time this feature
// is deployed). Idempotent — safe to call repeatedly for the same guild.
export async function provisionGuild(guild: Guild, announceIfNew: boolean): Promise<void> {
  const existing = await prisma.guild.findUnique({ where: { id: guild.id } });

  await prisma.guild.upsert({
    where: { id: guild.id },
    update: { name: guild.name },
    create: { id: guild.id, name: guild.name },
  });
  await ensureGuildSettings(guild.id);
  await registerCommands(guild.id);

  if (announceIfNew && !existing) {
    await announceSetup(guild);
  }
}

async function announceSetup(guild: Guild): Promise<void> {
  const message =
    `👋 Thanks for adding me! Finish setup at ${config.web.publicBaseUrl}/admin — ` +
    "pick the Verified role and the review/audit channels there before members can be verified.";

  if (guild.systemChannel) {
    const sent = await guild.systemChannel.send(message).catch(() => null);
    if (sent) return;
  }

  const owner = await guild.fetchOwner().catch(() => null);
  await owner?.send(message).catch(() => {});
}
