import { Router } from "express";
import { prisma } from "../../db.js";
import { fetchGuildTextChannels } from "../../bot/channelLookup.js";
import { pollRssFeeds, fetchFeedItems, postItem, getDefaultTemplate } from "../../jobs/rssPoller.js";
import { asyncHandler } from "../asyncHandler.js";
import { requireAdmin } from "./session.js";
import { rssPage } from "../views/admin/rss.js";
import { rssTestPage } from "../views/admin/rssTest.js";
import { errorPage, notFoundPage } from "../views/verifyPages.js";
import { flashQuery, parseFlashKind } from "./flashQuery.js";

export const rssRouter = Router();

rssRouter.use("/admin/rss", requireAdmin);

function adminUser(req: { session: { discordId?: string; username?: string } }) {
  return { discordId: req.session.discordId!, username: req.session.username ?? "Admin" };
}

rssRouter.get(
  "/admin/rss",
  asyncHandler(async (req, res) => {
    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;
    const flashKind = parseFlashKind(req.query.flashKind);
    const [feeds, channels, defaultTemplate] = await Promise.all([
      prisma.rssFeed.findMany({ orderBy: { createdAt: "asc" } }),
      fetchGuildTextChannels(),
      getDefaultTemplate(),
    ]);
    res.send(rssPage(adminUser(req), feeds, channels, defaultTemplate, flash, flashKind));
  }),
);

rssRouter.post(
  "/admin/rss",
  asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const feedUrl = typeof req.body?.feedUrl === "string" ? req.body.feedUrl.trim() : "";
    const channelId = typeof req.body?.channelId === "string" ? req.body.channelId.trim() : "";
    const template = parseTemplate(req.body?.template);

    if (!name || !isValidUrl(feedUrl) || !channelId) {
      res.status(400).send(errorPage("Invalid feed", "Name, a valid feed URL, and a channel are required."));
      return;
    }

    await prisma.rssFeed.create({ data: { name, feedUrl, channelId, template } });
    res.redirect(`/admin/rss?${flashQuery("Feed added.")}`);
  }),
);

rssRouter.post(
  "/admin/rss/:id/edit",
  asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const feedUrl = typeof req.body?.feedUrl === "string" ? req.body.feedUrl.trim() : "";
    const channelId = typeof req.body?.channelId === "string" ? req.body.channelId.trim() : "";
    const template = parseTemplate(req.body?.template);

    if (!name || !isValidUrl(feedUrl) || !channelId) {
      res.status(400).send(errorPage("Invalid feed", "Name, a valid feed URL, and a channel are required."));
      return;
    }

    // Changing feedUrl may invalidate lastGuid against the new feed's item
    // list; the poller's idx===-1 path resyncs without posting on the next
    // cycle, so no special-casing is needed here.
    const result = await prisma.rssFeed
      .update({ where: { id: req.params.id }, data: { name, feedUrl, channelId, template } })
      .catch(() => null);
    if (!result) {
      res.redirect(`/admin/rss?${flashQuery("Feed not found.", "error")}`);
      return;
    }
    res.redirect(`/admin/rss?${flashQuery("Feed updated.")}`);
  }),
);

rssRouter.post(
  "/admin/rss/:id/toggle",
  asyncHandler(async (req, res) => {
    const existing = await prisma.rssFeed.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.redirect(`/admin/rss?${flashQuery("Feed not found.", "error")}`);
      return;
    }
    await prisma.rssFeed.update({ where: { id: req.params.id }, data: { enabled: !existing.enabled } });
    res.redirect(`/admin/rss?${flashQuery(existing.enabled ? "Feed disabled." : "Feed enabled.")}`);
  }),
);

rssRouter.get(
  "/admin/rss/:id/test",
  asyncHandler(async (req, res) => {
    const feed = await prisma.rssFeed.findUnique({ where: { id: req.params.id } });
    if (!feed) {
      res.status(404).send(notFoundPage());
      return;
    }
    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;
    const flashKind = parseFlashKind(req.query.flashKind);
    const [items, defaultTemplate] = await Promise.all([fetchFeedItems(feed.feedUrl), getDefaultTemplate()]);
    res.send(rssTestPage(adminUser(req), feed, items, defaultTemplate, flash, flashKind));
  }),
);

rssRouter.post(
  "/admin/rss/:id/test",
  asyncHandler(async (req, res) => {
    const feed = await prisma.rssFeed.findUnique({ where: { id: req.params.id } });
    if (!feed) {
      res.status(404).send(notFoundPage());
      return;
    }
    const itemIndex = Number(req.body?.itemIndex);
    const items = await fetchFeedItems(feed.feedUrl);
    const item = Number.isInteger(itemIndex) ? items[itemIndex] : undefined;
    if (!item) {
      res.redirect(`/admin/rss/${feed.id}/test?${flashQuery("Item not found — the feed may have changed.", "error")}`);
      return;
    }

    // Deliberately does not touch lastGuid/lastPostedAt — this is a manual
    // test post, not part of the normal dedup-tracked posting flow.
    await postItem(feed, item, await getDefaultTemplate());
    res.redirect(`/admin/rss/${feed.id}/test?${flashQuery(`Posted "${item.title ?? "item"}" to the channel.`)}`);
  }),
);

rssRouter.post(
  "/admin/rss/default-template",
  asyncHandler(async (req, res) => {
    const defaultTemplate = typeof req.body?.defaultTemplate === "string" ? req.body.defaultTemplate.trim() : "";
    if (!defaultTemplate) {
      res.status(400).send(errorPage("Invalid template", "The default template can't be empty."));
      return;
    }
    await prisma.rssSettings.upsert({
      where: { id: 1 },
      create: { id: 1, defaultTemplate },
      update: { defaultTemplate },
    });
    res.redirect(`/admin/rss?${flashQuery("Default template saved.")}`);
  }),
);

rssRouter.post(
  "/admin/rss/check",
  asyncHandler(async (req, res) => {
    try {
      await pollRssFeeds();
      res.redirect(`/admin/rss?${flashQuery("Checked all feeds for new posts.")}`);
    } catch (err) {
      console.error("Manual RSS check failed", err);
      res.redirect(`/admin/rss?${flashQuery("Check failed — see server logs.", "error")}`);
    }
  }),
);

rssRouter.post(
  "/admin/rss/:id/delete",
  asyncHandler(async (req, res) => {
    await prisma.rssFeed.delete({ where: { id: req.params.id } }).catch(() => {});
    res.redirect(`/admin/rss?${flashQuery("Feed deleted.")}`);
  }),
);

function parseTemplate(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
