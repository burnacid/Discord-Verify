import { GuildMember } from "discord.js";
import { client } from "../client.js";
import {
  assignVerifiedRole,
  ensureMember,
  issueVerificationToken,
  postStartHereFallback,
  sendDirectMessage,
  sendVerificationDm,
} from "../verificationService.js";

client.on("guildMemberAdd", async (member: GuildMember) => {
  const existing = await ensureMember(member.id, member.guild.id);

  // Previously-verified member rejoining: restore their role directly
  // instead of re-running the GeoIP/VPN check, so a rejoin from a
  // different network doesn't needlessly send them back through manual
  // review. Falls through to the normal flow if role restoration fails.
  if (existing.status === "verified") {
    try {
      await assignVerifiedRole(member.id);
      await sendDirectMessage(
        member.id,
        "Welcome back! You're already verified, so I've restored your Verified role.",
      );
      return;
    } catch (err) {
      console.error("Failed to restore verified role on rejoin, falling back to re-verification", err);
    }
  }

  const token = await issueVerificationToken(member.id);

  const dmSent = await sendVerificationDm(member.id, token);
  if (!dmSent) {
    await postStartHereFallback(member.id, token);
  }
});
