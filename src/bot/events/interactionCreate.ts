import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Interaction,
  MessageFlags,
} from "discord.js";
import { client } from "../client.js";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { postAuditLog } from "../auditLog.js";
import {
  assignVerifiedRole,
  ensureMember,
  hasVerifiedRole,
  isAdminMember,
  issueVerificationToken,
  kickMember,
  removeVerifiedRole,
  sendDirectMessage,
} from "../verificationService.js";

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

  await ensureMember(target.id, interaction.guildId);

  try {
    await assignVerifiedRole(target.id);
  } catch (err) {
    console.error("Failed to assign verified role via /verify-user", err);
    await interaction.editReply(
      `Couldn't assign the Verified role to <@${target.id}>. Check the bot's permissions/role position and try again.`,
    );
    return;
  }

  await prisma.member.update({
    where: { discordId: target.id },
    data: { status: "verified", verifiedAt: new Date() },
  });

  await sendDirectMessage(
    target.id,
    "You've been manually verified! You can now post in the server.",
  );
  await postAuditLog(`<@${target.id}> was manually **verified** by <@${interaction.user.id}> via /verify-user.`);

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

  await ensureMember(target.id, interaction.guildId);

  try {
    await removeVerifiedRole(target.id);
  } catch (err) {
    console.error("Failed to remove verified role via /unverify-user", err);
    await interaction.editReply(
      `Couldn't remove the Verified role from <@${target.id}>. Check the bot's permissions/role position and try again.`,
    );
    return;
  }

  await prisma.member.update({
    where: { discordId: target.id },
    data: { status: "unverified", verifiedAt: null },
  });

  await postAuditLog(`<@${target.id}> was manually **unverified** by <@${interaction.user.id}> via /unverify-user.`);

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

  const entry = await prisma.reviewQueueEntry.findUnique({ where: { id: entryId } });
  if (!entry) {
    await interaction.followUp({ content: "Review entry not found.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (entry.status !== "pending") {
    await interaction.followUp({
      content: `Already resolved as ${entry.status}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let deniedAdmin = false;

  if (approve) {
    try {
      await assignVerifiedRole(entry.discordId);
    } catch (err) {
      console.error("Failed to assign verified role from review queue", err);
      await interaction.followUp({
        content: `Approved by <@${interaction.user.id}>, but the role could not be assigned. Check the bot's permissions/role position and try again.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  } else {
    deniedAdmin = await isAdminMember(entry.discordId);
    if (!deniedAdmin) {
      await sendDirectMessage(
        entry.discordId,
        "Your verification request was denied, and you have been removed from the server.",
      );
      try {
        await kickMember(entry.discordId, "Denied manual verification");
      } catch (err) {
        console.error("Failed to kick member after denial", err);
        await interaction.followUp({
          content: `Denied by <@${interaction.user.id}>, but I couldn't remove <@${entry.discordId}> from the server. Check the bot's permissions/role position and try again.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    } else {
      await sendDirectMessage(entry.discordId, "Your verification request was denied.");
    }
  }

  await prisma.reviewQueueEntry.update({
    where: { id: entryId },
    data: {
      status: approve ? "approved" : "denied",
      reviewedBy: interaction.user.id,
      reviewedAt: new Date(),
    },
  });

  await prisma.member.update({
    where: { discordId: entry.discordId },
    data: {
      status: approve ? "verified" : "rejected",
      verifiedAt: approve ? new Date() : null,
    },
  });

  if (approve) {
    await sendDirectMessage(
      entry.discordId,
      "Your verification request was approved! You can now post in the server.",
    );
    await postAuditLog(
      `<@${entry.discordId}> was **approved** by <@${interaction.user.id}> (reason: ${entry.reason}).`,
    );
  } else {
    await postAuditLog(
      `<@${entry.discordId}> was **denied** by <@${interaction.user.id}> (reason: ${entry.reason})` +
        `${deniedAdmin ? " — not kicked (admin)" : " and removed from the server"}.`,
    );
  }

  await interaction.deleteReply();
}
