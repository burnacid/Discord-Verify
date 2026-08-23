import { EmbedBuilder, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } from "discord.js";
import type { Guild } from "discord.js";
import type { EventSource, EventCategoryRule } from "@prisma/client";
import { prisma } from "../db.js";
import { client } from "../bot/client.js";
import { runTracked } from "./jobTracking.js";

// Common shape every provider normalizes its API response into, so the
// create/update/delete sync logic below doesn't need to know which
// provider an item came from.
interface NormalizedItem {
  externalId: string;
  name: string;
  descriptionHtml: string;
  location: string;
  url: string;
  startUtc: Date;
  endUtc: Date | null; // null = fall back to source.durationMinutes
  updatedAt: Date | null;
  categorySlugs: string[]; // only populated by providers that expose categories (tribe); empty otherwise
}

// Converts a naive "YYYY-MM-DD HH:mm:ss" wall-clock string, interpreted as
// local time in `timeZone`, to a real UTC Date — accounting for DST. Uses
// the Intl API rather than a date/timezone library dependency.
function zonedTimeToUtc(dateStr: string, timeZone: string): Date {
  const naive = new Date(dateStr.replace(" ", "T") + "Z");
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(naive).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = asIfUtc - naive.getTime();
  return new Date(naive.getTime() - offsetMs);
}

// Parses a "YYYY-MM-DD HH:mm:ss" string that's already UTC (as returned by
// e.g. the Tribe Events Calendar REST API's utc_* fields).
function parseUtcDateString(dateStr: string): Date {
  return new Date(dateStr.replace(" ", "T") + "Z");
}

// Decodes numeric HTML entities (&#38; / &#x26;) as well as the handful of
// named ones WordPress commonly uses in titles/descriptions (e.g. "F&#038;B"
// -> "F&B", "&#8217;" -> "'"). Numeric decoding is generic — it covers any
// codepoint WordPress escapes, not just the ones with names below.
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

// ---- Provider: custom JSON API (e.g. GameForce's /api/gamedays) ----

interface GameDayItem {
  id: string;
  date: string;
  name: string;
  description: string;
  location: string;
  url: string;
  updated_at: string;
}

function isGameDayItem(value: unknown): value is GameDayItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.date === "string" &&
    typeof v.name === "string" &&
    typeof v.location === "string"
  );
}

