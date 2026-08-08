import { Router } from "express";
import { prisma } from "../../db.js";
import { syncAllEventSources, deleteAllEventsForSource } from "../../jobs/eventSync.js";
import { fetchGuildTextChannels, fetchGuildRoles } from "../../bot/channelLookup.js";
import { asyncHandler } from "../asyncHandler.js";
import { requireAdmin } from "./session.js";
import { eventsPage } from "../views/admin/events.js";
import { errorPage } from "../views/verifyPages.js";
import { flashQuery, parseFlashKind } from "./flashQuery.js";

export const eventsRouter = Router();

eventsRouter.use("/admin/events", requireAdmin);

function adminUser(req: { session: { discordId?: string; username?: string } }) {
  return { discordId: req.session.discordId!, username: req.session.username ?? "Admin" };
}

const VALID_PROVIDERS = ["custom", "tribe"] as const;

function parseProvider(value: unknown): string {
  return typeof value === "string" && (VALID_PROVIDERS as readonly string[]).includes(value) ? value : "custom";
}

function parseNameFilter(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

const VALID_NAME_FILTER_MODES = ["include", "exclude"] as const;

function parseNameFilterMode(value: unknown): string {
  return typeof value === "string" && (VALID_NAME_FILTER_MODES as readonly string[]).includes(value)
    ? value
    : "include";
}

function parseMessageChannelId(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

function parseMentionRoleId(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

// A source's id is a global UUID, so without this an admin of one guild
// could otherwise edit/toggle/delete another guild's source by id.
async function findOwnedSource(id: string, guildId: string) {
  const source = await prisma.eventSource.findUnique({ where: { id } });
  return source && source.guildId === guildId ? source : null;
}

eventsRouter.get(
  "/admin/events",
  asyncHandler(async (req, res) => {
    const guildId = req.session.guildId!;
    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;
    const flashKind = parseFlashKind(req.query.flashKind);
    const [sources, channels, roles] = await Promise.all([
      prisma.eventSource.findMany({ where: { guildId }, orderBy: { createdAt: "asc" } }),
      fetchGuildTextChannels(guildId),
      fetchGuildRoles(guildId),
    ]);
    const activeCounts = await Promise.all(
      sources.map((s) => prisma.eventSourceItem.count({ where: { sourceId: s.id } })),
    );
    res.send(eventsPage(adminUser(req), sources, activeCounts, channels, roles, flash, flashKind));
  }),
);

eventsRouter.post(
  "/admin/events",
  asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const provider = parseProvider(req.body?.provider);
    const apiUrl = typeof req.body?.apiUrl === "string" ? req.body.apiUrl.trim() : "";
    const timezone = typeof req.body?.timezone === "string" ? req.body.timezone.trim() : "";
    const durationMinutes = Number(req.body?.durationMinutes);
    const lookaheadDays = Number(req.body?.lookaheadDays);
    const nameFilter = parseNameFilter(req.body?.nameFilter);
    const nameFilterMode = parseNameFilterMode(req.body?.nameFilterMode);
    const messageChannelId = parseMessageChannelId(req.body?.messageChannelId);
    const messageTemplate = typeof req.body?.messageTemplate === "string" ? req.body.messageTemplate.trim() : "";
    const mentionRoleId = parseMentionRoleId(req.body?.mentionRoleId);

    if (!name || !isValidUrl(apiUrl) || !isValidTimezone(timezone)) {
      res.status(400).send(errorPage("Invalid source", "Name, a valid API URL, and a valid timezone are required."));
      return;
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      res.status(400).send(errorPage("Invalid source", "Duration must be a positive number of minutes."));
      return;
    }
    if (!Number.isFinite(lookaheadDays) || lookaheadDays <= 0) {
      res.status(400).send(errorPage("Invalid source", "Lookahead must be a positive number of days."));
      return;
    }
    if (!messageTemplate) {
      res.status(400).send(errorPage("Invalid source", "Message template can't be empty."));
      return;
    }

    await prisma.eventSource.create({
      data: {
        guildId: req.session.guildId!,
        name,
        provider,
        apiUrl,
        timezone,
        durationMinutes,
        lookaheadDays,
        nameFilter,
        nameFilterMode,
        messageChannelId,
        messageTemplate,
        mentionRoleId,
      },
    });
    res.redirect(`/admin/events?${flashQuery("Source added.")}`);
  }),
);

eventsRouter.post(
  "/admin/events/:id/edit",
  asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const provider = parseProvider(req.body?.provider);
    const apiUrl = typeof req.body?.apiUrl === "string" ? req.body.apiUrl.trim() : "";
    const timezone = typeof req.body?.timezone === "string" ? req.body.timezone.trim() : "";
    const durationMinutes = Number(req.body?.durationMinutes);
    const lookaheadDays = Number(req.body?.lookaheadDays);
    const nameFilter = parseNameFilter(req.body?.nameFilter);
    const nameFilterMode = parseNameFilterMode(req.body?.nameFilterMode);
    const messageChannelId = parseMessageChannelId(req.body?.messageChannelId);
    const messageTemplate = typeof req.body?.messageTemplate === "string" ? req.body.messageTemplate.trim() : "";
    const mentionRoleId = parseMentionRoleId(req.body?.mentionRoleId);

    if (!name || !isValidUrl(apiUrl) || !isValidTimezone(timezone)) {
      res.status(400).send(errorPage("Invalid source", "Name, a valid API URL, and a valid timezone are required."));
      return;
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      res.status(400).send(errorPage("Invalid source", "Duration must be a positive number of minutes."));
      return;
    }
    if (!Number.isFinite(lookaheadDays) || lookaheadDays <= 0) {
      res.status(400).send(errorPage("Invalid source", "Lookahead must be a positive number of days."));
      return;
    }
    if (!messageTemplate) {
      res.status(400).send(errorPage("Invalid source", "Message template can't be empty."));
      return;
    }

    const existing = await findOwnedSource(req.params.id, req.session.guildId!);
    if (!existing) {
      res.redirect(`/admin/events?${flashQuery("Source not found.", "error")}`);
      return;
    }

    await prisma.eventSource.update({
      where: { id: existing.id },
      data: {
        name,
        provider,
        apiUrl,
        timezone,
        durationMinutes,
        lookaheadDays,
        nameFilter,
        nameFilterMode,
        messageChannelId,
        messageTemplate,
        mentionRoleId,
      },
    });
    res.redirect(`/admin/events?${flashQuery("Source updated.")}`);
  }),
);

