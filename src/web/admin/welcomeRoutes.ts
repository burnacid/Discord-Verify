import { Router } from "express";
import { prisma } from "../../db.js";
import { client } from "../../bot/client.js";
import { config } from "../../config.js";
import { fetchGuildTextChannels } from "../../bot/channelLookup.js";
import { getWelcomeSettings, renderWelcomeTemplate, DEFAULT_WELCOME_TEMPLATE } from "../../bot/welcomeMessage.js";
import { asyncHandler } from "../asyncHandler.js";
import { requireAdmin } from "./session.js";
import { welcomePage } from "../views/admin/welcome.js";
import { errorPage } from "../views/verifyPages.js";

export const welcomeRouter = Router();

welcomeRouter.use("/admin/welcome", requireAdmin);

function adminUser(req: { session: { discordId?: string; username?: string } }) {
  return { discordId: req.session.discordId!, username: req.session.username ?? "Admin" };
}

welcomeRouter.get(
  "/admin/welcome",
  asyncHandler(async (req, res) => {
    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;
    const [settings, channels] = await Promise.all([getWelcomeSettings(), fetchGuildTextChannels()]);
    res.send(welcomePage(adminUser(req), settings, channels, flash));
  }),
);

welcomeRouter.post(
  "/admin/welcome",
  asyncHandler(async (req, res) => {
    const enabled = req.body?.enabled === "on";
    const channelId = typeof req.body?.channelId === "string" ? req.body.channelId.trim() : "";
    const template = typeof req.body?.template === "string" ? req.body.template.trim() : "";

    if (enabled && !channelId) {
      res.status(400).send(errorPage("Invalid settings", "A channel is required to enable the welcome message."));
      return;
    }
    if (!template) {
      res.status(400).send(errorPage("Invalid settings", "The template can't be empty."));
      return;
    }

    await prisma.welcomeSettings.upsert({
      where: { id: 1 },
      create: { id: 1, enabled, channelId: channelId || null, template },
      update: { enabled, channelId: channelId || null, template },
    });
    res.redirect(`/admin/welcome?flash=${encodeURIComponent("Welcome message settings saved.")}`);
  }),
);

welcomeRouter.post(
  "/admin/welcome/test",
  asyncHandler(async (req, res) => {
    const settings = await getWelcomeSettings();
    if (!settings.channelId) {
      res.redirect(`/admin/welcome?flash=${encodeURIComponent("Set a channel before sending a test message.")}`);
      return;
    }

    const channel = await client.channels.fetch(settings.channelId).catch(() => null);
    if (!channel?.isTextBased() || channel.isThread() || channel.isDMBased()) {
      res.redirect(`/admin/welcome?flash=${encodeURIComponent("Couldn't find or post to the configured channel.")}`);
      return;
    }

    const guild = await client.guilds.fetch(config.discord.guildId);
    const member = await guild.members.fetch(req.session.discordId!);
    const content = await renderWelcomeTemplate(settings.template || DEFAULT_WELCOME_TEMPLATE, member);
    await channel.send({ content });

    res.redirect(`/admin/welcome?flash=${encodeURIComponent("Test message sent.")}`);
  }),
);
