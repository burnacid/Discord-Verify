import { Router } from "express";
import { prisma } from "../../db.js";
import { verifyMember, unverifyMember } from "../../bot/adminActions.js";
import { fetchGuildMember, searchGuildMembers } from "../../bot/memberLookup.js";
import { config } from "../../config.js";
import { asyncHandler } from "../asyncHandler.js";
import { requireAdmin } from "./session.js";
import { membersPage } from "../views/admin/members.js";
import type { MemberRow } from "../views/admin/members.js";

export const membersRouter = Router();

membersRouter.use("/admin/members", requireAdmin);

const SNOWFLAKE_RE = /^\d{15,25}$/;

membersRouter.get(
  "/admin/members",
  asyncHandler(async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;

    let results: MemberRow[] = [];
    if (query) {
      results = SNOWFLAKE_RE.test(query) ? await lookupById(query) : await lookupByUsername(query);
    }

    res.send(
      membersPage(
        { discordId: req.session.discordId!, username: req.session.username ?? "Admin" },
        query,
        results,
        flash,
      ),
    );
  }),
);

membersRouter.post(
  "/admin/members/:discordId/verify",
  asyncHandler(async (req, res) => {
    const { discordId } = req.params;
    const result = await verifyMember(discordId, config.discord.guildId, req.session.discordId!, "admin panel");
    const flash = result.ok ? "Member verified." : result.reason;
    res.redirect(`/admin/members?q=${encodeURIComponent(discordId)}&flash=${encodeURIComponent(flash)}`);
  }),
);

membersRouter.post(
  "/admin/members/:discordId/unverify",
  asyncHandler(async (req, res) => {
    const { discordId } = req.params;
    const result = await unverifyMember(discordId, config.discord.guildId, req.session.discordId!, "admin panel");
    const flash = result.ok ? "Member unverified." : result.reason;
    res.redirect(`/admin/members?q=${encodeURIComponent(discordId)}&flash=${encodeURIComponent(flash)}`);
  }),
);

async function lookupById(discordId: string): Promise<MemberRow[]> {
  const [guildMember, dbMember] = await Promise.all([
    fetchGuildMember(discordId),
    prisma.member.findUnique({ where: { discordId } }),
  ]);

  if (!guildMember && !dbMember) return [];

  return [
    {
      discordId,
      username: guildMember?.user.username ?? null,
      status: dbMember?.status ?? "unverified",
      country: dbMember?.country ?? null,
      lastIp: dbMember?.lastIp ?? null,
      verifiedAt: dbMember?.verifiedAt ?? null,
    },
  ];
}

async function lookupByUsername(query: string): Promise<MemberRow[]> {
  const guildMembers = await searchGuildMembers(query, 10);
  if (guildMembers.length === 0) return [];

  const dbMembers = await prisma.member.findMany({
    where: { discordId: { in: guildMembers.map((m) => m.id) } },
  });
  const dbByid = new Map(dbMembers.map((m) => [m.discordId, m]));

  return guildMembers.map((gm) => {
    const dbMember = dbByid.get(gm.id);
    return {
      discordId: gm.id,
      username: gm.user.username,
      status: dbMember?.status ?? "unverified",
      country: dbMember?.country ?? null,
      lastIp: dbMember?.lastIp ?? null,
      verifiedAt: dbMember?.verifiedAt ?? null,
    };
  });
}
