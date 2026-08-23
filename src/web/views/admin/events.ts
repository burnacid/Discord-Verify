import { renderAdminPage } from "./layout.js";
import type { AdminUser, FlashKind } from "./layout.js";
import type { EventSource, EventCategoryRule } from "@prisma/client";
import type { GuildTextChannel, GuildRole } from "../../../bot/channelLookup.js";
import { DEFAULT_EVENT_MESSAGE_TEMPLATE } from "../../../jobs/eventSync.js";
import { channelOptions } from "./channelOptions.js";
import { roleOptions } from "./roleOptions.js";

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

function categoryFilterLabel(source: EventSource): string {
  if (!source.categoryFilter) return `<span class="hint">— none —</span>`;
  const modeTag = source.categoryFilterMode === "exclude" ? "exclude" : "include";
  return `${escapeHtml(source.categoryFilter)} <span class="hint">(${modeTag})</span>`;
}

// Wraps a group of provider-specific fields so admin.js can show/hide them
// based on the form's current "provider" select value (see the
// [data-provider-fields] handling there).
function providerGroup(provider: "custom" | "tribe", html: string): string {
  return `<div data-provider-fields="${provider}">${html}</div>`;
}

function channelLabel(channelId: string, channels: GuildTextChannel[]): string {
  const channel = channels.find((c) => c.id === channelId);
  if (!channel) return `<span class="hint">${escapeHtml(channelId)}</span>`;
  return channel.category
    ? `<span class="hint">${escapeHtml(channel.category)} /</span> #${escapeHtml(channel.name)}`
    : `#${escapeHtml(channel.name)}`;
}

function roleLabel(roleId: string, roles: GuildRole[]): string {
  const role = roles.find((r) => r.id === roleId);
  return role ? `@${escapeHtml(role.name)}` : `<span class="hint">${escapeHtml(roleId)}</span>`;
}

// The add/delete controls here are plain buttons handled by admin.js via
// fetch, not real <form>s — this whole block renders inside the source's
// edit <form> (right next to the other category settings), and a nested
// <form> there would be invalid HTML that the browser silently drops.
function categoryRulesSection(source: EventSource, rules: EventCategoryRule[], roles: GuildRole[]): string {
  const rows = rules
    .map(
      (rule) => `<tr>
        <td><code>${escapeHtml(rule.categorySlug)}</code></td>
        <td>${roleLabel(rule.mentionRoleId, roles)}</td>
        <td>
          <button type="button" class="btn-deny" data-delete-rule="${rule.id}">Delete</button>
        </td>
      </tr>`,
    )
    .join("");

  return `<div data-rules-panel data-source-id="${source.id}">
    <label>Category role rules</label>
    <div class="hint">Every rule whose category matches an event mentions its role — an event can match several. Falls back to the role above when no rule matches.</div>
    ${
      rules.length > 0
        ? `<div class="table-wrap"><table>
          <thead><tr><th>Category slug</th><th>Role</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`
        : ""
    }
    <div class="inline mt-sm">
      <input type="text" data-rule-category placeholder="e.g. tabletop" />
      <select data-rule-role>
        <option value="">— role —</option>
        ${roleOptions(roles)}
      </select>
      <button type="button" class="btn-secondary" data-add-rule>Add rule</button>
    </div>
  </div>`;
}

