import { Router } from "express";
import { prisma } from "../../db.js";
import { client } from "../../bot/client.js";
import { fetchGuildRoles, fetchGuildTextChannels } from "../../bot/channelLookup.js";
import { fetchGuildMember } from "../../bot/memberLookup.js";
import { getRuntimeSettings, updateRuntimeSettings } from "../../runtimeSettings.js";
import { decideReviewEntry, sendVerificationLink } from "../../bot/adminActions.js";
import { requestRestart } from "../../lifecycle.js";
import { getGeoStoreStatus } from "../../geo/store.js";
import { asyncHandler } from "../asyncHandler.js";
import { requireAdmin } from "./session.js";
import { dashboardPage } from "../views/admin/dashboard.js";
import type { PendingReviewRow, PendingVerificationRow, SystemStatus } from "../views/admin/dashboard.js";
import { renderAdminPage } from "../views/admin/layout.js";
import { errorPage } from "../views/verifyPages.js";
import { flashQuery, parseFlashKind } from "./flashQuery.js";

// Comfortably more than the 12h GeoIP refresh interval, so one missed cycle
// doesn't immediately flag the dashboard as unhealthy.
const GEO_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

const PENDING_VERIFICATIONS_LIMIT = 25;

export const dashboardRouter = Router();

// Prefix match: covers /admin, /admin/review/*, /admin/settings on this router.
dashboardRouter.use("/admin", requireAdmin);

dashboardRouter.get(
  "/admin",
  asyncHandler(async (req, res) => {
    const guildId = req.session.guildId!;
    const [
      verified,
      pendingReview,
      rejected,
      unverified,
      pendingEntries,
      pendingVerificationTokens,
      guild,
      erroringFeeds,
      erroringSources,
      channels,
      roles,
    ] = await Promise.all([
        prisma.member.count({ where: { guildId, status: "verified" } }),
        prisma.member.count({ where: { guildId, status: "pending_review" } }),
        prisma.member.count({ where: { guildId, status: "rejected" } }),
        prisma.member.count({ where: { guildId, status: "unverified" } }),
        prisma.reviewQueueEntry.findMany({
          where: { guildId, status: "pending" },
          include: { member: true },
          orderBy: { createdAt: "asc" },
        }),
        // Latest unused token per member who was sent a link but never opened
        // it (or opened it but let it expire) — usedAt is only ever set once
        // the /verify/:token route is actually visited (src/web/routes/verify.ts).
        prisma.verificationToken.findMany({
          where: { guildId, usedAt: null, member: { status: "unverified" } },
          orderBy: { createdAt: "desc" },
          distinct: ["discordId"],
          take: PENDING_VERIFICATIONS_LIMIT,
        }),
        client.guilds.fetch(guildId),
        prisma.rssFeed.count({ where: { guildId, enabled: true, lastError: { not: null } } }),
        prisma.eventSource.count({ where: { guildId, enabled: true, lastError: { not: null } } }),
        fetchGuildTextChannels(guildId),
        fetchGuildRoles(guildId),
      ]);

    const pendingVerifications: PendingVerificationRow[] = await Promise.all(
      pendingVerificationTokens.map(async (token) => {
        const guildMember = await fetchGuildMember(token.discordId, guildId);
        return {
          discordId: token.discordId,
          username: guildMember?.user.username ?? null,
          sentAt: token.createdAt,
          expiresAt: token.expiresAt,
          expired: token.expiresAt < new Date(),
        };
      }),
    );

    const pending: PendingReviewRow[] = pendingEntries.map((entry) => ({
      id: entry.id,
      discordId: entry.discordId,
      name: entry.name,
      email: entry.email,
      reason: entry.reason,
      country: entry.member.country,
      fraudScore: entry.member.ipRiskScore,
      ip: entry.member.lastIp,
      createdAt: entry.createdAt,
    }));

    const verifiedPercent = guild.memberCount > 0 ? Math.round((verified / guild.memberCount) * 100) : 0;

    const geoStatus = getGeoStoreStatus();
    const geoStale = !geoStatus.loaded || !geoStatus.loadedAt || Date.now() - geoStatus.loadedAt.getTime() > GEO_STALE_AFTER_MS;

    const system: SystemStatus = { geoStale, erroringFeeds, erroringSources };

    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;
    const flashKind = parseFlashKind(req.query.flashKind);

    res.send(
      dashboardPage(
        { discordId: req.session.discordId!, username: req.session.username ?? "Admin" },
        { verified, pendingReview, rejected, unverified, verifiedPercent },
        pending,
        pendingVerifications,
        getRuntimeSettings(guildId),
        system,
        channels,
        roles,
        flash,
        flashKind,
      ),
    );
  }),
);

