import type Parser from "rss-parser";
import type { RssFeed } from "@prisma/client";
import { decodeEntities, htmlToDiscord, splitText, truncateText } from "./htmlToDiscord.js";

export const DEFAULT_RSS_TEMPLATE = "📰 **{{title}}**\n{{description}}\n{{link}}";

const PLACEHOLDER_RE = /\{\{\s*(\w+)\s*\}\}/g;
const CONTENT_RE = /\{\{\s*content\s*\}\}/g;

// Discord hard-caps message content at 2000 chars.
const MAX_MESSAGE_LENGTH = 2000;

// A very long post continues over at most this many messages; anything
// beyond that is shortened so one article can't flood the channel.
export const MAX_MESSAGES_PER_ITEM = 5;

function normalizeUrl(url: string): string {
  return decodeEntities(url).trim().replace(/\/+$/, "").toLowerCase();
}

// Yoast SEO (and similar plugins) append a footer paragraph to every feed
// item — "The post <post link> appeared first on <site link>.", in the site's
// language. Detected by shape rather than wording: a short final paragraph
// that links back to the item itself.
export function stripFeedFooter(html: string, itemLink: string | undefined): string {
  if (!itemLink) return html;
  const match = /<p\b[^>]*>((?:(?!<p\b)[\s\S])*?)<\/p>\s*$/i.exec(html);
  if (!match) return html;
  const paragraph = match[1];
  const text = paragraph.replace(/<[^>]+>/g, "").trim();
  if (text.length > 300) return html;
  const target = normalizeUrl(itemLink);
  const linksToItem = [...paragraph.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].some((m) => normalizeUrl(m[1]) === target);
  return linksToItem ? html.slice(0, match.index).trimEnd() : html;
}

function fullContent(item: Parser.Item): string {
  // WordPress puts the full post in <content:encoded>; rss-parser exposes it
  // under that key. Fall back to the description for feeds without it.
  const encoded = (item as Record<string, unknown>)["content:encoded"];
  const html = typeof encoded === "string" && encoded.trim() ? encoded : (item.content ?? "");
  return htmlToDiscord(stripFeedFooter(html, item.link));
}

function excerpt(item: Parser.Item): string {
  // item.content is the <description> HTML; strip the footer before turning
  // it into text. Feeds without HTML descriptions fall back to the snippet.
  if (item.content) return htmlToDiscord(stripFeedFooter(item.content, item.link));
  return item.contentSnippet?.trim() ?? "";
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER_RE, (_, key: string) => values[key] ?? "");
}

function hardCap(text: string): string {
  return text.length > MAX_MESSAGE_LENGTH ? text.slice(0, MAX_MESSAGE_LENGTH - 1) + "…" : text;
}

// Renders an item into one or more Discord messages. When the template uses
// {{content}} once and the post is too long, the text continues in follow-up
// messages: the first message carries the template text before {{content}}
// (e.g. the title), the last carries the text after it (e.g. the link).
export function renderMessages(template: string, feed: RssFeed, item: Parser.Item): string[] {
  const values: Record<string, string> = {
    title: item.title ?? "Untitled",
    link: item.link ?? "",
    description: excerpt(item),
    author: item.creator ?? "",
    date: item.isoDate ? item.isoDate.slice(0, 16).replace("T", " ") : (item.pubDate ?? ""),
    feedName: feed.name,
  };
  const contentUses = template.match(CONTENT_RE)?.length ?? 0;
  if (contentUses > 0) values.content = fullContent(item);

  const single = fill(template, values);
  if (single.length <= MAX_MESSAGE_LENGTH) return [single];

  if (contentUses === 1 && values.content) {
    const [before, after] = template.split(CONTENT_RE);
    const prefix = fill(before, values);
    const suffix = fill(after, values);
    const firstMax = MAX_MESSAGE_LENGTH - prefix.length;
    const restMax = MAX_MESSAGE_LENGTH - suffix.length;
    // Only worth splitting if the surrounding template text leaves real room.
    if (firstMax >= 200 && restMax >= 200) {
      let chunks = splitText(values.content, firstMax, restMax);
      if (chunks.length > MAX_MESSAGES_PER_ITEM) {
        const kept = chunks.slice(0, MAX_MESSAGES_PER_ITEM - 1);
        const tail = chunks.slice(MAX_MESSAGES_PER_ITEM - 1).join("\n\n");
        chunks = [...kept, truncateText(tail, restMax)];
      }
      return chunks.map((chunk, i) => {
        let message = chunk;
        if (i === 0) message = prefix + message;
        if (i === chunks.length - 1) message = message + suffix;
        return hardCap(message);
      });
    }
  }

  // Can't split cleanly (e.g. only {{description}} is long): shorten the long
  // fields so the rest of the template — like a trailing {{link}} — still fits.
  let rendered = single;
  for (const key of ["content", "description"]) {
    if (rendered.length <= MAX_MESSAGE_LENGTH) break;
    const value = values[key];
    const uses = template.match(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"))?.length ?? 0;
    if (!value || uses === 0) continue;
    const overflow = rendered.length - MAX_MESSAGE_LENGTH;
    values[key] = truncateText(value, Math.max(0, value.length - Math.ceil(overflow / uses)));
    rendered = fill(template, values);
  }
  return [hardCap(rendered)];
}