async function fetchCustomItems(source: EventSource): Promise<NormalizedItem[]> {
  const res = await fetch(source.apiUrl);
  if (!res.ok) throw new Error(`API request failed: ${res.status} ${res.statusText}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error("Expected the API to return a JSON array");

  return data.filter(isGameDayItem).map((item) => ({
    externalId: item.id,
    name: decodeHtmlEntities(item.name),
    descriptionHtml: item.description ?? "",
    location: decodeHtmlEntities(item.location || "Unknown location"),
    url: item.url ?? "",
    startUtc: zonedTimeToUtc(item.date, source.timezone),
    endUtc: null,
    updatedAt: item.updated_at ? new Date(item.updated_at) : null,
    categorySlugs: [],
  }));
}

// ---- Provider: WordPress "The Events Calendar" (Tribe) REST API v1 ----
// https://theeventscalendar.com/rest-api/ — GET {site}/wp-json/tribe/events/v1/events

interface TribeVenue {
  venue?: string;
  address?: string;
  city?: string;
}

interface TribeCategory {
  slug?: string;
}

interface TribeEventItem {
  id: number | string;
  title: string;
  description?: string;
  url?: string;
  utc_start_date: string;
  utc_end_date?: string;
  modified_utc?: string;
  venue?: TribeVenue | TribeVenue[] | null;
  categories?: TribeCategory[];
}

function tribeCategorySlugs(categories: TribeEventItem["categories"]): string[] {
  if (!Array.isArray(categories)) return [];
  return categories
    .map((c) => (typeof c?.slug === "string" ? c.slug.toLowerCase() : null))
    .filter((slug): slug is string => slug !== null);
}

function isTribeEventItem(value: unknown): value is TribeEventItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (typeof v.id === "string" || typeof v.id === "number") &&
    typeof v.title === "string" &&
    typeof v.utc_start_date === "string";
}

function buildTribeLocation(venue: TribeEventItem["venue"]): string {
  const v = Array.isArray(venue) ? venue[0] : venue;
  if (!v || typeof v !== "object") return "Online / TBA";
  const parts = [v.venue, v.address, v.city].filter(
    (part): part is string => typeof part === "string" && part.trim() !== "",
  );
  return parts.length > 0 ? decodeHtmlEntities(parts.join(", ")) : "Online / TBA";
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function fetchTribeItems(source: EventSource): Promise<NormalizedItem[]> {
  const results: NormalizedItem[] = [];
  const maxPages = 5; // sane cap so a very large calendar can't loop forever

  const now = new Date();
  const windowEnd = new Date(now.getTime() + source.lookaheadDays * 24 * 60 * 60 * 1000);

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(source.apiUrl);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "50");
    // Ask the API itself to only return events in the lookahead window —
    // both an efficiency win and the actual "next N days" behavior requested.
    url.searchParams.set("start_date", formatDateOnly(now));
    url.searchParams.set("end_date", formatDateOnly(windowEnd));
    // Include-mode category filtering can be pushed down to the API itself
    // (fewer events transferred/paged through); exclude-mode can't — the
    // Tribe API only supports "events in these categories", not the
    // inverse — so that's re-checked client-side in syncEventSource.
    if (source.categoryFilter && source.categoryFilterMode === "include") {
      url.searchParams.set("categories", source.categoryFilter);
    }

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Tribe API request failed: ${res.status} ${res.statusText}`);
    const data: unknown = await res.json();
    const events = Array.isArray((data as { events?: unknown })?.events)
      ? (data as { events: unknown[] }).events
      : [];

    for (const raw of events) {
      if (!isTribeEventItem(raw)) continue;
      results.push({
        externalId: String(raw.id),
        name: decodeHtmlEntities(raw.title),
        descriptionHtml: raw.description ?? "",
        location: buildTribeLocation(raw.venue),
        url: raw.url ?? "",
        startUtc: parseUtcDateString(raw.utc_start_date),
        endUtc: raw.utc_end_date ? parseUtcDateString(raw.utc_end_date) : null,
        updatedAt: raw.modified_utc ? parseUtcDateString(raw.modified_utc) : null,
        categorySlugs: tribeCategorySlugs(raw.categories),
      });
    }

    const totalPages = Number((data as { total_pages?: number })?.total_pages ?? 1);
    if (page >= totalPages || events.length === 0) break;
  }

  // Defensive client-side re-check in case the API ignores start_date/end_date.
  return results.filter((item) => item.startUtc.getTime() <= windowEnd.getTime());
}

async function fetchNormalizedItems(source: EventSource): Promise<NormalizedItem[]> {
  switch (source.provider) {
    case "tribe":
      return fetchTribeItems(source);
    case "custom":
    default:
      return fetchCustomItems(source);
  }
}

function matchesNameFilter(name: string, nameFilter: string | null, nameFilterMode: string): boolean {
  if (!nameFilter) return true;
  const keywords = nameFilter
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  if (keywords.length === 0) return true;
  const lowerName = name.toLowerCase();
  const matchesAny = keywords.some((k) => lowerName.includes(k));
  // "exclude" mode: keep everything EXCEPT items matching a keyword.
  return nameFilterMode === "exclude" ? !matchesAny : matchesAny;
}

function matchesCategoryFilter(
  categorySlugs: string[],
  categoryFilter: string | null,
  categoryFilterMode: string,
): boolean {
  if (!categoryFilter) return true;
  const slugs = categoryFilter
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (slugs.length === 0) return true;
  const matchesAny = categorySlugs.some((s) => slugs.includes(s));
  // "exclude" mode: keep everything EXCEPT items in one of these categories.
  return categoryFilterMode === "exclude" ? !matchesAny : matchesAny;
}

function buildDescription(item: NormalizedItem): string {
  const text = stripHtml(item.descriptionHtml);
  const withLink = item.url ? `${text}\n\nMore info: ${item.url}` : text;
  return withLink.length > 1000 ? withLink.slice(0, 997) + "…" : withLink;
}

function buildName(item: NormalizedItem): string {
  return item.name.length > 100 ? item.name.slice(0, 97) + "…" : item.name;
}

