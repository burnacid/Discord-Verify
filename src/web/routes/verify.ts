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
import { asyncHandler } from "../asyncHandler.js";
import { verifyLimiter } from "../rateLimit.js";
import {
  detectingIpPage,
  errorPage,
  linkPreviewPage,
  reviewFormPage,
  reviewSubmittedPage,
  successPage,
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

  const ip = req.ip;
  if (!ip) {
    res.status(400).send(errorPage("Something went wrong", "Could not determine your IP address."));
    return;
  }

  if (config.geo.allowClientIpFallback && !record.geoCheckedAt && isPrivateIp(ip)) {
    res.send(detectingIpPage(token));
    return;
  }

  let geo: GeoResult;
  try {
    geo = await ensureGeoCheck(token, record, ip);
  } catch (err) {
    console.error("GeoIP/VPN check failed", err);
    res
      .status(502)
      .send(errorPage("Temporarily unavailable", "Verification service is temporarily unavailable. Please try again shortly."));
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
      res
        .status(500)
        .send(errorPage("Role assignment failed", "We couldn't update your Discord roles. Please try again or contact a moderator."));
      return;
    }
    await prisma.verificationToken.update({ where: { token }, data: { usedAt: new Date() } });
    await prisma.member.update({
      where: { discordId_guildId: { discordId: record.discordId, guildId: record.guildId } },
      data: { status: "verified", verifiedAt: new Date() },
    });
    res.send(successPage());
    return;
  }

  res.send(reviewFormPage(geoReasonMessage(geo), config.captcha.siteKey));
}));

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
    res.status(400).send(reviewFormPage(geoReasonMessage(geo), config.captcha.siteKey, errors));
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
