import {
  ActionRowBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Interaction,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { client } from "../client.js";
import { decideReviewEntry, unverifyMember, verifyMember } from "../adminActions.js";
import { getVerifyStatusMessage } from "../verificationService.js";
import { listPendingReviewEntries } from "../reviewQueue.js";
import type { ReviewDecisionResult } from "../adminActions.js";

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
  if (interaction.isChatInputCommand() && interaction.commandName === "review-queue") {
    await handleReviewQueueCommand(interaction);
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("review_deny_modal:")) {
    await handleDenyModalSubmit(interaction);
    return;
  }

  if (!interaction.isButton()) return;

  const [action, entryId] = interaction.customId.split(":");
  if (action === "review_approve") {
    await handleApprove(interaction, entryId);
    return;
  }
  if (action === "review_deny") {
    await handleDenyButtonClick(interaction, entryId);
  }
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

  const message = await getVerifyStatusMessage(interaction.user.id, interaction.guildId);
  await interaction.editReply(message);
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

const REVIEW_QUEUE_LIST_LIMIT = 15;

async function handleReviewQueueCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Use this command inside the server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const entries = await listPendingReviewEntries();
  if (entries.length === 0) {
    await interaction.editReply("Nothing pending.");
    return;
  }

  const lines = entries
    .slice(0, REVIEW_QUEUE_LIST_LIMIT)
    .map((entry) => `<@${entry.discordId}> — ${entry.reason} — <t:${Math.floor(entry.createdAt.getTime() / 1000)}:R>`);

  if (entries.length > REVIEW_QUEUE_LIST_LIMIT) {
    lines.push(`+${entries.length - REVIEW_QUEUE_LIST_LIMIT} more — see /admin`);
  }

  await interaction.editReply(lines.join("\n"));
}

async function handleApprove(interaction: ButtonInteraction, entryId: string): Promise<void> {
  // Discord invalidates the interaction token ~3s after the click, and role
  // assignment/DB writes/DMs can easily exceed that against a remote DB —
  // so acknowledge immediately and use followUp/editReply for everything after.
  await interaction.deferUpdate();
  const result = await decideReviewEntry(entryId, true, interaction.user.id);
  await respondToDecision(interaction, result);
}

async function handleDenyButtonClick(interaction: ButtonInteraction, entryId: string): Promise<void> {
  // showModal() must be the *first* response to the button click — unlike
  // approve, deny can't deferUpdate() up front since we still need to
  // collect the optional note text before deciding anything.
  const modal = new ModalBuilder()
    .setCustomId(`review_deny_modal:${entryId}`)
    .setTitle("Deny verification")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("note")
          .setLabel("Reason (optional, shown to no one but mods)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500),
      ),
    );
  await interaction.showModal(modal);
}

async function handleDenyModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const entryId = interaction.customId.split(":")[1];
  await interaction.deferUpdate();

  const note = interaction.fields.getTextInputValue("note").trim();
  const result = await decideReviewEntry(entryId, false, interaction.user.id, note || undefined);
  await respondToDecision(interaction, result);
}

async function respondToDecision(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  result: ReviewDecisionResult,
): Promise<void> {
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

  // Nothing left to do on success: deferUpdate() already silently
  // acknowledged the click/modal submit, and decideReviewEntry() already
  // updated the review message in place (buttons removed, resolution shown)
  // via a direct message.edit() call — not through the interaction webhook,
  // so there's no separate "reply" to edit or delete here. (Calling
  // interaction.deleteReply() at this point would delete '@original', which
  // for a deferUpdate()-acknowledged component/modal interaction IS that
  // same source message — it would undo the edit we just made.)
}
