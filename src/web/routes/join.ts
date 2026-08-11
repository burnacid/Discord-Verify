import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { prisma } from "../../db.js";
import { config } from "../../config.js";
import { getOrCreateJoinInvite } from "../../bot/inviteManager.js";
import { joinInviteLimiter } from "../rateLimit.js";
import { asyncHandler } from "../asyncHandler.js";
import { notFoundPage } from "../views/verifyPages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const joinPagePath = path.join(__dirname, "..", "public", "join.html");

// Keeps ref values to a sane, log-friendly shape (e.g. "twitter",
// "flyer-2024", "partner_x") — rejects anything free-form enough to bloat
// the InviteReferral table or contain junk from a malformed/malicious link.
const REF_RE = /^[a-zA-Z0-9_.-]{1,64}$/;

export const joinRouter = Router();

joinRouter.get("/", (_req, res) => {
  res.redirect(302, "/join");
});

// /join with no guild id resolves automatically when this bot serves
// exactly one guild (the common case for a single-server deployment), or
// when DEFAULT_GUILD_ID names one explicitly (for multi-guild deployments
// that still want a short, guild-less link to share). Otherwise there's no
// way to guess which server a bare /join link means, so it 404s and the
// real per-guild link (/join/:guildId) must be used instead.
joinRouter.get(
  "/join",
  asyncHandler(async (req, res) => {
    const qs = req.url.split("?")[1];
    const suffix = qs ? `?${qs}` : "";

    const guilds = await prisma.guild.findMany({ take: 2 });
    if (guilds.length === 1) {
      res.redirect(302, `/join/${guilds[0].id}${suffix}`);
      return;
    }

    if (config.web.defaultGuildId) {
      const defaultGuild = await prisma.guild.findUnique({ where: { id: config.web.defaultGuildId } });
      if (defaultGuild) {
        res.redirect(302, `/join/${defaultGuild.id}${suffix}`);
        return;
      }
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

    const ref = typeof req.query.ref === "string" ? req.query.ref.trim() : "";
    if (REF_RE.test(ref)) {
      // Fire-and-forget: analytics logging must never hold up or fail the
      // actual invite response.
      prisma.inviteReferral
        .create({ data: { guildId: req.params.guildId, ref } })
        .catch((err) => console.error("Failed to log invite referral", err));
    }

    res.json({ url });
  } catch (err) {
    console.error("Failed to create join invite", err);
    res.status(502).json({ error: "Could not generate a join link right now. Please try again shortly." });
  }
});
