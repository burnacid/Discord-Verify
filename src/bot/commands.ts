import { PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";

export const commands = [
  new SlashCommandBuilder().setName("verify").setDescription("Get your verification link"),
  new SlashCommandBuilder()
    .setName("verify-user")
    .setDescription("Manually verify a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to verify").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("unverify-user")
    .setDescription("Remove a member's verification")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to unverify").setRequired(true),
    ),
].map((c) => c.toJSON());

export async function registerCommands(): Promise<void> {
  const rest = new REST().setToken(config.discord.token);
  await rest.put(
    Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
    { body: commands },
  );
}