eventsRouter.post(
  "/admin/events/:id/toggle",
  asyncHandler(async (req, res) => {
    const existing = await findOwnedSource(req.params.id, req.session.guildId!);
    if (!existing) {
      res.redirect(`/admin/events?${flashQuery("Source not found.", "error")}`);
      return;
    }
    await prisma.eventSource.update({ where: { id: existing.id }, data: { enabled: !existing.enabled } });
    res.redirect(`/admin/events?${flashQuery(existing.enabled ? "Source disabled." : "Source enabled.")}`);
  }),
);

eventsRouter.post(
  "/admin/events/:id/delete",
  asyncHandler(async (req, res) => {
    const source = await findOwnedSource(req.params.id, req.session.guildId!);
    if (source) {
      // Removes every Discord scheduled event and posted message this
      // source ever created before dropping the source itself — nothing
      // it created is left behind.
      await deleteAllEventsForSource(source).catch((err) =>
        console.error(`Failed to clean up events for deleted source "${source.name}"`, err),
      );
      await prisma.eventSource.delete({ where: { id: source.id } }).catch(() => {});
    }
    res.redirect(`/admin/events?${flashQuery("Source and its events deleted.")}`);
  }),
);

eventsRouter.post(
  "/admin/events/check",
  asyncHandler(async (req, res) => {
    try {
      await syncAllEventSources();
      res.redirect(`/admin/events?${flashQuery("Checked all sources for updates.")}`);
    } catch (err) {
      console.error("Manual event sync failed", err);
      res.redirect(`/admin/events?${flashQuery("Sync failed — see server logs.", "error")}`);
    }
  }),
);

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidTimezone(value: string): boolean {
  if (!value) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
