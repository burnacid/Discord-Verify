import { Message } from "discord.js";
import { client } from "../client.js";
import { config } from "../../config.js";
import { getVerifyStatusMessage } from "../verificationService.js";

client.on("messageCreate", async (message: Message) => {
  if (message.author.bot || !message.channel.isDMBased()) return;

  const guild = await client.guilds.fetch(config.discord.guildId);
  try {
    await guild.members.fetch(message.author.id);
  } catch {
    await message.reply(
      `You're not currently a member of the server. Join here: ${config.web.publicBaseUrl}/join`,
    );
    return;
  }

  const reply = await getVerifyStatusMessage(message.author.id, config.discord.guildId);
  await message.reply(reply);
});