dashboardRouter.post(
  "/admin/review/:id/approve",
  asyncHandler(async (req, res) => {
    const result = await decideReviewEntry(req.params.id, req.session.guildId!, true, req.session.discordId!);
    const flash = result.ok
      ? "Approved."
      : result.reason === "not_found"
        ? "Review entry not found."
        : result.reason === "already_resolved"
          ? `Already resolved as ${result.entryStatus}.`
          : "Couldn't assign the Verified role. Check the bot's permissions/role position.";
    res.redirect(`/admin?${flashQuery(flash, result.ok ? undefined : "error")}`);
  }),
);

dashboardRouter.post(
  "/admin/review/:id/deny",
  asyncHandler(async (req, res) => {
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    const result = await decideReviewEntry(
      req.params.id,
      req.session.guildId!,
      false,
      req.session.discordId!,
      note || undefined,
    );
    const flash = result.ok
      ? result.deniedAdmin
        ? "Denied (member is an admin, not kicked)."
        : "Denied and removed from the server."
      : result.reason === "not_found"
        ? "Review entry not found."
        : result.reason === "already_resolved"
          ? `Already resolved as ${result.entryStatus}.`
          : "Couldn't remove the member from the server. Check the bot's permissions/role position.";
    res.redirect(`/admin?${flashQuery(flash, result.ok ? undefined : "error")}`);
  }),
);

dashboardRouter.post(
  "/admin/pending-verifications/:discordId/resend",
  asyncHandler(async (req, res) => {
    const result = await sendVerificationLink(
      req.params.discordId,
      req.session.guildId!,
      req.session.discordId!,
      "admin panel (dashboard)",
    );
    const flash = result.ok ? "Verification link sent." : result.reason;
    res.redirect(`/admin?${flashQuery(flash, result.ok ? undefined : "error")}`);
  }),
);

dashboardRouter.post(
  "/admin/settings",
  asyncHandler(async (req, res) => {
    const allowedCountries: string = typeof req.body?.allowedCountries === "string" ? req.body.allowedCountries : "";
    const maxFraudScore = Number(req.body?.maxFraudScore);
    const sendJoinDm = req.body?.sendJoinDm === "on";

    if (!Number.isFinite(maxFraudScore) || maxFraudScore < 0 || maxFraudScore > 100) {
      res.status(400).send(errorPage("Invalid settings", "Max fraud score must be a number between 0 and 100."));
      return;
    }

    await updateRuntimeSettings(req.session.guildId!, {
      allowedCountries: allowedCountries
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean),
      maxFraudScore,
      sendJoinDm,
    });

    res.redirect(`/admin?${flashQuery("Settings saved.")}`);
  }),
);

dashboardRouter.post(
  "/admin/server-setup",
  asyncHandler(async (req, res) => {
    const pick = (name: string) => {
      const value = req.body?.[name];
      return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
    };

    await updateRuntimeSettings(req.session.guildId!, {
      verifiedRoleId: pick("verifiedRoleId"),
      startHereChannelId: pick("startHereChannelId"),
      modReviewChannelId: pick("modReviewChannelId"),
      auditLogChannelId: pick("auditLogChannelId"),
    });

    res.redirect(`/admin?${flashQuery("Server setup saved.")}`);
  }),
);

dashboardRouter.post(
  "/admin/restart",
  asyncHandler(async (req, res) => {
    res.send(
      renderAdminPage(
        "Restarting",
        { discordId: req.session.discordId!, username: req.session.username ?? "Admin" },
        `<h1>Restarting…</h1>
         <p>The bot and web server are restarting — this takes a few seconds.
         Sessions don't survive a restart, so you'll need to log in again afterward.</p>
         <a class="btn btn-secondary" href="/admin">Back to dashboard</a>`,
      ),
    );

    // Give the response time to flush to the client before tearing down
    // the HTTP server the connection is on.
    setTimeout(() => {
      requestRestart().catch((err) => console.error("Admin-requested restart failed", err));
    }, 500);
  }),
);
