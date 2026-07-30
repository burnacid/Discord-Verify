import type Parser from "rss-parser";
import type { RssFeed } from "@prisma/client";

export const DEFAULT_RSS_TEMPLATE = "📰 **{{title}}**\n{{description}}\n{{link}}";

const PLACEHOLDER_RE = /\{\{\s*(\w+)\s*\}\}/g;

export function renderTemplate(template: string, feed: RssFeed, item: Parser.Item): string {
  const values: Record<string, string> = {
    title: item.title ?? "Untitled",
    link: item.link ?? "",
    description: item.contentSnippet?.trim() ?? "",
    author: item.creator ?? "",
    date: item.isoDate ? item.isoDate.slice(0, 16).replace("T", " ") : (item.pubDate ?? ""),
    feedName: feed.name,
  };
  const rendered = template.replace(PLACEHOLDER_RE, (_, key: string) => values[key] ?? "");
  // Discord hard-caps message content at 2000 chars.
  return rendered.length > 2000 ? rendered.slice(0, 1997) + "…" : rendered;
}
