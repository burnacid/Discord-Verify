import { renderAdminPage } from "./layout.js";
import type { AdminUser, FlashKind } from "./layout.js";
import type { EventSource } from "@prisma/client";
import type { GuildTextChannel, GuildRole } from "../../../bot/channelLookup.js";
import { DEFAULT_EVENT_MESSAGE_TEMPLATE } from "../../../jobs/eventSync.js";
import { channelOptions } from "./channelOptions.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PROVIDERS: { value: string; label: string }[] = [
  { value: "custom", label: "Custom JSON API" },
  { value: "tribe", label: "WordPress: The Events Calendar" },
];

function providerLabel(value: string): string {
  return PROVIDERS.find((p) => p.value === value)?.label ?? value;
}

function providerOptions(selected: string): string {
  return PROVIDERS.map(
    (p) => `<option value="${p.value}" ${p.value === selected ? "selected" : ""}>${escapeHtml(p.label)}</option>`,
  ).join("");
}

const NAME_FILTER_MODES: { value: string; label: string }[] = [
  { value: "include", label: "Include only matches" },
  { value: "exclude", label: "Exclude matches" },
];

function nameFilterModeOptions(selected: string): string {
  return NAME_FILTER_MODES.map(
    (m) => `<option value="${m.value}" ${m.value === selected ? "selected" : ""}>${escapeHtml(m.label)}</option>`,
  ).join("");
}

function nameFilterLabel(source: EventSource): string {
  if (!source.nameFilter) return `<span class="hint">— none —</span>`;
  const modeTag = source.nameFilterMode === "exclude" ? "exclude" : "include";
  return `${escapeHtml(source.nameFilter)} <span class="hint">(${modeTag})</span>`;
}

function channelLabel(channelId: string, channels: GuildTextChannel[]): string {
  const channel = channels.find((c) => c.id === channelId);
  if (!channel) return `<span class="hint">${escapeHtml(channelId)}</span>`;
  return channel.category
    ? `<span class="hint">${escapeHtml(channel.category)} /</span> #${escapeHtml(channel.name)}`
    : `#${escapeHtml(channel.name)}`;
}

function roleOptions(roles: GuildRole[], selectedId?: string | null): string {
  return roles
    .map((r) => `<option value="${r.id}" ${r.id === selectedId ? "selected" : ""}>@${escapeHtml(r.name)}</option>`)
    .join("");
}

