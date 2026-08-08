import { prisma } from "../../db.js";
import { isAdminMember } from "../../bot/verificationService.js";

export interface AdminGuild {
  id: string;
  name: string;
}

// Every guild this bot serves (has a Guild row for) where the given Discord
// user has Administrator permission — backs both the post-login "choose a
// server" picker and the sidebar switcher. Re-checked live each time rather
// than cached, since it's low-frequency and permissions can change.
export async function listAdminGuilds(discordId: string): Promise<AdminGuild[]> {
  const guilds = await prisma.guild.findMany();
  const checks = await Promise.all(
    guilds.map(async (guild): Promise<AdminGuild | null> =>
      (await isAdminMember(discordId, guild.id)) ? { id: guild.id, name: guild.name } : null,
    ),
  );
  return checks.filter((g): g is AdminGuild => g !== null);
}
