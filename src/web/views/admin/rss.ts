import { renderAdminPage } from "./layout.js";
import type { AdminUser, FlashKind } from "./layout.js";
import type { RssFeed } from "@prisma/client";
import type { GuildTextChannel } from "../../../bot/channelLookup.js";
import { channelOptions } from "./channelOptions.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PLACEHOLDER_HINT =
  "Placeholders: <code>{{title}}</code> <code>{{link}}</code> <code>{{description}}</code> <code>{{author}}</code> <code>{{date}}</code> <code>{{feedName}}</code>";

function channelLabel(channelId: string, channels: GuildTextChannel[]): string {
  const channel = channels.find((c) => c.id === channelId);
  if (!channel) return `<span class="hint">${escapeHtml(channelId)}</span>`;
  return channel.category
    ? `<span class="hint">${escapeHtml(channel.category)} /</span> #${escapeHtml(channel.name)}`
    : `#${escapeHtml(channel.name)}`;
}

function feedRow(feed: RssFeed, channels: GuildTextChannel[]): string {
  const lastPosted = feed.lastPostedAt ? feed.lastPostedAt.toISOString().slice(0, 16).replace("T", " ") : "—";
  const statusBadge = feed.lastError
    ? `<span class="badge badge-rejected" title="${escapeHtml(feed.lastError)}">error</span>`
    : `<span class="badge ${feed.enabled ? "badge-verified" : "badge-unverified"}">${feed.enabled ? "enabled" : "disabled"}</span>`;

  return `<tr>
    <td>${escapeHtml(feed.name)}</td>
    <td><code>${escapeHtml(feed.feedUrl)}</code></td>
    <td>${channelLabel(feed.channelId, channels)}</td>
    <td>${statusBadge}</td>
    <td>${lastPosted}</td>
    <td class="actions">
      <a class="btn btn-secondary" href="/admin/rss/${feed.id}/test">Test</a>
      <form class="inline" method="post" action="/admin/rss/${feed.id}/toggle">
        <button type="submit" class="btn-secondary">${feed.enabled ? "Disable" : "Enable"}</button>
      </form>
      <form class="inline" method="post" action="/admin/rss/${feed.id}/delete">
        <button type="submit" class="btn-deny" onclick="return confirm('Delete this feed?')">Delete</button>
      </form>
    </td>
  </tr>
  <tr>
    <td colspan="6">
      <details>
        <summary class="hint">Edit</summary>
        <form method="post" action="/admin/rss/${feed.id}/edit" class="mt-sm">
          <label for="name-${feed.id}">Name</label>
          <input type="text" id="name-${feed.id}" name="name" value="${escapeHtml(feed.name)}" />

          <label for="feedUrl-${feed.id}">Feed URL</label>
          <input type="text" id="feedUrl-${feed.id}" name="feedUrl" value="${escapeHtml(feed.feedUrl)}" />

          <label for="channelId-${feed.id}">Channel</label>
          <select id="channelId-${feed.id}" name="channelId" data-channel-picker>${channelOptions(channels, feed.channelId, "#")}</select>

          <label for="template-${feed.id}">Post template (leave blank to use the default template)</label>
          <textarea id="template-${feed.id}" name="template" placeholder="Uses the default template below">${escapeHtml(feed.template ?? "")}</textarea>
          <div class="hint">${PLACEHOLDER_HINT}</div>

          <button type="submit" class="btn-primary mt-md">Save</button>
        </form>
      </details>
    </td>
  </tr>`;
}

export function rssPage(
  user: AdminUser,
  feeds: RssFeed[],
  channels: GuildTextChannel[],
  defaultTemplate: string,
  flash?: string,
  flashKind?: FlashKind,
): string {
  const body = `
    <h1>RSS Feeds</h1>

    <form class="inline" method="post" action="/admin/rss/check" style="margin-bottom:16px;" data-loading-text="Checking…">
      <button type="submit" class="btn-primary">Check now</button>
    </form>

    <h2>Default template</h2>
    <div class="card">
      <form method="post" action="/admin/rss/default-template">
        <label for="defaultTemplate">Used by any feed that doesn't set its own template</label>
        <textarea id="defaultTemplate" name="defaultTemplate" required>${escapeHtml(defaultTemplate)}</textarea>
        <div class="hint">${PLACEHOLDER_HINT}</div>

        <button type="submit" class="btn-primary mt-md">Save default template</button>
      </form>
    </div>

    ${
      feeds.length === 0
        ? `<div class="card empty">No RSS feeds configured yet.</div>`
        : `<div class="table-wrap"><table>
          <thead>
            <tr><th>Name</th><th>Feed URL</th><th>Channel</th><th>Status</th><th>Last posted</th><th></th></tr>
          </thead>
          <tbody>${feeds.map((f) => feedRow(f, channels)).join("")}</tbody>
        </table></div>`
    }

    <h2>Add a feed</h2>
    <div class="card">
      <form method="post" action="/admin/rss">
        <label for="name">Name</label>
        <input type="text" id="name" name="name" placeholder="e.g. Company Blog" required />

        <label for="feedUrl">Feed URL</label>
        <input type="text" id="feedUrl" name="feedUrl" placeholder="https://example.com/feed.xml" required />

        <label for="channelId">Channel</label>
        <select id="channelId" name="channelId" required data-channel-picker>${channelOptions(channels, undefined, "#")}</select>
        <div class="hint">New items from this feed will be posted here. The feed's current items are not backfilled — only items published after adding it are posted.</div>

        <label for="template">Post template (optional)</label>
        <textarea id="template" name="template" placeholder="Uses the default template above"></textarea>
        <div class="hint">${PLACEHOLDER_HINT}</div>

        <button type="submit" class="btn-primary mt-lg">Add feed</button>
      </form>
    </div>
  `;

  return renderAdminPage("RSS Feeds", user, body, flash, flashKind);
}
