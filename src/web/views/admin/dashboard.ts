import { renderAdminPage } from "./layout.js";
import type { AdminUser, FlashKind } from "./layout.js";
import type { RuntimeSettings } from "../../../runtimeSettings.js";
import type { GuildRole, GuildTextChannel } from "../../../bot/channelLookup.js";
import { channelOptions } from "./channelOptions.js";
import { roleOptions } from "./roleOptions.js";

export interface DashboardStats {
  verified: number;
  pendingReview: number;
  rejected: number;
  unverified: number;
  // % of the live Discord guild member count that's verified — not % of
  // tracked Member rows, so it reflects "how much of the actual server."
  verifiedPercent: number;
}

export interface SystemStatus {
  geoStale: boolean;
  erroringFeeds: number;
  erroringSources: number;
}

export interface PendingReviewRow {
  id: string;
  discordId: string;
  name: string;
  email: string;
  reason: string;
  country: string | null;
  fraudScore: number | null;
  ip: string | null;
  createdAt: Date;
}

export interface PendingVerificationRow {
  discordId: string;
  username: string | null;
  sentAt: Date;
  expiresAt: Date;
  expired: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reviewRow(row: PendingReviewRow): string {
  return `<tr>
    <td>${escapeHtml(row.discordId)}</td>
    <td>${escapeHtml(row.name)}</td>
    <td>${escapeHtml(row.email)}</td>
    <td>${row.reason}</td>
    <td>${row.country ?? "unknown"}</td>
    <td>${row.fraudScore ?? "—"}</td>
    <td>${row.ip ?? "—"}</td>
    <td>${row.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
    <td class="actions">
      <form class="inline" method="post" action="/admin/review/${row.id}/approve">
        <button type="submit" class="btn-approve">Approve</button>
      </form>
      <form method="post" action="/admin/review/${row.id}/deny" class="deny-form">
        <textarea name="note" placeholder="Reason (optional)" rows="1"></textarea>
        <button type="submit" class="btn-deny" onclick="return confirm('Deny and kick (unless admin)?')">Deny</button>
      </form>
    </td>
  </tr>`;
}

function pendingVerificationRow(row: PendingVerificationRow): string {
  return `<tr>
    <td>${escapeHtml(row.discordId)}</td>
    <td>${row.username ? escapeHtml(row.username) : "<span class=\"hint\">not in server</span>"}</td>
    <td>${row.sentAt.toISOString().slice(0, 16).replace("T", " ")}</td>
    <td>${row.expired ? `<span class="badge badge-rejected">expired</span>` : `<span class="badge badge-pending_review">pending</span>`}</td>
    <td class="actions">
      <form class="inline" method="post" action="/admin/pending-verifications/${row.discordId}/resend">
        <button type="submit" class="btn-secondary">Resend link</button>
      </form>
    </td>
  </tr>`;
}

function systemStatusRows(system: SystemStatus): string {
  const rows: string[] = [];
  if (system.geoStale) {
    rows.push(
      `<li>GeoIP data is stale or not loaded — <a href="/admin/geo">check GeoIP / VPN</a>.</li>`,
    );
  }
  if (system.erroringFeeds > 0) {
    rows.push(
      `<li>${system.erroringFeeds} RSS feed${system.erroringFeeds === 1 ? "" : "s"} failing to poll — <a href="/admin/rss">check RSS Feeds</a>.</li>`,
    );
  }
  if (system.erroringSources > 0) {
    rows.push(
      `<li>${system.erroringSources} event source${system.erroringSources === 1 ? "" : "s"} failing to sync — <a href="/admin/events">check Game Day Events</a>.</li>`,
    );
  }
  return rows.length === 0 ? "" : `<ul class="hint" style="margin:0 0 16px;padding-left:18px;">${rows.join("")}</ul>`;
}

export function dashboardPage(
  user: AdminUser,
  stats: DashboardStats,
  pending: PendingReviewRow[],
  pendingVerifications: PendingVerificationRow[],
  settings: RuntimeSettings,
  system: SystemStatus,
  channels: GuildTextChannel[],
  roles: GuildRole[],
  flash?: string,
  flashKind?: FlashKind,
): string {
  const body = `
    <h1>Dashboard</h1>
    <div class="stats">
      <a class="stat" href="/admin/members?status=verified"><div class="value">${stats.verified}</div><div class="label">Verified</div></a>
      <a class="stat" href="/admin/members?status=pending_review"><div class="value">${stats.pendingReview}</div><div class="label">Pending review</div></a>
      <a class="stat" href="/admin/members?status=rejected"><div class="value">${stats.rejected}</div><div class="label">Rejected</div></a>
      <a class="stat" href="/admin/members?status=unverified"><div class="value">${stats.unverified}</div><div class="label">Unverified</div></a>
      <div class="stat"><div class="value">${stats.verifiedPercent}%</div><div class="label">Of server verified</div></div>
    </div>

    <h2>Pending review (${pending.length})</h2>
    ${
      pending.length === 0
        ? `<div class="card empty">Nothing waiting on manual review.</div>`
        : `<div class="table-wrap"><table>
          <thead>
            <tr>
              <th>Discord ID</th><th>Name</th><th>Email</th><th>Reason</th>
              <th>Country</th><th>Fraud score</th><th>IP</th><th>Submitted</th><th></th>
            </tr>
          </thead>
          <tbody>${pending.map(reviewRow).join("")}</tbody>
        </table></div>`
    }

    <h2>Sent but not verified (${pendingVerifications.length}) &nbsp;<a class="hint" href="/admin/members?status=link_pending">View in Members →</a></h2>
    ${
      pendingVerifications.length === 0
        ? `<div class="card empty">Nobody's waiting on a verification link.</div>`
        : `<div class="table-wrap"><table>
          <thead>
            <tr><th>Discord ID</th><th>Username</th><th>Link sent</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>${pendingVerifications.map(pendingVerificationRow).join("")}</tbody>
        </table></div>`
    }

