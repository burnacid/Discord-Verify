import path from "node:path";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { Router, json, type Request, type Response } from "express";
import { prisma } from "../../db.js";
import { config } from "../../config.js";
import { getOrCreateJoinInvite } from "../../bot/inviteManager.js";
import { geoProvider } from "../../geo/provider.js";
import { isPrivateIp } from "../../geo/privateIp.js";
import { isGeoAllowed, geoReasonMessage } from "../../geo/policy.js";
import { verifyTurnstileToken } from "../../captcha/turnstile.js";
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

function logReferral(guildId: string, ref: string): void {
  if (!REF_RE.test(ref)) return;
  // Fire-and-forget: analytics logging must never hold up or fail the
  // actual invite response.
  prisma.inviteReferral
    .create({ data: { guildId, ref } })
    .catch((err) => console.error("Failed to log invite referral", err));
}

async function issueInvite(req: Request, res: Response): Promise<void> {
  const ref = typeof req.query.ref === "string" ? req.query.ref.trim() : "";
  try {
    const url = await getOrCreateJoinInvite(req.params.guildId);
    logReferral(req.params.guildId, ref);
    res.json({ url });
  } catch (err) {
    console.error("Failed to create join invite", err);
    res.status(502).json({ error: "Could not generate a join link right now. Please try again shortly." });
  }
}

// Same private-IP-can't-be-geolocated problem as /verify/:token (see
// detectingIpPage in verifyPages.ts) — here handled with a plain JSON
// round trip instead of a page reload, since this endpoint is only ever
// called from join.html's fetch(), not navigated to directly.
function resolveClientIp(req: Request): string | null {
  const ip = req.ip;
  if (!ip) return null;
  if (!config.geo.allowClientIpFallback || !isPrivateIp(ip)) return ip;

  const reported = typeof req.query.clientIp === "string" ? req.query.clientIp.trim() : "";
  if (reported && isIP(reported) && !isPrivateIp(reported)) return reported;
  return null;
}

// Gate on GeoIP/VPN *before* handing out a join invite: a VPN connection or
// a country outside the allowlist doesn't block joining outright (a captcha
// can't fix either signal), it just adds a captcha as a speed bump before
// the invite is issued. This only covers the /join page path — an invite
// obtained another way (forwarded link, vanity URL) skips it entirely, and
// the post-join /verify flow (src/web/routes/verify.ts) remains the real
// gate on role assignment.
joinRouter.get("/join/:guildId/invite", joinInviteLimiter, asyncHandler(async (req, res) => {
  const ip = resolveClientIp(req);
  if (!ip) {
    // Either no IP at all, or a private IP still waiting on the client to
    // report its public one — join.html retries with ?clientIp=... once it
    // has it via a public IP lookup.
    if (config.geo.allowClientIpFallback) {
      res.json({ needsClientIp: true });
      return;
    }
    res.status(400).json({ error: "Could not determine your IP address." });
    return;
  }

  let geo;
  try {
    geo = await geoProvider.check(ip);
  } catch (err) {
    console.error("GeoIP/VPN check failed", err);
    res.status(502).json({ error: "Could not generate a join link right now. Please try again shortly." });
    return;
  }

  if (!isGeoAllowed(geo, req.params.guildId)) {
    res.status(403).json({
      requireCaptcha: true,
      siteKey: config.captcha.siteKey,
      reason: geoReasonMessage(geo, "join"),
    });
    return;
  }

  await issueInvite(req, res);
}));

// Captcha step for visitors the GET above flagged with requireCaptcha —
// solving it doesn't change their GeoIP/VPN standing, it's only proof
// they're not an automated script, so it's enough to let the invite
// through as a manual "yes, I'm a real person" override.
joinRouter.post("/join/:guildId/invite", joinInviteLimiter, json(), asyncHandler(async (req, res) => {
  const ip = req.ip;
  if (!ip) {
    res.status(400).json({ error: "Could not determine your IP address." });
    return;
  }

  const captchaToken = typeof req.body?.captchaToken === "string" ? req.body.captchaToken : "";
  if (!captchaToken || !(await verifyTurnstileToken(captchaToken, ip))) {
    res.status(400).json({ error: "Verification challenge failed. Please try again." });
    return;
  }

  await issueInvite(req, res);
}));
