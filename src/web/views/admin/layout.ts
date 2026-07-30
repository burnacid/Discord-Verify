import { adminModules } from "../../admin/moduleRegistry.js";

export interface AdminUser {
  discordId: string;
  username: string;
}

export type FlashKind = "success" | "error" | "warning";

export function renderAdminPage(
  title: string,
  user: AdminUser,
  bodyHtml: string,
  flash?: string,
  flashKind: FlashKind = "success",
): string {
  const flashClass = flashKind === "error" ? "flash-error" : flashKind === "warning" ? "flash-warning" : "flash";

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
  <body>
    <header>
      <div class="brand">Discord Verify — Admin</div>
      <button class="nav-toggle" id="navToggle" type="button" aria-expanded="false" aria-controls="primaryNav" aria-label="Toggle menu">
        <span></span><span></span><span></span>
      </button>
      <nav id="primaryNav">
        <div class="nav-links">
          <a href="/admin">Dashboard</a>
          <a href="/admin/members">Members</a>
          ${adminModules.map((m) => `<a href="${m.navPath}">${m.label}</a>`).join("")}
          <a href="/health" target="_blank" rel="noopener">Health</a>
        </div>
        <div class="nav-account">
          <span class="user">${user.username}</span>
          <a href="/admin/logout">Log out</a>
        </div>
      </nav>
    </header>
    <main>
      ${flash ? `<div class="${flashClass}" role="status" aria-live="polite">${flash}</div>` : ""}
      ${bodyHtml}
    </main>
  </body>
</html>`;
}
