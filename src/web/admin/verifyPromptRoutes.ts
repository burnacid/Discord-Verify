import { Router } from "express";
import { prisma } from "../../db.js";
import { fetchGuildTextChannels } from "../../bot/channelLookup.js";
import { getVerifyPromptSettings } from "../../bot/verifyPrompt.js";
import { asyncHandler } from "../asyncHandler.js";
import { requireAdmin } from "./session.js";
import { verifyPromptPage } from "../views/admin/verifyPrompt.js";
import { errorPage } from "../views/verifyPages.js";
import { flashQuery, parseFlashKind } from "./flashQuery.js";

export const verifyPromptRouter = Router();

verifyPromptRouter.use("/admin/verify-prompt", requireAdmin);

function adminUser(req: { session: { discordId?: string; username?: string } }) {
  return { discordId: req.session.discordId!, username: req.session.username ?? "Admin" };
}

verifyPromptRouter.get(
  "/admin/verify-prompt",
  asyncHandler(async (req, res) => {
    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;
    const flashKind = parseFlashKind(req.query.flashKind);
    const guildId = req.session.guildId!;
    const [settings, channels] = await Promise.all([getVerifyPromptSettings(guildId), fetchGuildTextChannels(guildId)]);
    res.send(verifyPromptPage(adminUser(req), settings, channels, flash, flashKind));
  }),
);

verifyPromptRouter.post(
  "/admin/verify-prompt",
  asyncHandler(async (req, res) => {
    const enabled = req.body?.enabled === "on";
    const channelId = typeof req.body?.channelId === "string" ? req.body.channelId.trim() : "";

    if (enabled && !channelId) {
      res.status(400).send(errorPage("Invalid settings", "A channel is required to enable this."));
      return;
    }

    const guildId = req.session.guildId!;
    await prisma.verifyPromptSettings.upsert({
      where: { guildId },
      create: { guildId, enabled, channelId: channelId || null },
      update: { enabled, channelId: channelId || null },
    });
    res.redirect(`/admin/verify-prompt?${flashQuery("Settings saved.")}`);
  }),
);