function buildLocation(item: NormalizedItem): string {
  return item.location.length > 100 ? item.location.slice(0, 97) + "…" : item.location;
}

// Kept in sync with EventSource.messageTemplate's DB @default in schema.prisma
// — used to pre-fill the admin "Add source" form.
export const DEFAULT_EVENT_MESSAGE_TEMPLATE = "{{description}}";

const MESSAGE_PLACEHOLDER_RE = /\{\{\s*(\w+)\s*\}\}/g;
const EMBED_COLOR = 0xfee75c; // Discord "yellow" — matches the accent bar in the reference screenshot

function renderEventDescription(template: string, item: NormalizedItem): string {
  const values: Record<string, string> = {
    name: item.name,
    description: stripHtml(item.descriptionHtml),
    location: item.location,
    url: item.url,
    date: item.startUtc.toISOString().slice(0, 16).replace("T", " "),
  };
  const rendered = template.replace(MESSAGE_PLACEHOLDER_RE, (_, key: string) => values[key] ?? "");
  // Discord embed description caps at 4096 chars.
  return rendered.length > 4096 ? rendered.slice(0, 4093) + "…" : rendered;
}

function buildEventEmbed(source: EventSource, item: NormalizedItem): EmbedBuilder {
  // <t:UNIX:F> renders as a full localized date/time, adapted to each
  // viewer's own timezone/locale — better than a manually formatted string.
  const timestampTag = `<t:${Math.floor(item.startUtc.getTime() / 1000)}:F>`;

  const embed = new EmbedBuilder()
    .setTitle(buildName(item))
    .setDescription(renderEventDescription(source.messageTemplate, item))
    .setColor(EMBED_COLOR)
    .addFields({ name: "Time", value: timestampTag }, { name: "Location", value: buildLocation(item) });

  if (item.url) {
    embed.setURL(item.url);
    // "custom" sources (e.g. GameForce) link to an actual reservation page;
    // "tribe" just links to the WordPress event page, not a reservation.
    const linkLabel = source.provider === "tribe" ? "Event Link" : "Reservation Link";
    embed.addFields({ name: linkLabel, value: item.url });
  }

  return embed;
}

// Every rule whose category matches one of the item's categories contributes
// its role — an event can carry several categories, so several roles can be
// mentioned at once. Falls back to the source's single default role when
// nothing matches, so sources with no rules configured keep their old
// behavior unchanged.
function resolveMentionRoleIds(
  source: EventSource,
  rules: EventCategoryRule[],
  item: NormalizedItem,
): string[] {
  const matched = rules.filter((rule) => item.categorySlugs.includes(rule.categorySlug.toLowerCase()));
  const roleIds = [...new Set(matched.map((rule) => rule.mentionRoleId))];
  if (roleIds.length === 0 && source.mentionRoleId) return [source.mentionRoleId];
  return roleIds;
}

async function fetchMessageChannel(channelId: string) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || channel.isThread() || channel.isDMBased()) return null;
  return channel;
}

// Posts a new message, or edits the existing one in place if `existingMessageId`
// is still valid — returns the resulting message id, or null if messages
// aren't configured for this source (or the channel/message is unreachable).
// The configured role is only @-mentioned the first time a message is
// posted for an event, never on later edits, so updates don't re-ping.
async function upsertEventMessage(
  source: EventSource,
  existingMessageId: string | null,
  item: NormalizedItem,
  mentionRoleIds: string[],
): Promise<string | null> {
  if (!source.messageChannelId) return null;
  const channel = await fetchMessageChannel(source.messageChannelId);
  if (!channel) return null;

  const embed = buildEventEmbed(source, item);

  if (existingMessageId) {
    try {
      const edited = await channel.messages.edit(existingMessageId, { content: "", embeds: [embed] });
      return edited.id;
    } catch {
      // Message was likely deleted manually — fall through and repost.
    }
  }

  const content =
    mentionRoleIds.length > 0
      ? `${mentionRoleIds.map((id) => `<@&${id}>`).join(" ")} New event available!`
      : "";
  try {
    const posted = await channel.send({ content, embeds: [embed] });
    return posted.id;
  } catch (err) {
    console.error(`Failed to post event message for "${item.name}"`, err);
    return null;
  }
}

