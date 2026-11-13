import { Router, json } from "express";
import { isIP } from "node:net";
import { prisma } from "../../db.js";
import { config } from "../../config.js";
import { geoProvider } from "../../geo/provider.js";
import { isPrivateIp } from "../../geo/privateIp.js";
import { isGeoAllowed, geoReasonMessage } from "../../geo/policy.js";
import { verifyTurnstileToken } from "../../captcha/turnstile.js";
import { assignVerifiedRole } from "../../bot/verificationService.js";
import { createReviewEntry } from "../../bot/reviewQueue.js";
import { postAuditLog } from "../../bot/auditLog.js";
import { asyncHandler } from "../asyncHandler.js";
import { verifyLimiter, visitBeaconLimiter } from "../rateLimit.js";
import {
  detectingIpPage,
  errorPage,
  linkPreviewPage,
  reviewFormPage,
  reviewSubmittedPage,
  successPage,
  withVisitBeacon,
} from "../views/verifyPages.js";
import type { ReviewFormErrors } from "../views/verifyPages.js";

export const verifyRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Discord (and other chat apps) pre-fetch links to build a message embed the
// instant the DM is sent — before the human ever opens it. If we ran the
// GeoIP/VPN check for that request, its result would get cached on the
// token (see ensureGeoCheck) and the real visitor's later request would
// read back the crawler's IP-based result instead of their own. Detect
// known link-preview bots and skip all DB/geo work for them entirely.
const LINK_PREVIEW_BOT_RE =
  /discordbot|slackbot|telegrambot|whatsapp|facebookexternalhit|twitterbot|linkedinbot|embedly|google-inspectiontool/i;

function isLinkPreviewBot(userAgent: string | undefined): boolean {
  return !!userAgent && LINK_PREVIEW_BOT_RE.test(userAgent);
}

interface GeoResult {
  countryCode: string | null;
  fraudScore: number;
  isVpn: boolean;
  raw: unknown;
  ip: string;
}

async function ensureGeoCheck(
  token: string,
  record: { geoCheckedAt: Date | null; geoCountry: string | null; geoFraudScore: number | null; geoIsVpn: boolean | null; geoRaw: unknown; geoIp: string | null },
  ip: string,
): Promise<GeoResult> {
  if (record.geoCheckedAt) {
    return {
      countryCode: record.geoCountry,
      fraudScore: record.geoFraudScore ?? 0,
      isVpn: record.geoIsVpn ?? false,
      raw: record.geoRaw,
      ip: record.geoIp ?? ip,
    };
  }

  const result = await geoProvider.check(ip);
  await prisma.verificationToken.update({
    where: { token },
    data: {
      geoIp: ip,
      geoCountry: result.countryCode,
      geoFraudScore: result.fraudScore,
      geoIsVpn: result.isVpn,
      geoRaw: result.raw as object,
      geoCheckedAt: new Date(),
    },
  });
  return { ...result, ip };
}

// Logs one VerificationVisit row per click with what the server can see
// directly, and returns the row id so the rendered page can send the
// browser-only details (screen size etc.) back via the beacon. Never
// throws: a logging failure must not block verification.
async function logVisit(
  record: { token: string; discordId: string; guildId: string },
  ip: string | undefined,
  userAgent: string | undefined,
  acceptLanguage: string | undefined,
): Promise<string | null> {
  try {
    const visit = await prisma.verificationVisit.create({
      data: {
        token: record.token,
        discordId: record.discordId,
        guildId: record.guildId,
        ip: ip ?? "unknown",
        userAgent: userAgent ? userAgent.slice(0, 1000) : null,
        acceptLanguage: acceptLanguage ? acceptLanguage.slice(0, 255) : null,
      },
      select: { id: true },
    });
    return visit.id;
  } catch (err) {
    console.error("Failed to log verification visit", err);
    return null;
  }
}

