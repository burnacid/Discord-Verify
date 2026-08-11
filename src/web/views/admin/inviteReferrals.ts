import { renderAdminPage } from "./layout.js";
import type { AdminUser } from "./layout.js";

export interface InviteReferralRow {
  ref: string;
  hits: number;
  lastSeenAt: Date;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function referralRow(row: InviteReferralRow): string {
  return `<tr>
    <td>${escapeHtml(row.ref)}</td>
    <td>${row.hits.toLocaleString()}</td>
    <td>${formatDate(row.lastSeenAt)}</td>
  </tr>`;
}

export function inviteReferralsPage(user: AdminUser, rows: InviteReferralRow[], total: number): string {
  const body = `
    <h1>Invite referrals</h1>
    <p class="hint" style="margin-bottom:16px;">
      Tracks visits to the join page that included a <code>?ref=</code> query param, e.g.
      <code>/join/&lt;guildId&gt;?ref=twitter</code> — use different ref values per link to see
      which sources drive people to join.
    </p>

    <div class="stats" style="margin-bottom:24px;">
      <div class="stat"><div class="value">${total.toLocaleString()}</div><div class="label">Total tracked visits</div></div>
      <div class="stat"><div class="value">${rows.length.toLocaleString()}</div><div class="label">Distinct sources</div></div>
    </div>

    ${
      rows.length === 0
        ? `<div class="card empty">No tracked referrals yet — share a join link with a <code>?ref=</code> param to start seeing data here.</div>`
        : `<div class="table-wrap">
            <table>
              <thead>
                <tr><th>Source (ref)</th><th>Visits</th><th>Last seen</th></tr>
              </thead>
              <tbody>${rows.map(referralRow).join("")}</tbody>
            </table>
          </div>`
    }
  `;

  return renderAdminPage("Invite referrals", user, body);
}