async function deleteEventMessage(source: EventSource, messageId: string | null): Promise<void> {
  if (!messageId || !source.messageChannelId) return;
  const channel = await fetchMessageChannel(source.messageChannelId);
  if (!channel) return;
  await channel.messages.delete(messageId).catch(() => {});
}

async function createScheduledEvent(guild: Guild, item: NormalizedItem, endTime: Date): Promise<string> {
  const created = await guild.scheduledEvents.create({
    name: buildName(item),
    description: buildDescription(item),
    scheduledStartTime: item.startUtc,
    scheduledEndTime: endTime,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: GuildScheduledEventEntityType.External,
    entityMetadata: { location: buildLocation(item) },
  });
  return created.id;
}

// Deletes every Discord scheduled event and posted message this source has
// ever created, then drops the tracking rows. Runs one Discord API call pair
// per event in parallel rather than sequentially — discord.js's own REST
// rate-limit queue keeps this safe, and doing it in parallel matters here:
// this is also the emergency "something went wrong and there are 100 of
// these" cleanup path (see clearAllEventsForSource below), where a one-by-one
// loop would be painfully slow.
async function clearTrackedEvents(source: EventSource): Promise<number> {
  const rows = await prisma.eventSourceItem.findMany({ where: { sourceId: source.id } });
  if (rows.length === 0) return 0;

  const guild = await client.guilds.fetch(source.guildId);
  await Promise.all(
    rows.map(async (row) => {
      await guild.scheduledEvents.delete(row.discordEventId).catch(() => {});
      await deleteEventMessage(source, row.messageId);
    }),
  );

  await prisma.eventSourceItem.deleteMany({ where: { sourceId: source.id } });
  return rows.length;
}

// Used when the source itself (the whole API connection) is removed, so
// nothing it created — events, messages, or category rules — is left behind.
export async function deleteAllEventsForSource(source: EventSource): Promise<void> {
  await prisma.eventCategoryRule.deleteMany({ where: { sourceId: source.id } });
  await clearTrackedEvents(source);
}

// Emergency cleanup: wipes every Discord scheduled event/message this source
// has created without touching the source's config or rules, so a bad API
// response (or a bug) that spammed dozens of events can be undone in one
// click instead of deleting them one by one in Discord. The next sync will
// simply recreate whatever's still legitimately in the source's feed.
export function clearAllEventsForSource(source: EventSource): Promise<number> {
  return clearTrackedEvents(source);
}

