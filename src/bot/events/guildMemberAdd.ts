import { GuildMember } from "discord.js";
import { client } from "../client.js";
import { getRuntimeSettings } from "../../runtimeSettings.js";
import { sendWelcomeMessage } from "../welcomeMessage.js";
import {
  assignVerifiedRole,
  ensureMember,
  issueVerificationToken,
  postStartHereFallback,
  sendDirectMessage,
  sendVerificationDm,
} from "../verificationService.js";

client.on("guildMemberAdd", async (member: GuildMember) => {
  // Independent of the verification flow below — posts regardless of
  // verification status, same moment the join is first observed.
  sendWelcomeMessage(member).catch((err) => console.error("Failed to send welcome message", err));

  const existing = await ensureMember(member.id, member.guild.id);

  // Previously-verified member rejoining: restore their role directly
  // instead of re-running the GeoIP/VPN check, so a rejoin from a
  // different network doesn't needlessly send them back through manual
  // review. Falls through to the normal flow if role restoration fails.
  if (existing.status === "verified") {
    try {
      await assignVerifiedRole(member.id);
      if (getRuntimeSettings().sendJoinDm) {
        await sendDirectMessage(
          member.id,
          "Welcome back! You're already verified, so I've restored your Verified role.",
        );
      }
      return;
    } catch (err) {
      console.error("Failed to restore verified role on rejoin, falling back to re-verification", err);
    }
  }

  // SEND_JOIN_DM=false disables the automatic join DM (and its channel
  // fallback) entirely — members can still self-serve with /verify.
  if (!getRuntimeSettings().sendJoinDm) return;

  const token = await issueVerificationToken(member.id);

  const dmSent = await sendVerificationDm(member.id, token);
  if (!dmSent) {
    await postStartHereFallback(member.id, token);
  }
});