verifyRouter.get("/verify/:token", verifyLimiter, asyncHandler(async (req, res) => {
  if (isLinkPreviewBot(req.headers["user-agent"])) {
    res.send(linkPreviewPage());
    return;
  }

  const { token } = req.params;

  const record = await prisma.verificationToken.findUnique({ where: { token } });
  if (!record) {
    res.status(404).send(errorPage("Invalid link", "This verification link is invalid."));
    return;
  }

  // Logged before the used/expired checks on purpose: a click on an old
  // (possibly leaked) link is worth knowing about too.
  const visitId = await logVisit(record, req.ip, req.headers["user-agent"], req.headers["accept-language"]);
  const send = (status: number, html: string) => res.status(status).send(withVisitBeacon(html, visitId));

  if (record.usedAt) {
    send(410, errorPage("Already used", "This verification link has already been used."));
    return;
  }
  if (record.expiresAt < new Date()) {
    send(410, errorPage("Link expired", "This verification link has expired."));
    return;
  }

  const ip = req.ip;
  if (!ip) {
    send(400, errorPage("Something went wrong", "Could not determine your IP address."));
    return;
  }

  if (config.geo.allowClientIpFallback && !record.geoCheckedAt && isPrivateIp(ip)) {
    send(200, detectingIpPage(token));
    return;
  }

  let geo: GeoResult;
  try {
    geo = await ensureGeoCheck(token, record, ip);
  } catch (err) {
    console.error("GeoIP/VPN check failed", err);
    send(502, errorPage("Temporarily unavailable", "Verification service is temporarily unavailable. Please try again shortly."));
    return;
  }

  await prisma.member.update({
    where: { discordId_guildId: { discordId: record.discordId, guildId: record.guildId } },
    data: { country: geo.countryCode, ipRiskScore: geo.fraudScore, lastIp: geo.ip },
  });

  if (isGeoAllowed(geo, record.guildId)) {
    try {
      await assignVerifiedRole(record.discordId, record.guildId);
    } catch (err) {
      console.error("Failed to assign verified role", err);
      send(500, errorPage("Role assignment failed", "We couldn't update your Discord roles. Please try again or contact a moderator."));
      return;
    }
    await prisma.verificationToken.update({ where: { token }, data: { usedAt: new Date() } });
    await prisma.member.update({
      where: { discordId_guildId: { discordId: record.discordId, guildId: record.guildId } },
      data: { status: "verified", verifiedAt: new Date() },
    });
    await postAuditLog(
      record.guildId,
      `<@${record.discordId}> **verified** automatically (country: ${geo.countryCode ?? "unknown"}, fraud score: ${geo.fraudScore}).`,
      { category: "verification", targetId: record.discordId, discord: false },
    );
    send(200, successPage());
    return;
  }

  send(200, reviewFormPage(geoReasonMessage(geo, "verify"), config.captcha.siteKey));
}));

// Receives the browser-only details from withVisitBeacon()'s script. The
// visit id is an unguessable UUID only handed to the visitor's own page,
// and each row can be filled in once, shortly after the visit.
const BEACON_WINDOW_MS = 10 * 60 * 1000;

function intInRange(value: unknown, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : null;
}

function shortString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

verifyRouter.post(
  "/verify/visit/:visitId/client-info",
  visitBeaconLimiter,
  json({ limit: "2kb" }),
  asyncHandler(async (req, res) => {
    const { visitId } = req.params;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const languages = Array.isArray(body.languages)
      ? body.languages.filter((l): l is string => typeof l === "string").join(", ")
      : body.language;
    const pixelRatio =
      typeof body.pixelRatio === "number" && Number.isFinite(body.pixelRatio) && body.pixelRatio > 0 && body.pixelRatio <= 10
        ? body.pixelRatio
        : null;

    await prisma.verificationVisit.updateMany({
      where: { id: visitId, clientInfoAt: null, createdAt: { gte: new Date(Date.now() - BEACON_WINDOW_MS) } },
      data: {
        browserLanguage: shortString(languages, 255),
        screenWidth: intInRange(body.screenWidth, 20000),
        screenHeight: intInRange(body.screenHeight, 20000),
        viewportWidth: intInRange(body.viewportWidth, 20000),
        viewportHeight: intInRange(body.viewportHeight, 20000),
        pixelRatio,
        timezone: shortString(body.timezone, 64),
        clientInfoAt: new Date(),
      },
    });
    res.status(204).end();
  }),
);

