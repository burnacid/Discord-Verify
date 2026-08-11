import { Router } from "express";
import type { MemberStatus } from "@prisma/client";
import { prisma } from "../../db.js";
import { verifyMember, unverifyMember, sendVerificationLink } from "../../bot/adminActions.js";
import { fetchGuildMember, searchGuildMembers } from "../../bot/memberLookup.js";
import { asyncHandler } from "../asyncHandler.js";
import { requireAdmin } from "./session.js";
import { membersPage } from "../views/admin/members.js";
import type { MemberRow } from "../views/admin/members.js";
import { flashQuery, parseFlashKind } from "./flashQuery.js";

export const membersRouter = Router();

membersRouter.use("/admin/members", requireAdmin);

const SNOWFLAKE_RE = /^\d{15,25}$/;
const VALID_STATUSES = ["verified", "pending_review", "rejected", "unverified"] as const;
const STATUS_LIST_PAGE_SIZE = 100;

function isValidStatus(value: unknown): value is MemberStatus {
  return typeof value === "string" && (VALID_STATUSES as readonly string[]).includes(value);
}

membersRouter.get(
  "/admin/members",
  asyncHandler(async (req, res) => {
    const guildId = req.session.guildId!;
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;
    const flashKind = parseFlashKind(req.query.flashKind);
    const statusFilter = isValidStatus(req.query.status) ? req.query.status : null;
    const page = Math.max(1, Number(req.query.page) || 1);

    let results: MemberRow[] = [];
    let totalPages = 1;
    if (statusFilter) {
      const { rows, total } = await lookupByStatus(guildId, statusFilter, page);
      results = rows;
      totalPages = Math.max(1, Math.ceil(total / STATUS_LIST_PAGE_SIZE));
    } else if (query) {
      results = SNOWFLAKE_RE.test(query) ? await lookupById(guildId, query) : await lookupByUsername(guildId, query);
    }

    res.send(
      membersPage(
        { discordId: req.session.discordId!, username: req.session.username ?? "Admin" },
        query,
        results,
        flash,
        statusFilter,
        page,
        totalPages,
        flashKind,
      ),
    );
  }),
);

membersRouter.post(
  "/admin/members/:discordId/verify",
  asyncHandler(async (req, res) => {
    const { discordId } = req.params;
    const result = await verifyMember(discordId, req.session.guildId!, req.session.discordId!, "admin panel");
    const flash = result.ok ? "Member verified." : result.reason;
    res.redirect(`/admin/members?q=${encodeURIComponent(discordId)}&${flashQuery(flash, result.ok ? undefined : "error")}`);
  }),
);

membersRouter.post(
  "/admin/members/:discordId/unverify",
  asyncHandler(async (req, res) => {
    const { discordId } = req.params;
    const result = await unverifyMember(discordId, req.session.guildId!, req.session.discordId!, "admin panel");
    const flash = result.ok ? "Member unverified." : result.reason;
    res.redirect(`/admin/members?q=${encodeURIComponent(discordId)}&${flashQuery(flash, result.ok ? undefined : "error")}`);
  }),
);

membersRouter.post(
  "/admin/members/:discordId/send-verify-link",
  asyncHandler(async (req, res) => {
    const { discordId } = req.params;
    const result = await sendVerificationLink(discordId, req.session.guildId!, req.session.discordId!, "admin panel");
    const flash = result.ok ? "Verification link sent." : result.reason;
    res.redirect(`/admin/members?q=${encodeURIComponent(discordId)}&${flashQuery(flash, result.ok ? undefined : "error")}`);
  }),
);

async function lookupById(guildId: string, discordId: string): Promise<MemberRow[]> {
  const [guildMember, dbMember] = await Promise.all([
    fetchGuildMember(discordId, guildId),
    prisma.member.findUnique({ where: { discordId_guildId: { discordId, guildId } } }),
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

async function lookupByUsername(guildId: string, query: string): Promise<MemberRow[]> {
  const guildMembers = await searchGuildMembers(query, guildId, 10);
  if (guildMembers.length === 0) return [];

  const dbMembers = await prisma.member.findMany({
    where: { guildId, discordId: { in: guildMembers.map((m) => m.id) } },
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

async function lookupByStatus(
  guildId: string,
  status: MemberStatus,
  page: number,
): Promise<{ rows: MemberRow[]; total: number }> {
  const [dbMembers, total] = await Promise.all([
    prisma.member.findMany({
      where: { guildId, status },
      orderBy: { createdAt: "desc" },
      take: STATUS_LIST_PAGE_SIZE,
      skip: (page - 1) * STATUS_LIST_PAGE_SIZE,
    }),
    prisma.member.count({ where: { guildId, status } }),
  ]);

  const rows = await Promise.all(
    dbMembers.map(async (m) => {
      const guildMember = await fetchGuildMember(m.discordId, guildId);
      return {
        discordId: m.discordId,
        username: guildMember?.user.username ?? null,
        status: m.status,
        country: m.country,
        lastIp: m.lastIp,
        verifiedAt: m.verifiedAt,
      };
    }),
  );

  return { rows, total };
}
