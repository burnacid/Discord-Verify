import { renderAdminPage } from "./layout.js";
import type { AdminUser, FlashKind } from "./layout.js";
import type { RssFeed } from "@prisma/client";
import type Parser from "rss-parser";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function itemRow(item: Parser.Item, index: number): string {
  const title = item.title ?? "Untitled";
  const date = item.isoDate ? item.isoDate.slice(0, 16).replace("T", " ") : "—";
  return `<tr>
    <td>${escapeHtml(title)}</td>
    <td>${date}</td>
    <td class="actions">
      <form class="inline" method="post" action="test">
        <input type="hidden" name="itemIndex" value="${index}" />
        <button type="submit" class="btn-primary" onclick="return confirm('Post this item to the configured channel now?')">Post</button>
      </form>
    </td>
  </tr>`;
}

export function rssTestPage(
  user: AdminUser,
  feed: RssFeed,
  items: Parser.Item[],
  defaultTemplate: string,
  flash?: string,
  flashKind?: FlashKind,
): string {
  const effectiveTemplate = feed.template ?? defaultTemplate;
  const usingDefault = feed.template === null;
  const body = `
    <h1>Test — ${escapeHtml(feed.name)}</h1>
    <p class="hint" style="margin-bottom:8px;">Pick an item from the feed to post to its configured channel right now. This does not affect the feed's normal dedup tracking — items will still post again through the regular poller when they're actually new.</p>
    <p class="hint" style="margin-bottom:16px;">Using ${usingDefault ? "the default template" : "this feed's own template"}: <code>${escapeHtml(effectiveTemplate)}</code></p>

    ${
      items.length === 0
        ? `<div class="card empty">No items found in this feed.</div>`
        : `<div class="table-wrap"><table>
          <thead>
            <tr><th>Title</th><th>Published</th><th></th></tr>
          </thead>
          <tbody>${items.map((item, i) => itemRow(item, i)).join("")}</tbody>
        </table></div>`
    }

    <p class="mt-lg"><a href="/admin/rss">Back to RSS Feeds</a></p>
  `;

  return renderAdminPage(`Test — ${feed.name}`, user, body, flash, flashKind);
}
