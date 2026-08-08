import { adminModules } from "../../admin/moduleRegistry.js";
import { ICONS, icon } from "./icons.js";

export interface AdminUser {
  discordId: string;
  username: string;
}

export type FlashKind = "success" | "error" | "warning";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function navLink(href: string, label: string, iconPaths: string, external = false): string {
  const attrs = external ? ' target="_blank" rel="noopener"' : "";
  return `<a class="nav-link" href="${href}"${attrs}>${icon(iconPaths)}<span>${label}</span></a>`;
}

export function renderAdminPage(
  title: string,
  user: AdminUser,
  bodyHtml: string,
  flash?: string,
  flashKind: FlashKind = "success",
): string {
  const flashClass = flashKind === "error" ? "flash-error" : flashKind === "warning" ? "flash-warning" : "flash";
  const initial = user.username.trim().charAt(0).toUpperCase() || "?";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${title} — Admin</title>
    <link rel="stylesheet" href="/assets/theme.css" />
    <script src="/assets/admin.js" defer></script>
  </head>
  <body class="admin">
    <div class="admin-shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand">
          <span class="brand-mark">DV</span>
          <span class="brand-text">Discord Verify</span>
        </div>
        <nav class="sidebar-nav" id="primaryNav">
          <div class="nav-group">
            ${navLink("/admin", "Dashboard", ICONS.dashboard)}
            ${navLink("/admin/members", "Members", ICONS.users)}
          </div>
          ${
            adminModules.length > 0
              ? `<div class="nav-label">Modules</div>
                 <div class="nav-group">${adminModules.map((m) => navLink(m.navPath, escapeHtml(m.label), m.icon)).join("")}</div>`
              : ""
          }
          <div class="nav-group nav-group-bottom">
            ${navLink("/admin/select-server", "Switch server", ICONS.globe)}
            ${navLink("/health", "Health", ICONS.activity, true)}
          </div>
        </nav>
      </aside>
      <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
      <div class="admin-main">
        <header class="topbar">
          <button class="nav-toggle" id="navToggle" type="button" aria-expanded="false" aria-controls="sidebar" aria-label="Toggle menu">
            <span></span><span></span><span></span>
          </button>
          <div class="topbar-spacer"></div>
          <div class="account-chip">
            <span class="avatar">${escapeHtml(initial)}</span>
            <span class="user">${escapeHtml(user.username)}</span>
            <a href="/admin/logout" class="icon-btn" title="Log out" aria-label="Log out">${icon(ICONS.logout)}</a>
          </div>
        </header>
        <main>
          ${flash ? `<div class="${flashClass}" role="status" aria-live="polite">${flash}</div>` : ""}
          ${bodyHtml}
        </main>
      </div>
    </div>
  </body>
</html>`;
}