export async function syncEventSource(source: EventSource): Promise<void> {
  const allItems = await fetchNormalizedItems(source);
  const items = allItems.filter(
    (item) =>
      matchesNameFilter(item.name, source.nameFilter, source.nameFilterMode) &&
      matchesCategoryFilter(item.categorySlugs, source.categoryFilter, source.categoryFilterMode),
  );
  const itemsById = new Map(items.map((item) => [item.externalId, item]));

  const guild = await client.guilds.fetch(source.guildId);
  const tracked = await prisma.eventSourceItem.findMany({ where: { sourceId: source.id } });
  const rules = await prisma.eventCategoryRule.findMany({ where: { sourceId: source.id } });

  const now = Date.now();
  // "tribe" only ever fetches within this many days, so an item missing
  // from `items` could just be outside that window rather than genuinely
  // cancelled — only conclude cancellation for items that should have been
  // in range. Other providers fetch everything upcoming, so no windowing.
  const windowEndMs =
    source.provider === "tribe" ? now + source.lookaheadDays * 24 * 60 * 60 * 1000 : Infinity;

  for (const row of tracked) {
    // Done (end time passed) independently of whether the API still lists
    // it — some APIs keep past items around forever, so we can't rely on
    // "disappeared from the feed" to catch this. Discord manages the
    // scheduled event's own completed state; we just clean up our tracking
    // row and the posted message.
    if (row.endUtc.getTime() <= now) {
      await deleteEventMessage(source, row.messageId);
      await prisma.eventSourceItem.delete({ where: { id: row.id } }).catch(() => {});
      continue;
    }

    const item = itemsById.get(row.externalId);
    if (!item) {
      const expectedInThisFetch = row.startUtc.getTime() >= now && row.startUtc.getTime() <= windowEndMs;
      if (!expectedInThisFetch) continue; // already started, or beyond our current window — leave it alone

      // Item disappeared from the API entirely (or no longer matches the
      // name filter) — treat as cancelled.
      await guild.scheduledEvents.delete(row.discordEventId).catch(() => {});
      await deleteEventMessage(source, row.messageId);
      await prisma.eventSourceItem.delete({ where: { id: row.id } }).catch(() => {});
      continue;
    }

    const endTime = item.endUtc ?? new Date(item.startUtc.getTime() + source.durationMinutes * 60 * 1000);

    // Always attempt the edit rather than skipping when nothing in the API
    // changed — this doubles as the check for "did someone delete this
    // event manually?". If the edit fails (most likely because the event
    // no longer exists), recreate it fresh so it's never left permanently
    // missing while still tracked/active in the API.
    let discordEventId = row.discordEventId;
    try {
      await guild.scheduledEvents.edit(discordEventId, {
        name: buildName(item),
        description: buildDescription(item),
        scheduledStartTime: item.startUtc,
        scheduledEndTime: endTime,
        entityMetadata: { location: buildLocation(item) },
      });
    } catch {
      try {
        discordEventId = await createScheduledEvent(guild, item, endTime);
      } catch (err) {
        console.error(`Failed to recreate Discord event for "${item.name}" (${item.externalId})`, err);
      }
    }

    // Same self-healing idea for the posted message: upsertEventMessage
    // already tries to edit the existing one first and only reposts if
    // that fails (e.g. it was deleted manually).
    const messageId = await upsertEventMessage(source, row.messageId, item, resolveMentionRoleIds(source, rules, item));

    await prisma.eventSourceItem.update({
      where: { id: row.id },
      data: { apiUpdatedAt: item.updatedAt, startUtc: item.startUtc, endUtc: endTime, messageId, discordEventId },
    });
  }

  const trackedIds = new Set(tracked.map((row) => row.externalId));

  for (const item of items) {
    if (trackedIds.has(item.externalId)) continue;
    if (item.startUtc.getTime() < now) continue; // don't create events already in the past

    const endTime = item.endUtc ?? new Date(item.startUtc.getTime() + source.durationMinutes * 60 * 1000);

    try {
      const discordEventId = await createScheduledEvent(guild, item, endTime);
      const messageId = await upsertEventMessage(source, null, item, resolveMentionRoleIds(source, rules, item));
      await prisma.eventSourceItem.create({
        data: {
          guildId: source.guildId,
          sourceId: source.id,
          externalId: item.externalId,
          discordEventId,
          startUtc: item.startUtc,
          endUtc: endTime,
          messageId,
          apiUpdatedAt: item.updatedAt,
        },
      });
    } catch (err) {
      console.error(`Failed to create Discord event for "${item.name}" (${item.externalId})`, err);
    }
  }

  await prisma.eventSource.update({ where: { id: source.id }, data: { lastSyncedAt: new Date(), lastError: null } });
}

// lastSyncedAt only advances on success (set at the end of syncEventSource
// above), so staleness alone is already a usable signal — this adds a
// human-readable reason instead of just "it's been a while".
function eventSyncErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 500 ? message.slice(0, 500) + "…" : message;
}

export async function syncAllEventSources(): Promise<void> {
  const sources = await prisma.eventSource.findMany({ where: { enabled: true } });
  for (const source of sources) {
    try {
      await syncEventSource(source);
    } catch (err) {
      console.error(`Event sync failed for source "${source.name}" (${source.id})`, err);
      await prisma.eventSource
        .update({ where: { id: source.id }, data: { lastError: eventSyncErrorMessage(err) } })
        .catch(() => {});
    }
  }
}

export function runOnce(): Promise<void> {
  return runTracked("eventSync", syncAllEventSources);
}

export function startEventSyncJob(intervalMs: number): NodeJS.Timeout {
  runOnce().catch((err) => console.error("Event sync job failed", err));
  return setInterval(() => {
    runOnce().catch((err) => console.error("Event sync job failed", err));
  }, intervalMs);
}
