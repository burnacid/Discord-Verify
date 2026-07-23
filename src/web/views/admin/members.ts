import { renderAdminPage } from "./layout.js";
import type { AdminUser } from "./layout.js";

export interface MemberRow {
  discordId: string;
  username: string | null;
  status: string;
  country: string | null;
  lastIp: string | null;
  verifiedAt: Date | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function memberRow(row: MemberRow): string {
  const isVerified = row.status === "verified";
  return `<tr>
    <td>${escapeHtml(row.discordId)}</td>
    <td>${row.username ? escapeHtml(row.username) : "<span class=\"hint\">not in server</span>"}</td>
    <td><span class="badge badge-${row.status}">${row.status}</span></td>
    <td>${row.country ?? "—"}</td>
    <td>${row.lastIp ?? "—"}</td>
    <td>${row.verifiedAt ? row.verifiedAt.toISOString().slice(0, 16).replace("T", " ") : "—"}</td>
    <td class="actions">
      ${
        isVerified
          ? `<form class="inline" method="post" action="/admin/members/${row.discordId}/unverify">
              <button type="submit" class="btn-deny" onclick="return confirm('Unverify this member?')">Unverify</button>
            </form>`
          : `<form class="inline" method="post" action="/admin/members/${row.discordId}/verify">
              <button type="submit" class="btn-approve">Verify</button>
            </form>`
      }
    </td>
  </tr>`;
}

export function membersPage(
  user: AdminUser,
  query: string,
  results: MemberRow[],
  flash?: string,
): string {
  const body = `
    <h1>Members</h1>
    <form method="get" action="/admin/members" style="margin-bottom: 20px;">
      <label for="q">Search by Discord ID or username</label>
      <input type="search" id="q" name="q" value="${escapeHtml(query)}" placeholder="e.g. 123456789012345678 or a username" />
      <button type="submit" class="btn-primary" style="margin-top:12px;">Search</button>
    </form>

    ${
      query === ""
        ? ""
        : results.length === 0
          ? `<div class="card empty">No matching members found.</div>`
          : `<table>
            <thead>
              <tr><th>Discord ID</th><th>Username</th><th>Status</th><th>Country</th><th>Last IP</th><th>Verified at</th><th></th></tr>
            </thead>
            <tbody>${results.map(memberRow).join("")}</tbody>
          </table>`
    }
  `;

  return renderAdminPage("Members", user, body, flash);
}
