import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { client } from "../../bot/client.js";
import { AUDIT_CATEGORIES } from "../../bot/auditLog.js";
import type { AuditCategory } from "../../bot/auditLog.js";
import { asyncHandler } from "../asyncHandler.js";
import { requireAdmin } from "./session.js";
import { auditLogPage } from "../views/admin/auditLog.js";

export const auditLogRouter = Router();

auditLogRouter.use("/admin/audit-log", requireAdmin);

const PAGE_SIZE = 50;
const SNOWFLAKE_RE = /^\d{15,25}$/;
const MENTION_RE = /<@!?(\d{15,25})>/g;

function isCategory(value: unknown): value is AuditCategory {
  return typeof value === "string" && Object.hasOwn(AUDIT_CATEGORIES, value);
}

auditLogRouter.get(
  "/admin/audit-log",
  asyncHandler(async (req, res) => {
    const guildId = req.session.guildId!;
    const category = isCategory(req.query.category) ? req.query.category : null;
    const rawUser = typeof req.query.user === "string" ? req.query.user.trim() : "";
    const userId = SNOWFLAKE_RE.test(rawUser) ? rawUser : null;
    const page = Math.max(1, Number(req.query.page) || 1);

    const where: Prisma.AuditLogEntryWhereInput = {
      guildId,
      ...(category ? { category } : {}),
      ...(userId ? { OR: [{ targetId: userId }, { actorId: userId }] } : {}),
    };

    const [entries, total] = await Promise.all([
      prisma.auditLogEntry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.auditLogEntry.count({ where }),
    ]);

    // Resolve <@id> mentions to usernames for display. users.fetch() serves
    // from the client cache when it can; a lookup failure (deleted account,
    // API hiccup) just leaves that mention shown as a raw ID.
    const ids = new Set<string>();
    for (const e of entries) for (const m of e.message.matchAll(MENTION_RE)) ids.add(m[1]);
    const usernames = new Map<string, string>();
    await Promise.all(
      [...ids].map(async (id) => {
        try {
          usernames.set(id, (await client.users.fetch(id)).username);
        } catch {
          /* shown as raw ID */
        }
      }),
    );

    res.send(
      auditLogPage(
        { discordId: req.session.discordId!, username: req.session.username ?? "Admin" },
        entries,
        usernames,
        { category, user: rawUser, invalidUser: rawUser !== "" && !userId },
        page,
        Math.max(1, Math.ceil(total / PAGE_SIZE)),
        total,
      ),
    );
  }),
);
