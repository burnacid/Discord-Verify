import { Router } from "express";
import { prisma } from "../../db.js";
import { fetchGuildVoiceChannels } from "../../bot/channelLookup.js";
import { asyncHandler } from "../asyncHandler.js";
import { requireAdmin } from "./session.js";
import { jtcPage } from "../views/admin/jtc.js";
import { errorPage } from "../views/verifyPages.js";
import { flashQuery, parseFlashKind } from "./flashQuery.js";

export const jtcRouter = Router();

jtcRouter.use("/admin/jtc", requireAdmin);

function adminUser(req: { session: { discordId?: string; username?: string } }) {
  return { discordId: req.session.discordId!, username: req.session.username ?? "Admin" };
}

jtcRouter.get(
  "/admin/jtc",
  asyncHandler(async (req, res) => {
    const guildId = req.session.guildId!;
    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;
    const flashKind = parseFlashKind(req.query.flashKind);
    const [triggers, channels] = await Promise.all([
      prisma.jtcTrigger.findMany({ where: { guildId }, orderBy: { createdAt: "asc" } }),
      fetchGuildVoiceChannels(guildId),
    ]);
    const activeCounts = await Promise.all(
      triggers.map((t) => prisma.jtcChannel.count({ where: { triggerId: t.id } })),
    );
    const triggerChannelIds = new Set(triggers.map((t) => t.channelId));
    const availableChannels = channels.filter((c) => !triggerChannelIds.has(c.id));
    res.send(jtcPage(adminUser(req), triggers, activeCounts, channels, availableChannels, flash, flashKind));
  }),
);

jtcRouter.post(
  "/admin/jtc",
  asyncHandler(async (req, res) => {
    const guildId = req.session.guildId!;
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const channelId = typeof req.body?.channelId === "string" ? req.body.channelId.trim() : "";

    if (!name || !channelId) {
      res.status(400).send(errorPage("Invalid trigger", "Name and a voice channel are required."));
      return;
    }

    const existing = await prisma.jtcTrigger.findUnique({ where: { channelId } });
    if (existing) {
      res.redirect(`/admin/jtc?${flashQuery("That channel is already a trigger.", "warning")}`);
      return;
    }

    await prisma.jtcTrigger.create({ data: { guildId, name, channelId } });
    res.redirect(`/admin/jtc?${flashQuery("Trigger added.")}`);
  }),
);

jtcRouter.post(
  "/admin/jtc/:id/delete",
  asyncHandler(async (req, res) => {
    // Only removes the trigger row — channels it already spawned are left
    // running and get cleaned up normally once they empty out. Guild-scoped
    // delete so an admin can't delete another guild's trigger by id.
    await prisma.jtcTrigger.deleteMany({ where: { id: req.params.id, guildId: req.session.guildId! } });
    res.redirect(`/admin/jtc?${flashQuery("Trigger deleted.")}`);
  }),
);