verifyRouter.post("/verify/:token", verifyLimiter, asyncHandler(async (req, res) => {
  const { token } = req.params;

  const record = await prisma.verificationToken.findUnique({ where: { token } });
  if (!record) {
    res.status(404).send(errorPage("Invalid link", "This verification link is invalid."));
    return;
  }
  if (record.usedAt) {
    res
      .status(410)
      .send(errorPage("Already used", "This verification link has already been used."));
    return;
  }
  if (record.expiresAt < new Date()) {
    res.status(410).send(errorPage("Link expired", "This verification link has expired."));
    return;
  }
  if (!record.geoCheckedAt || !record.geoIp) {
    res
      .status(400)
      .send(errorPage("Something went wrong", "Please reopen your verification link and try again."));
    return;
  }

  const geo: GeoResult = {
    countryCode: record.geoCountry,
    fraudScore: record.geoFraudScore ?? 0,
    isVpn: record.geoIsVpn ?? false,
    raw: record.geoRaw,
    ip: record.geoIp,
  };

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const captchaToken: string = typeof req.body?.["cf-turnstile-response"] === "string" ? req.body["cf-turnstile-response"] : "";

  const errors: ReviewFormErrors = {};
  if (!name || name.length > 100) {
    errors.name = "Please enter your name (max 100 characters).";
  }
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) {
    errors.email = "Please enter a valid email address.";
  }
  if (!captchaToken) {
    errors.captcha = "Please complete the verification challenge.";
  } else if (!(await verifyTurnstileToken(captchaToken, req.ip ?? ""))) {
    errors.captcha = "Verification challenge failed. Please try again.";
  }

  if (errors.name || errors.email || errors.captcha) {
    res.status(400).send(reviewFormPage(geoReasonMessage(geo, "verify"), config.captcha.siteKey, errors));
    return;
  }

  await prisma.verificationToken.update({ where: { token }, data: { usedAt: new Date() } });
  await prisma.member.update({
    where: { discordId_guildId: { discordId: record.discordId, guildId: record.guildId } },
    data: { status: "pending_review" },
  });
  await createReviewEntry(record.discordId, record.guildId, geo.isVpn ? "vpn" : "country", record.geoIp, geo, {
    name,
    email,
  });
  await postAuditLog(
    record.guildId,
    `<@${record.discordId}> submitted a **manual review** request (reason: ${geo.isVpn ? "vpn" : "country"}, country: ${geo.countryCode ?? "unknown"}).`,
    { category: "review", targetId: record.discordId, discord: false },
  );

  res.send(reviewSubmittedPage());
}));

// Called by detectingIpPage()'s inline script when the server only sees a
// private/loopback IP for this visitor (local dev, or a proxy that isn't
// forwarding the real IP) and GEO_ALLOW_CLIENT_IP_FALLBACK is on. Runs the
// normal GeoIP/VPN check using the visitor-reported public IP instead, then
// the page reloads and GET /verify/:token picks up the now-cached result.
verifyRouter.post("/verify/:token/local-ip", verifyLimiter, json(), asyncHandler(async (req, res) => {
  const { token } = req.params;

  const record = await prisma.verificationToken.findUnique({ where: { token } });
  if (!record || record.usedAt || record.expiresAt < new Date() || record.geoCheckedAt) {
    res.status(204).end();
    return;
  }

  const ip = req.ip;
  if (!ip) {
    res.status(204).end();
    return;
  }

  const reportedIp = typeof req.body?.ip === "string" ? req.body.ip.trim() : "";
  const effectiveIp =
    config.geo.allowClientIpFallback && reportedIp && isIP(reportedIp) && !isPrivateIp(reportedIp)
      ? reportedIp
      : ip;

  try {
    await ensureGeoCheck(token, record, effectiveIp);
  } catch (err) {
    console.error("GeoIP/VPN check failed (client-IP fallback)", err);
  }
  res.status(204).end();
}));
