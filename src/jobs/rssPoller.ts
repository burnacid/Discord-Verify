import Parser from "rss-parser";
import type { RssFeed } from "@prisma/client";
import { prisma } from "../db.js";
import { client } from "../bot/client.js";
import { renderTemplate, DEFAULT_RSS_TEMPLATE } from "./rssTemplate.js";
import { runTracked } from "./jobTracking.js";

const parser = new Parser();

export async function getDefaultTemplate(guildId: string): Promise<string> {
  const settings = await prisma.rssSettings.findUnique({ where: { guildId } });
  return settings?.defaultTemplate ?? DEFAULT_RSS_TEMPLATE;
}

// Distinct from lastPostedAt (which only advances when a new item is
// actually found/posted) — set on every poll attempt so a quiet-but-healthy
// feed and a broken one no longer look identical in the admin UI.
function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 500 ? message.slice(0, 500) + "…" : message;
}

export async function pollRssFeeds(): Promise<void> {
  const feeds = await prisma.rssFeed.findMany({ where: { enabled: true } });
  // Default template is per-guild now — cache it per guild for this cycle
  // instead of re-querying it once per feed.
  const defaultTemplateByGuild = new Map<string, string>();

  for (const feed of feeds) {
    let defaultTemplate = defaultTemplateByGuild.get(feed.guildId);
    if (defaultTemplate === undefined) {
      defaultTemplate = await getDefaultTemplate(feed.guildId);
      defaultTemplateByGuild.set(feed.guildId, defaultTemplate);
    }

    try {
      await pollOneFeed(feed, defaultTemplate);
      await prisma.rssFeed.update({ where: { id: feed.id }, data: { lastCheckedAt: new Date(), lastError: null } });
    } catch (err) {
      console.error(`RSS poll failed for feed "${feed.name}" (${feed.id})`, err);
      await prisma.rssFeed
        .update({ where: { id: feed.id }, data: { lastCheckedAt: new Date(), lastError: errorMessage(err) } })
        .catch(() => {});
    }
  }
}

export async function fetchFeedItems(feedUrl: string): Promise<Parser.Item[]> {
  const parsed = await parser.parseURL(feedUrl);
  return parsed.items ?? [];
}

async function pollOneFeed(feed: RssFeed, defaultTemplate: string): Promise<void> {
  const items = await fetchFeedItems(feed.feedUrl);

  // First-ever poll for a newly-added feed: seed lastGuid without posting,
  // so adding a feed doesn't backfill-spam the channel with its whole history.
  if (feed.lastGuid === null) {
    const newest = items[0];
    await prisma.rssFeed.update({
      where: { id: feed.id },
      data: { lastGuid: newest ? itemGuid(newest) : "", lastPostedAt: new Date() },
    });
    return;
  }

  const idx = items.findIndex((it) => itemGuid(it) === feed.lastGuid);
  // idx === -1: lastGuid fell off the feed (or feedUrl changed). Resync to
  // newest without posting rather than risk treating the whole feed as new.
  const newItems = idx === -1 ? [] : items.slice(0, idx).reverse();

  for (const item of newItems) {
    await postItem(feed, item, defaultTemplate);
  }

  const newest = items[0];
  if (newest) {
    await prisma.rssFeed.update({
      where: { id: feed.id },
      data: { lastGuid: itemGuid(newest), lastPostedAt: new Date() },
    });
  }
}

function itemGuid(item: Parser.Item): string {
  return item.guid ?? item.link ?? item.title ?? "";
}

export async function postItem(feed: RssFeed, item: Parser.Item, defaultTemplate: string): Promise<void> {
  const channel = await client.channels.fetch(feed.channelId);
  if (!channel?.isTextBased() || channel.isThread() || channel.isDMBased()) return;
  const content = renderTemplate(feed.template ?? defaultTemplate, feed, item);
  await channel.send({ content });
}

export function runOnce(): Promise<void> {
  return runTracked("rssPoller", pollRssFeeds);
}

export function startRssPollerJob(intervalMs: number): NodeJS.Timeout {
  runOnce().catch((err) => console.error("RSS poller job failed", err));
  return setInterval(() => {
    runOnce().catch((err) => console.error("RSS poller job failed", err));
  }, intervalMs);
}