function sourceRow(source: EventSource, activeCount: number, channels: GuildTextChannel[], roles: GuildRole[]): string {
  const lastSynced = source.lastSyncedAt
    ? source.lastSyncedAt.toISOString().slice(0, 16).replace("T", " ")
    : "never";

  const messageLabel = source.messageChannelId
    ? channelLabel(source.messageChannelId, channels)
    : `<span class="hint">— off —</span>`;

  return `<tr>
    <td>${escapeHtml(source.name)}</td>
    <td>${escapeHtml(providerLabel(source.provider))}</td>
    <td><code>${escapeHtml(source.apiUrl)}</code></td>
    <td>${nameFilterLabel(source)}</td>
    <td>${messageLabel}</td>
    <td><span class="badge ${source.enabled ? "badge-verified" : "badge-unverified"}">${source.enabled ? "enabled" : "disabled"}</span></td>
    <td>${activeCount}</td>
    <td>${lastSynced}</td>
    <td class="actions">
      <form class="inline" method="post" action="/admin/events/${source.id}/toggle">
        <button type="submit" class="btn-secondary">${source.enabled ? "Disable" : "Enable"}</button>
      </form>
      <form class="inline" method="post" action="/admin/events/${source.id}/delete">
        <button type="submit" class="btn-deny" onclick="return confirm('Delete this source? All Discord events and messages it created will be removed too.')">Delete</button>
      </form>
    </td>
  </tr>
  <tr>
    <td colspan="9">
      <details>
        <summary class="hint">Edit</summary>
        <form method="post" action="/admin/events/${source.id}/edit" class="mt-sm">
          <label for="name-${source.id}">Name</label>
          <input type="text" id="name-${source.id}" name="name" value="${escapeHtml(source.name)}" />

          <label for="provider-${source.id}">Provider</label>
          <select id="provider-${source.id}" name="provider">${providerOptions(source.provider)}</select>

          <label for="apiUrl-${source.id}">API URL</label>
          <input type="text" id="apiUrl-${source.id}" name="apiUrl" value="${escapeHtml(source.apiUrl)}" />

          <label for="nameFilter-${source.id}">Name filter (optional)</label>
          <input type="text" id="nameFilter-${source.id}" name="nameFilter" value="${source.nameFilter ? escapeHtml(source.nameFilter) : ""}" placeholder="e.g. Magic, Pokemon, D&D" />
          <div class="hint">Comma-separated keywords. Leave blank to sync everything.</div>

          <label for="nameFilterMode-${source.id}">Name filter mode</label>
          <select id="nameFilterMode-${source.id}" name="nameFilterMode">${nameFilterModeOptions(source.nameFilterMode)}</select>
          <div class="hint">"Include only matches" syncs only events whose title contains a keyword above; "Exclude matches" syncs everything except those. Only matters if a name filter is set.</div>

          <label for="timezone-${source.id}">Timezone (IANA name)</label>
          <input type="text" id="timezone-${source.id}" name="timezone" value="${escapeHtml(source.timezone)}" />
          <div class="hint">Ignored for "The Events Calendar" sources — they already provide UTC times.</div>

          <label for="durationMinutes-${source.id}">Default event duration (minutes)</label>
          <input type="number" id="durationMinutes-${source.id}" name="durationMinutes" min="1" value="${source.durationMinutes}" />
          <div class="hint">Ignored for "The Events Calendar" sources — they already provide an end time.</div>

          <label for="lookaheadDays-${source.id}">Lookahead (days)</label>
          <input type="number" id="lookaheadDays-${source.id}" name="lookaheadDays" min="1" value="${source.lookaheadDays}" />
          <div class="hint">Only used for "The Events Calendar" sources — only events starting within this many days are collected.</div>

          <label for="messageChannelId-${source.id}">Post a message per event to</label>
          <select id="messageChannelId-${source.id}" name="messageChannelId" data-channel-picker>
            <option value="">— off —</option>
            ${channelOptions(channels, source.messageChannelId, "#")}
          </select>
          <div class="hint">Not every source needs this — leave as "— off —" to only create the Discord scheduled event.</div>

          <label for="messageTemplate-${source.id}">Embed description</label>
          <textarea id="messageTemplate-${source.id}" name="messageTemplate">${escapeHtml(source.messageTemplate)}</textarea>
          <div class="hint">Placeholders: <code>{{name}}</code> <code>{{description}}</code> <code>{{location}}</code> <code>{{date}}</code> <code>{{url}}</code>. Posted as an embed (title links to the event, with Time/Location/Reservation Link fields). Updated if the event changes, removed when cancelled or done.</div>

          <label for="mentionRoleId-${source.id}">Mention a role on new events</label>
          <select id="mentionRoleId-${source.id}" name="mentionRoleId">
            <option value="">— none —</option>
            ${roleOptions(roles, source.mentionRoleId)}
          </select>
          <div class="hint">Only pinged when a message is first posted for an event, never on later updates.</div>

          <button type="submit" class="btn-primary mt-md">Save</button>
        </form>
      </details>
    </td>
  </tr>`;
}

