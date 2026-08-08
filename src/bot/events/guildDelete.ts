import type { Guild } from "discord.js";
import { client } from "../client.js";
import { prisma } from "../../db.js";

// Fires when the bot is kicked/leaves a guild. Removes the Guild row so it
// stops showing up in the admin login picker/sidebar and — more importantly
// — stops being fetched there (src/web/admin/guildAccess.ts's
// listAdminGuilds() iterates every Guild row via client.guilds.fetch(),
// which throws DiscordAPIError 10004 "Unknown Guild" once the bot is no
// longer a member).
//
// Everything else guild-scoped (Settings, Member rows, RssFeed, etc.) is
// left alone on purpose — if the bot gets re-added later, provisionGuild()
// just picks the existing config back up instead of re-seeding defaults.
client.on("guildDelete", async (guild: Guild) => {
  try {
    await prisma.guild.delete({ where: { id: guild.id } }).catch((err) => {
      // P2025 = record already gone (e.g. duplicate event, or never provisioned) — fine to ignore.
      if (err?.code !== "P2025") throw err;
    });
  } catch (err) {
    console.error(`Failed to clean up removed guild ${guild.id} (${guild.name})`, err);
  }
});