    <h2>Server setup</h2>
    <div class="card">
      <p class="hint" style="margin-bottom:16px;">Required before members can be verified in this server. These used to be <code>.env</code> values — now configured per server here.</p>
      <form method="post" action="/admin/server-setup">
        <label for="verifiedRoleId">Verified role</label>
        <select id="verifiedRoleId" name="verifiedRoleId" data-channel-picker>
          <option value="">— none —</option>
          ${roleOptions(roles, settings.verifiedRoleId)}
        </select>
        <div class="hint">Granted on successful verification. Required — nothing works without this set.</div>

        <label for="startHereChannelId">Start-here channel (optional)</label>
        <select id="startHereChannelId" name="startHereChannelId" data-channel-picker>
          <option value="">— none —</option>
          ${channelOptions(channels, settings.startHereChannelId, "#")}
        </select>
        <div class="hint">Fallback message channel for members whose DMs are closed and can't receive a join link.</div>

        <label for="modReviewChannelId">Mod-review channel (optional)</label>
        <select id="modReviewChannelId" name="modReviewChannelId" data-channel-picker>
          <option value="">— none —</option>
          ${channelOptions(channels, settings.modReviewChannelId, "#")}
        </select>
        <div class="hint">Approve/Deny embeds for members routed to manual review are posted here.</div>

        <label for="auditLogChannelId">Audit-log channel (optional)</label>
        <select id="auditLogChannelId" name="auditLogChannelId" data-channel-picker>
          <option value="">— none —</option>
          ${channelOptions(channels, settings.auditLogChannelId, "#")}
        </select>
        <div class="hint">Permanent read-only record of every verify/unverify/approve/deny decision.</div>

        <button type="submit" class="btn-primary mt-lg">Save server setup</button>
      </form>
    </div>

    <h2>Verification settings</h2>
    <div class="card">
      <form method="post" action="/admin/settings">
        <label for="allowedCountries">Allowed countries (comma-separated ISO codes)</label>
        <input type="text" id="allowedCountries" name="allowedCountries" value="${escapeHtml(settings.allowedCountries.join(", "))}" />
        <div class="hint">e.g. <code>NL, BE, DE</code> — members from these countries auto-verify when not on a VPN.</div>

        <label for="maxFraudScore">Max fraud score (0–100)</label>
        <input type="number" id="maxFraudScore" name="maxFraudScore" min="0" max="100" value="${settings.maxFraudScore}" />
        <div class="hint">IPQualityScore risk threshold — above this, or any VPN/proxy detection, routes to manual review.</div>

        <div class="checkbox-row">
          <input type="checkbox" id="sendJoinDm" name="sendJoinDm" ${settings.sendJoinDm ? "checked" : ""} />
          <label for="sendJoinDm">DM new members a verification link automatically on join</label>
        </div>

        <button type="submit" class="btn-primary mt-lg">Save settings</button>
      </form>
    </div>

    <h2>System</h2>
    <div class="card">
      ${systemStatusRows(system)}
      <p style="margin-bottom:14px;">Restarts the bot and web server (via the process manager's auto-restart).
      Briefly interrupts verification and takes the bot offline for a few seconds.</p>
      <form method="post" action="/admin/restart">
        <button type="submit" class="btn-deny" onclick="return confirm('Restart the bot and web server now?')">Restart bot</button>
      </form>
    </div>
  `;

  return renderAdminPage("Dashboard", user, body, flash, flashKind);
}
