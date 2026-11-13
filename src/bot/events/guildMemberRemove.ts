import type { GuildMember, PartialGuildMember } from "discord.js";
import { client } from "../client.js";
import { purgeMemberData } from "../memberPurge.js";

// Fires on leave, kick and ban (with the GuildMembers intent, also for
// members that were never cached — hence PartialGuildMember). Leaves that
// happen while the bot is offline are caught later by the periodic sweep in
// src/jobs/roleSync.ts.
client.on("guildMemberRemove", async (member: GuildMember | PartialGuildMember) => {
  try {
    await purgeMemberData(member.guild.id, [member.id]);
  } catch (err) {
    console.error(`Failed to purge data for departed member ${member.id} in guild ${member.guild.id}`, err);
  }
});
