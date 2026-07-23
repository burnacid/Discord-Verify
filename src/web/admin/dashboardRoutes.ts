import { Router } from "express";
import { prisma } from "../../db.js";
import { getRuntimeSettings, updateRuntimeSettings } from "../../runtimeSettings.js";
import { decideReviewEntry } from "../../bot/adminActions.js";
import { requestRestart } from "../../lifecycle.js";
import { asyncHandler } from "../asyncHandler.js";
import { requireAdmin } from "./session.js";
import { dashboardPage } from "../views/admin/dashboard.js";
import type { PendingReviewRow } from "../views/admin/dashboard.js";
import { renderAdminPage } from "../views/admin/layout.js";
import { errorPage } from "../views/verifyPages.js";

export const dashboardRouter = Router();

// Prefix match: covers /admin, /admin/review/*, /admin/settings on this router.
dashboardRouter.use("/admin", requireAdmin);

dashboardRouter.get(
  "/admin",
  asyncHandler(async (req, res) => {
    const [verified, pendingReview, rejected, unverified, pendingEntries] = await Promise.all([
      prisma.member.count({ where: { status: "verified" } }),
      prisma.member.count({ where: { status: "pending_review" } }),
      prisma.member.count({ where: { status: "rejected" } }),
      prisma.member.count({ where: { status: "unverified" } }),
      prisma.reviewQueueEntry.findMany({
        where: { status: "pending" },
        include: { member: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

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

    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;

    res.send(
      dashboardPage(
        { discordId: req.session.discordId!, username: req.session.username ?? "Admin" },
        { verified, pendingReview, rejected, unverified },
        pending,
        getRuntimeSettings(),
        flash,
      ),
    );
  }),
);

dashboardRouter.post(
  "/admin/review/:id/approve",
  asyncHandler(async (req, res) => {
    const result = await decideReviewEntry(req.params.id, true, req.session.discordId!);
    const flash = result.ok
      ? "Approved."
      : result.reason === "not_found"
        ? "Review entry not found."
        : result.reason === "already_resolved"
          ? `Already resolved as ${result.entryStatus}.`
          : "Couldn't assign the Verified role. Check the bot's permissions/role position.";
    res.redirect(`/admin?flash=${encodeURIComponent(flash)}`);
  }),
);

dashboardRouter.post(
  "/admin/review/:id/deny",
  asyncHandler(async (req, res) => {
    const result = await decideReviewEntry(req.params.id, false, req.session.discordId!);
    const flash = result.ok
      ? result.deniedAdmin
        ? "Denied (member is an admin, not kicked)."
        : "Denied and removed from the server."
      : result.reason === "not_found"
        ? "Review entry not found."
        : result.reason === "already_resolved"
          ? `Already resolved as ${result.entryStatus}.`
          : "Couldn't remove the member from the server. Check the bot's permissions/role position.";
    res.redirect(`/admin?flash=${encodeURIComponent(flash)}`);
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

    await updateRuntimeSettings({
      allowedCountries: allowedCountries
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean),
      maxFraudScore,
      sendJoinDm,
    });

    res.redirect(`/admin?flash=${encodeURIComponent("Settings saved.")}`);
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
