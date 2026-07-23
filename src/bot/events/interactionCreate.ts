import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Interaction,
  MessageFlags,
} from "discord.js";
import { client } from "../client.js";
import { config } from "../../config.js";
import { decideReviewEntry, unverifyMember, verifyMember } from "../adminActions.js";
import { assignVerifiedRole, ensureMember, hasVerifiedRole, issueVerificationToken } from "../verificationService.js";

client.on("interactionCreate", async (interaction: Interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === "verify") {
    await handleVerifyCommand(interaction);
    return;
  }
  if (interaction.isChatInputCommand() && interaction.commandName === "verify-user") {
    await handleVerifyUserCommand(interaction);
    return;
  }
  if (interaction.isChatInputCommand() && interaction.commandName === "unverify-user") {
    await handleUnverifyUserCommand(interaction);
    return;
  }

  if (!interaction.isButton()) return;

  const [action, entryId] = interaction.customId.split(":");
  if (action !== "review_approve" && action !== "review_deny") return;

  await handleReviewDecision(interaction, entryId, action === "review_approve");
});

async function handleVerifyCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Use this command inside the server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = await ensureMember(interaction.user.id, interaction.guildId);
  if (member.status === "verified") {
    if (await hasVerifiedRole(interaction.user.id)) {
      await interaction.editReply("You're already verified.");
      return;
    }
    // DB says verified but the role is missing (e.g. a prior role assignment failed) — retry.
    try {
      await assignVerifiedRole(interaction.user.id);
      await interaction.editReply("You're verified! The Verified role has been re-applied.");
    } catch (err) {
      console.error("Failed to re-apply verified role", err);
      await interaction.editReply(
        "You're marked as verified, but I couldn't apply the role. Please contact a moderator.",
      );
    }
    return;
  }
  if (member.status === "pending_review") {
    await interaction.editReply("Your verification is already pending moderator review.");
    return;
  }

  const token = await issueVerificationToken(interaction.user.id);
  const link = `${config.web.publicBaseUrl}/verify/${token}`;
  await interaction.editReply(`Verify here (link expires in 24 hours): ${link}`);
}

async function handleVerifyUserCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Use this command inside the server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const target = interaction.options.getUser("user", true);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await verifyMember(target.id, interaction.guildId, interaction.user.id, "/verify-user");
  if (!result.ok) {
    await interaction.editReply(result.reason);
    return;
  }

  await interaction.editReply(`<@${target.id}> has been verified.`);
}

async function handleUnverifyUserCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Use this command inside the server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const target = interaction.options.getUser("user", true);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await unverifyMember(target.id, interaction.guildId, interaction.user.id, "/unverify-user");
  if (!result.ok) {
    await interaction.editReply(result.reason);
    return;
  }

  await interaction.editReply(`<@${target.id}> has been unverified.`);
}

async function handleReviewDecision(
  interaction: ButtonInteraction,
  entryId: string,
  approve: boolean,
): Promise<void> {
  // Discord invalidates the interaction token ~3s after the click, and role
  // assignment/DB writes/DMs can easily exceed that against a remote DB —
  // so acknowledge immediately and use followUp/editReply for everything after.
  await interaction.deferUpdate();

  const result = await decideReviewEntry(entryId, approve, interaction.user.id);

  if (!result.ok) {
    const message =
      result.reason === "not_found"
        ? "Review entry not found."
        : result.reason === "already_resolved"
          ? `Already resolved as ${result.entryStatus}.`
          : result.reason === "role_failed"
            ? `Approved by <@${interaction.user.id}>, but the role could not be assigned. Check the bot's permissions/role position and try again.`
            : `Denied by <@${interaction.user.id}>, but I couldn't remove the member from the server. Check the bot's permissions/role position and try again.`;

    await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deleteReply();
}