function sourceRow(
  source: EventSource,
  activeCount: number,
  channels: GuildTextChannel[],
  roles: GuildRole[],
  rules: EventCategoryRule[],
): string {
  const lastSynced = source.lastSyncedAt
    ? source.lastSyncedAt.toISOString().slice(0, 16).replace("T", " ")
    : "never";

  const messageLabel = source.messageChannelId
    ? channelLabel(source.messageChannelId, channels)
    : `<span class="hint">— off —</span>`;

  const statusBadge = source.lastError
    ? `<span class="badge badge-rejected" title="${escapeHtml(source.lastError)}">error</span>`
    : `<span class="badge ${source.enabled ? "badge-verified" : "badge-unverified"}">${source.enabled ? "enabled" : "disabled"}</span>`;

  return `<div class="card">
    <div class="item-card-header">
      <div class="item-card-title">${escapeHtml(source.name)} <span class="hint">${escapeHtml(providerLabel(source.provider))}</span></div>
      <div class="item-card-actions">
        ${statusBadge}
        <form class="inline" method="post" action="/admin/events/${source.id}/toggle">
          <button type="submit" class="btn-secondary">${source.enabled ? "Disable" : "Enable"}</button>
        </form>
        <form class="inline" method="post" action="/admin/events/${source.id}/clear">
          <button type="submit" class="btn-deny" onclick="return confirm('Clear all ${activeCount} event(s) this source created? The source and its settings stay — the next sync recreates whatever is still legitimately in the feed.')">Clear events</button>
        </form>
        <form class="inline" method="post" action="/admin/events/${source.id}/delete">
          <button type="submit" class="btn-deny" onclick="return confirm('Delete this source? All Discord events and messages it created will be removed too.')">Delete</button>
        </form>
      </div>
    </div>

    <div class="item-card-meta">
      <div><div class="meta-label">API URL</div><code>${escapeHtml(source.apiUrl)}</code></div>
      <div><div class="meta-label">Name filter</div>${nameFilterLabel(source)}</div>
      <div><div class="meta-label">Category filter</div>${categoryFilterLabel(source)}</div>
      <div><div class="meta-label">Message channel</div>${messageLabel}</div>
      <div><div class="meta-label">Active events</div>${activeCount}</div>
      <div><div class="meta-label">Last synced</div>${lastSynced}</div>
    </div>

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

          ${providerGroup(
            "tribe",
            `<label for="categoryFilter-${source.id}">Category filter (optional)</label>
          <input type="text" id="categoryFilter-${source.id}" name="categoryFilter" value="${source.categoryFilter ? escapeHtml(source.categoryFilter) : ""}" placeholder="e.g. tabletop, tournament" />
          <div class="hint">Comma-separated category slugs (as used in the WordPress category URL). Leave blank to sync every category.</div>

          <label for="categoryFilterMode-${source.id}">Category filter mode</label>
          <select id="categoryFilterMode-${source.id}" name="categoryFilterMode">${nameFilterModeOptions(source.categoryFilterMode)}</select>
          <div class="hint">"Include only matches" syncs only events in a category above; "Exclude matches" syncs everything except those. Only matters if a category filter is set.</div>

          <label for="lookaheadDays-${source.id}">Lookahead (days)</label>
          <input type="number" id="lookaheadDays-${source.id}" name="lookaheadDays" min="1" value="${source.lookaheadDays}" />
          <div class="hint">Only events starting within this many days are collected.</div>

          ${categoryRulesSection(source, rules, roles)}`,
          )}
          ${providerGroup(
            "custom",
            `<label for="timezone-${source.id}">Timezone (IANA name)</label>
          <input type="text" id="timezone-${source.id}" name="timezone" value="${escapeHtml(source.timezone)}" />
          <div class="hint">The API's dates have no timezone info, so this is used to resolve them (handles DST automatically).</div>

          <label for="durationMinutes-${source.id}">Default event duration (minutes)</label>
          <input type="number" id="durationMinutes-${source.id}" name="durationMinutes" min="1" value="${source.durationMinutes}" />
          <div class="hint">The API only gives a start time, so this is used to compute the end time.</div>`,
          )}

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
    </div>`;
}

export function eventsPage(
  user: AdminUser,
  sources: EventSource[],
  activeCounts: number[],
  channels: GuildTextChannel[],
  roles: GuildRole[],
  rules: EventCategoryRule[],
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
        : `<div class="card-list">${sources
            .map((s, i) => sourceRow(s, activeCounts[i], channels, roles, rules.filter((r) => r.sourceId === s.id)))
            .join("")}</div>`
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

        ${providerGroup(
          "tribe",
          `<label for="categoryFilter">Category filter (optional)</label>
        <input type="text" id="categoryFilter" name="categoryFilter" placeholder="e.g. tabletop, tournament" />
        <div class="hint">Comma-separated category slugs (as used in the WordPress category URL). Leave blank to sync every category.</div>

        <label for="categoryFilterMode">Category filter mode</label>
        <select id="categoryFilterMode" name="categoryFilterMode">${nameFilterModeOptions("include")}</select>
        <div class="hint">"Include only matches" syncs only events in a category above; "Exclude matches" syncs everything except those. Only matters if a category filter is set.</div>

        <label for="lookaheadDays">Lookahead (days)</label>
        <input type="number" id="lookaheadDays" name="lookaheadDays" min="1" value="7" />
        <div class="hint">Only events starting within this many days are collected.</div>`,
        )}
        ${providerGroup(
          "custom",
          `<label for="timezone">Timezone (IANA name)</label>
        <input type="text" id="timezone" name="timezone" value="Europe/Amsterdam" />
        <div class="hint">The API's dates have no timezone info, so this is used to resolve them (handles DST automatically).</div>

        <label for="durationMinutes">Default event duration (minutes)</label>
        <input type="number" id="durationMinutes" name="durationMinutes" min="1" value="240" />
        <div class="hint">The API only gives a start time, so this is used to compute the end time.</div>`,
        )}

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
