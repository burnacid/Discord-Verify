import type { AuditLogEntry } from "@prisma/client";
import { renderAdminPage } from "./layout.js";
import type { AdminUser } from "./layout.js";
import { ICONS, icon } from "./icons.js";
import { AUDIT_CATEGORIES, AUDIT_LOG_RETENTION_DAYS } from "../../../bot/auditLog.js";
import type { AuditCategory } from "../../../bot/auditLog.js";

export interface AuditLogFilters {
  category: AuditCategory | null;
  user: string;
  invalidUser: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Entries are stored as the same Discord-flavoured markdown the audit-log
// channel embed gets. Escape first, then turn the two constructs actually
// used — <@id> mentions and **bold** — back into HTML. Mentions link to the
// Members search and to this page filtered to that user.
function renderMessage(message: string, usernames: Map<string, string>): string {
  return escapeHtml(message)
    .replace(/&lt;@!?(\d{15,25})&gt;/g, (_, id: string) => {
      const name = usernames.get(id);
      const label = name ? `@${escapeHtml(name)}` : id;
      return `<a href="/admin/audit-log?user=${id}" title="${id} — show all entries for this user">${label}</a>`;
    })
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 19).replace("T", " ") + " UTC";
}

function pageLink(filters: AuditLogFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.user && !filters.invalidUser) params.set("user", filters.user);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `/admin/audit-log${qs ? `?${qs}` : ""}`;
}

export function auditLogPage(
  user: AdminUser,
  entries: AuditLogEntry[],
  usernames: Map<string, string>,
  filters: AuditLogFilters,
  page: number,
  totalPages: number,
  total: number,
): string {
  const categoryOptions = [
    `<option value="">All categories</option>`,
    ...Object.entries(AUDIT_CATEGORIES).map(
      ([key, label]) => `<option value="${key}" ${filters.category === key ? "selected" : ""}>${label}</option>`,
    ),
  ].join("");

  const rows = entries
    .map((e) => {
      const label = AUDIT_CATEGORIES[e.category as AuditCategory] ?? e.category;
      return `<tr>
        <td style="white-space:nowrap">${formatDate(e.createdAt)}</td>
        <td><span class="badge badge-unverified">${escapeHtml(label)}</span></td>
        <td>${renderMessage(e.message, usernames)}</td>
      </tr>`;
    })
    .join("");

  const filtered = filters.category !== null || (filters.user !== "" && !filters.invalidUser);

  const pager =
    totalPages > 1
      ? `<div class="actions mt-md">
          ${page > 1 ? `<a class="btn btn-secondary" href="${pageLink(filters, page - 1)}">← Newer</a>` : ""}
          <span class="hint">Page ${page} of ${totalPages}</span>
          ${page < totalPages ? `<a class="btn btn-secondary" href="${pageLink(filters, page + 1)}">Older →</a>` : ""}
        </div>`
      : "";

  const body = `
    <h1>Audit log</h1>
    <form method="get" action="/admin/audit-log" class="search-bar" style="max-width:760px">
      <div class="search-input-wrap">
        ${icon(ICONS.search, 16)}
        <input
          type="search"
          name="user"
          value="${escapeHtml(filters.user)}"
          placeholder="Filter by Discord user ID"
          aria-label="Filter by Discord user ID"
        />
      </div>
      <select name="category" aria-label="Category" style="max-width:200px">${categoryOptions}</select>
      <button type="submit" class="btn-primary">Filter</button>
    </form>

    ${filters.invalidUser ? `<p class="hint" style="margin-bottom:12px;">"${escapeHtml(filters.user)}" isn't a Discord user ID — showing all users.</p>` : ""}
    ${filtered ? `<p class="hint" style="margin-bottom:12px;">${total} matching entr${total === 1 ? "y" : "ies"} &nbsp;<a href="/admin/audit-log">Clear filters</a></p>` : ""}

    ${
      entries.length === 0
        ? `<div class="card empty">${filtered ? "No entries match these filters." : "Nothing has been logged yet."}</div>`
        : `<div class="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Category</th><th>Event</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          ${pager}`
    }
    <p class="hint mt-md">Entries are kept for ${AUDIT_LOG_RETENTION_DAYS} days.</p>
  `;

  return renderAdminPage("Audit log", user, body);
}
