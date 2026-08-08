import type { GuildRole } from "../../../bot/channelLookup.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function roleOptions(roles: GuildRole[], selectedId?: string | null): string {
  return roles
    .map((r) => `<option value="${r.id}" ${r.id === selectedId ? "selected" : ""}>@${escapeHtml(r.name)}</option>`)
    .join("");
}
