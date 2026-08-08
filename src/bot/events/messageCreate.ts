import { Message } from "discord.js";
import { client } from "../client.js";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { getVerifyStatusMessage } from "../verificationService.js";
import { maybePromptVerification } from "../verifyPrompt.js";

client.on("messageCreate", async (message: Message) => {
  if (message.author.bot) return;

  if (!message.channel.isDMBased()) {
    await maybePromptVerification(message).catch((err) => console.error("Verify-on-post check failed", err));
    return;
  }

  // DMs carry no guild context, so figure out which of the guilds this bot
  // manages the sender actually belongs to: every guild they have a Member
  // row in (from a prior join/verify), confirmed via the bot's own cached
  // guild membership rather than a per-guild API fetch.
  const candidates = await prisma.member.findMany({
    where: { discordId: message.author.id },
    select: { guildId: true },
  });

  const managedGuildIds: string[] = [];
  for (const { guildId } of candidates) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    try {
      await guild.members.fetch(message.author.id);
      managedGuildIds.push(guildId);
    } catch {
      // No longer a member of that guild.
    }
  }

  if (managedGuildIds.length === 0) {
    await message.reply(
      `You're not currently a member of a server I manage. Join here: ${config.web.publicBaseUrl}/join`,
    );
    return;
  }

  if (managedGuildIds.length > 1) {
    await message.reply(
      "You're in more than one server I manage — please use /verify inside the specific server instead of DMing me, so I know which one you mean.",
    );
    return;
  }

  const reply = await getVerifyStatusMessage(message.author.id, managedGuildIds[0]);
  await message.reply(reply);
});