export function eventsPage(
  user: AdminUser,
  sources: EventSource[],
  activeCounts: number[],
  channels: GuildTextChannel[],
  roles: GuildRole[],
  flash?: string,
  flashKind?: FlashKind,
): string {
  const body = `
    <h1>Game Day Events</h1>
    <p class="hint" style="margin-bottom:16px;">Polls one or more APIs for upcoming game days/events and creates matching Discord scheduled events. Events are kept in sync (updated on change, removed if cancelled/done) and checked every 5 minutes.</p>

    <form class="inline" method="post" action="/admin/events/check" style="margin-bottom:16px;" data-loading-text="Checking…">
      <button type="submit" class="btn-primary">Check now</button>
    </form>

    ${
      sources.length === 0
        ? `<div class="card empty">No event sources configured yet.</div>`
        : `<div class="table-wrap"><table>
          <thead>
            <tr><th>Name</th><th>Provider</th><th>API URL</th><th>Name filter</th><th>Message channel</th><th>Status</th><th>Active events</th><th>Last synced</th><th></th></tr>
          </thead>
          <tbody>${sources.map((s, i) => sourceRow(s, activeCounts[i], channels, roles)).join("")}</tbody>
        </table></div>`
    }

    <h2>Add a source</h2>
    <div class="card">
      <form method="post" action="/admin/events">
        <label for="name">Name</label>
        <input type="text" id="name" name="name" placeholder="e.g. GameForce Game Days" required />

        <label for="provider">Provider</label>
        <select id="provider" name="provider">${providerOptions("custom")}</select>
        <div class="hint">
          <strong>Custom JSON API</strong>: a plain JSON array with <code>id</code>, <code>date</code> ("YYYY-MM-DD HH:mm:ss"), <code>name</code>, <code>description</code>, <code>location</code>, <code>url</code> fields.
          <strong>The Events Calendar</strong>: point this at a WordPress site's <code>/wp-json/tribe/events/v1/events</code> endpoint.
        </div>

        <label for="apiUrl">API URL</label>
        <input type="text" id="apiUrl" name="apiUrl" placeholder="https://example.com/api/gamedays" required />

        <label for="nameFilter">Name filter (optional)</label>
        <input type="text" id="nameFilter" name="nameFilter" placeholder="e.g. Magic, Pokemon, D&D" />
        <div class="hint">Comma-separated keywords. Leave blank to sync everything.</div>

        <label for="nameFilterMode">Name filter mode</label>
        <select id="nameFilterMode" name="nameFilterMode">${nameFilterModeOptions("include")}</select>
        <div class="hint">"Include only matches" syncs only events whose title contains a keyword above; "Exclude matches" syncs everything except those. Only matters if a name filter is set.</div>

        <label for="timezone">Timezone (IANA name)</label>
        <input type="text" id="timezone" name="timezone" value="Europe/Amsterdam" required />
        <div class="hint">Only used for the Custom JSON API provider, whose dates have no timezone info (handles DST automatically). Ignored for The Events Calendar.</div>

        <label for="durationMinutes">Default event duration (minutes)</label>
        <input type="number" id="durationMinutes" name="durationMinutes" min="1" value="240" required />
        <div class="hint">Only used for the Custom JSON API provider, which only gives a start time. Ignored for The Events Calendar.</div>

        <label for="lookaheadDays">Lookahead (days)</label>
        <input type="number" id="lookaheadDays" name="lookaheadDays" min="1" value="7" required />
        <div class="hint">Only used for The Events Calendar provider — only events starting within this many days are collected. Ignored for the Custom JSON API.</div>

        <label for="messageChannelId">Post a message per event to</label>
        <select id="messageChannelId" name="messageChannelId" data-channel-picker>
          <option value="">— off —</option>
          ${channelOptions(channels, undefined, "#")}
        </select>
        <div class="hint">Not every source needs this — leave as "— off —" to only create the Discord scheduled event.</div>

        <label for="messageTemplate">Embed description</label>
        <textarea id="messageTemplate" name="messageTemplate" required>${escapeHtml(DEFAULT_EVENT_MESSAGE_TEMPLATE)}</textarea>
        <div class="hint">Placeholders: <code>{{name}}</code> <code>{{description}}</code> <code>{{location}}</code> <code>{{date}}</code> <code>{{url}}</code>. Posted as an embed (title links to the event, with Time/Location/Reservation Link fields). Updated if the event changes, removed when cancelled or done.</div>

        <label for="mentionRoleId">Mention a role on new events</label>
        <select id="mentionRoleId" name="mentionRoleId">
          <option value="">— none —</option>
          ${roleOptions(roles)}
        </select>
        <div class="hint">Only pinged when a message is first posted for an event, never on later updates.</div>

        <button type="submit" class="btn-primary mt-lg">Add source</button>
      </form>
    </div>
  `;

  return renderAdminPage("Game Day Events", user, body, flash, flashKind);
}
