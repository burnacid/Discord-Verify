import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { prisma } from "../../db.js";
import { getOrCreateJoinInvite } from "../../bot/inviteManager.js";
import { joinInviteLimiter } from "../rateLimit.js";
import { asyncHandler } from "../asyncHandler.js";
import { notFoundPage } from "../views/verifyPages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const joinPagePath = path.join(__dirname, "..", "public", "join.html");

export const joinRouter = Router();

joinRouter.get("/", (_req, res) => {
  res.redirect(302, "/join");
});

// /join with no guild id only makes sense when this bot serves exactly one
// guild — the common case for a single-server deployment. With more than
// one, there's no way to guess which server a bare /join link means, so it
// 404s and the real per-guild link (/join/:guildId) must be used instead.
joinRouter.get(
  "/join",
  asyncHandler(async (_req, res) => {
    const guilds = await prisma.guild.findMany({ take: 2 });
    if (guilds.length === 1) {
      res.redirect(302, `/join/${guilds[0].id}`);
      return;
    }
    res.status(404).send(notFoundPage());
  }),
);

joinRouter.get("/join/:guildId", (_req, res) => {
  res.sendFile(joinPagePath);
});

joinRouter.get("/join/:guildId/invite", joinInviteLimiter, async (req, res) => {
  try {
    const url = await getOrCreateJoinInvite(req.params.guildId);
    res.json({ url });
  } catch (err) {
    console.error("Failed to create join invite", err);
    res.status(502).json({ error: "Could not generate a join link right now. Please try again shortly." });
  }
});
