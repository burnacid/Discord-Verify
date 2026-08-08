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
  new SlashCommandBuilder()
    .setName("review-queue")
    .setDescription("List members pending manual verification review")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
].map((c) => c.toJSON());

// Registered per guild (not globally) — called from the guildCreate handler
// when the bot joins a new server, and again from the startup reconciliation
// pass for every guild already known, so commands stay in sync without the
// ~1h propagation delay global command registration would add.
export async function registerCommands(guildId: string): Promise<void> {
  const rest = new REST().setToken(config.discord.token);
  await rest.put(
    Routes.applicationGuildCommands(config.discord.clientId, guildId),
    { body: commands },
  );
}
