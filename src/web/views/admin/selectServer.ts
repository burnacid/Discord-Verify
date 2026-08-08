import { renderAdminPage } from "./layout.js";
import type { AdminUser } from "./layout.js";
import type { AdminGuild } from "../../admin/guildAccess.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function selectServerPage(
  user: AdminUser,
  guilds: AdminGuild[],
  currentGuildId: string | undefined,
  inviteUrl: string,
): string {
  const body = `
    <h1>Choose a server</h1>
    <p class="hint" style="margin-bottom:16px;">Pick which server you want to manage from the admin panel.</p>
    <div class="stats">
      ${guilds
        .map(
          (g) => `
        <form method="post" action="/admin/select-server">
          <input type="hidden" name="guildId" value="${g.id}" />
          <button type="submit" class="stat" style="width:100%; border:none; cursor:pointer; font:inherit; text-align:left;">
            <div class="value">${escapeHtml(g.name)}</div>
            <div class="label">${g.id === currentGuildId ? "Currently managing" : "Manage this server"}</div>
          </button>
        </form>`,
        )
        .join("")}
    </div>

    <h2>Add another server</h2>
    <div class="card">
      <p class="hint" style="margin-bottom:16px;">Invite this bot to a different server you administer — it'll show up in the list above once it's in.</p>
      <a class="btn btn-primary" href="${inviteUrl}" target="_blank" rel="noopener">Add to a server</a>
    </div>
  `;

  return renderAdminPage("Choose a server", user, body);
}
