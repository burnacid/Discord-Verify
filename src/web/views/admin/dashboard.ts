import { renderAdminPage } from "./layout.js";
import type { AdminUser } from "./layout.js";
import type { RuntimeSettings } from "../../../runtimeSettings.js";

export interface DashboardStats {
  verified: number;
  pendingReview: number;
  rejected: number;
  unverified: number;
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
      <form class="inline" method="post" action="/admin/review/${row.id}/deny">
        <button type="submit" class="btn-deny" onclick="return confirm('Deny and kick (unless admin)?')">Deny</button>
      </form>
    </td>
  </tr>`;
}

export function dashboardPage(
  user: AdminUser,
  stats: DashboardStats,
  pending: PendingReviewRow[],
  settings: RuntimeSettings,
  flash?: string,
): string {
  const body = `
    <h1>Dashboard</h1>
    <div class="stats">
      <a class="stat" href="/admin/members?status=verified"><div class="value">${stats.verified}</div><div class="label">Verified</div></a>
      <a class="stat" href="/admin/members?status=pending_review"><div class="value">${stats.pendingReview}</div><div class="label">Pending review</div></a>
      <a class="stat" href="/admin/members?status=rejected"><div class="value">${stats.rejected}</div><div class="label">Rejected</div></a>
      <a class="stat" href="/admin/members?status=unverified"><div class="value">${stats.unverified}</div><div class="label">Unverified</div></a>
    </div>

    <h2>Pending review (${pending.length})</h2>
    ${
      pending.length === 0
        ? `<div class="card empty">Nothing waiting on manual review.</div>`
        : `<table>
          <thead>
            <tr>
              <th>Discord ID</th><th>Name</th><th>Email</th><th>Reason</th>
              <th>Country</th><th>Fraud score</th><th>IP</th><th>Submitted</th><th></th>
            </tr>
          </thead>
          <tbody>${pending.map(reviewRow).join("")}</tbody>
        </table>`
    }

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

        <button type="submit" class="btn-primary" style="margin-top:20px;">Save settings</button>
      </form>
    </div>

    <h2>System</h2>
    <div class="card">
      <p style="margin-bottom:14px;">Restarts the bot and web server (via the process manager's auto-restart).
      Briefly interrupts verification and takes the bot offline for a few seconds.</p>
      <form method="post" action="/admin/restart">
        <button type="submit" class="btn-deny" onclick="return confirm('Restart the bot and web server now?')">Restart bot</button>
      </form>
    </div>
  `;

  return renderAdminPage("Dashboard", user, body, flash);
}
