import Parser from "rss-parser";
import { ChannelType } from "discord.js";
import type { RssFeed } from "@prisma/client";
import { prisma } from "../db.js";
import { client } from "../bot/client.js";
import { renderMessages, DEFAULT_RSS_TEMPLATE } from "./rssTemplate.js";
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

// WPML and Polylang both select a WordPress feed's language via the `lang`
// query var, so this overrides any `lang` already in the stored URL.
export function feedFetchUrl(feed: Pick<RssFeed, "feedUrl" | "language">): string {
  if (!feed.language) return feed.feedUrl;
  const url = new URL(feed.feedUrl);
  url.searchParams.set("lang", feed.language);
  return url.toString();
}

export async function fetchFeedItems(feed: Pick<RssFeed, "feedUrl" | "language">): Promise<Parser.Item[]> {
  const parsed = await parser.parseURL(feedFetchUrl(feed));
  return parsed.items ?? [];
}

async function pollOneFeed(feed: RssFeed, defaultTemplate: string): Promise<void> {
  const items = await fetchFeedItems(feed);

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
  // idx === -1: lastGuid fell off the feed (or feedUrl/language changed). Resync to
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
  const publish = feed.autoPublish && channel.type === ChannelType.GuildAnnouncement;
  // Sent one at a time so a multi-part post arrives in order.
  for (const content of renderMessages(feed.template ?? defaultTemplate, feed, item)) {
    const message = await channel.send({ content });
    if (publish) {
      // Not awaited: Discord allows 10 publishes per channel per hour, and on
      // a rate limit discord.js waits it out — that must not stall the poller.
      // A failure here also mustn't fail the poll, or lastGuid wouldn't
      // advance and the item would be posted again next cycle.
      message.crosspost().catch((err) => {
        console.error(`RSS auto-publish failed for feed "${feed.name}" (${feed.id})`, err);
      });
    }
  }
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
