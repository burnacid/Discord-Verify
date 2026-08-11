import { renderAdminPage } from "./layout.js";
import type { AdminUser, FlashKind } from "./layout.js";
import { ICONS, icon } from "./icons.js";

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
      <form class="inline" method="post" action="/admin/members/${row.discordId}/send-verify-link">
        <button type="submit" class="btn-secondary" onclick="return confirm('Send a verification link to this member?')">Send link</button>
      </form>
    </td>
  </tr>`;
}

export function membersPage(
  user: AdminUser,
  query: string,
  results: MemberRow[],
  flash?: string,
  statusFilter: string | null = null,
  page = 1,
  totalPages = 1,
  flashKind?: FlashKind,
): string {
  const showResults = statusFilter !== null || query !== "";
  const emptyMessage = statusFilter ? `No members with status "${statusFilter}".` : "No matching members found.";

  const pager =
    statusFilter && totalPages > 1
      ? `<div class="actions mt-md">
          ${
            page > 1
              ? `<a class="btn btn-secondary" href="/admin/members?status=${statusFilter}&page=${page - 1}">← Prev</a>`
              : ""
          }
          <span class="hint">Page ${page} of ${totalPages}</span>
          ${
            page < totalPages
              ? `<a class="btn btn-secondary" href="/admin/members?status=${statusFilter}&page=${page + 1}">Next →</a>`
              : ""
          }
        </div>`
      : "";

  const body = `
    <h1>Members</h1>
    <form method="get" action="/admin/members" class="search-bar">
      <div class="search-input-wrap">
        ${icon(ICONS.search, 16)}
        <input
          type="search"
          id="q"
          name="q"
          value="${escapeHtml(query)}"
          placeholder="Search by Discord ID or username"
          aria-label="Search by Discord ID or username"
        />
      </div>
      <button type="submit" class="btn-primary">Search</button>
    </form>

    ${
      statusFilter
        ? `<p class="hint" style="margin-bottom:12px;">Filtering by status: <span class="badge badge-${statusFilter}">${statusFilter}</span> &nbsp;<a href="/admin/members">Clear filter</a></p>`
        : ""
    }

    ${
      !showResults
        ? ""
        : results.length === 0
          ? `<div class="card empty">${emptyMessage}</div>`
          : `<div class="table-wrap">
            <table>
              <thead>
                <tr><th>Discord ID</th><th>Username</th><th>Status</th><th>Country</th><th>Last IP</th><th>Verified at</th><th></th></tr>
              </thead>
              <tbody>${results.map(memberRow).join("")}</tbody>
            </table>
          </div>
          ${pager}`
    }
  `;

  return renderAdminPage("Members", user, body, flash, flashKind);
}
