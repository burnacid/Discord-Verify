import type { Guild } from "discord.js";
import { client } from "../client.js";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { ensureGuildSettings } from "../../runtimeSettings.js";
import { registerCommands } from "../commands.js";

client.on("guildCreate", async (guild: Guild) => {
  try {
    await handleGuildJoin(guild, true);
  } catch (err) {
    console.error(`Failed to provision newly-joined guild ${guild.id} (${guild.name})`, err);
  }
});

// Shared by the guildCreate event above and the startup reconciliation pass
// in src/index.ts. The reconciliation pass matters here too, not just for
// catch-up: Discord grants a bot-add server-side as soon as it's authorized,
// independent of whether the bot's gateway connection is currently up — a
// server added right around a restart can end up in the initial READY guild
// list instead of firing guildCreate, which would silently bypass the
// DISALLOW_NEW_GUILDS check if only the event handler enforced it.
export async function handleGuildJoin(guild: Guild, announceIfNew: boolean): Promise<void> {
  if (!config.discord.allowNewGuilds) {
    const existing = await prisma.guild.findUnique({ where: { id: guild.id } });
    if (!existing) {
      console.log(`New guild joins are disabled (DISALLOW_NEW_GUILDS=true) — leaving ${guild.id} (${guild.name})`);
      await guild.leave().catch((err) => console.error(`Failed to leave rejected guild ${guild.id}`, err));
      return;
    }
  }
  await provisionGuild(guild, announceIfNew);
}

// Idempotent — safe to call repeatedly for the same guild.
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
