import { Router } from "express";
import { prisma } from "../../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { requireAdmin } from "./session.js";
import { inviteReferralsPage } from "../views/admin/inviteReferrals.js";
import type { InviteReferralRow } from "../views/admin/inviteReferrals.js";

export const inviteReferralsRouter = Router();

inviteReferralsRouter.use("/admin/invite-referrals", requireAdmin);

inviteReferralsRouter.get(
  "/admin/invite-referrals",
  asyncHandler(async (req, res) => {
    const guildId = req.session.guildId!;

    const grouped = await prisma.inviteReferral.groupBy({
      by: ["ref"],
      where: { guildId },
      _count: { _all: true },
      _max: { createdAt: true },
    });

    const rows: InviteReferralRow[] = grouped
      .map((g) => ({ ref: g.ref, hits: g._count._all, lastSeenAt: g._max.createdAt! }))
      .sort((a, b) => b.hits - a.hits);

    const total = rows.reduce((sum, r) => sum + r.hits, 0);

    res.send(
      inviteReferralsPage(
        { discordId: req.session.discordId!, username: req.session.username ?? "Admin" },
        rows,
        total,
      ),
    );
  }),
);
