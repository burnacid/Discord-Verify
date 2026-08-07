import { renderAdminPage } from "./layout.js";
import type { AdminUser, FlashKind } from "./layout.js";
import type { WelcomeSettingsView } from "../../../bot/welcomeMessage.js";
import type { GuildTextChannel } from "../../../bot/channelLookup.js";
import { channelOptions } from "./channelOptions.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PLACEHOLDER_HINT =
  "Placeholders: <code>{{mention}}</code> <code>{{username}}</code> <code>{{servername}}</code> <code>{{memberCount}}</code>. " +
  "Mention a channel with <code>#channel-name</code> (must match the channel's real name).";

export function welcomePage(
  user: AdminUser,
  settings: WelcomeSettingsView,
  channels: GuildTextChannel[],
  flash?: string,
  flashKind?: FlashKind,
): string {
  const body = `
    <h1>Welcome Message</h1>
    <p class="hint" style="margin-bottom:16px;">Posts to the chosen channel as soon as a new member joins the server, regardless of verification status.</p>

    <div class="card">
      <form method="post" action="/admin/welcome">
        <div class="checkbox-row">
          <input type="checkbox" id="enabled" name="enabled" ${settings.enabled ? "checked" : ""} />
          <label for="enabled">Enabled</label>
        </div>

        <label for="channelId">Channel</label>
        <select id="channelId" name="channelId" data-channel-picker>
          <option value="">— none —</option>
          ${channelOptions(channels, settings.channelId, "#")}
        </select>

        <label for="template">Message template</label>
        <textarea id="template" name="template" required>${escapeHtml(settings.template)}</textarea>
        <div class="hint">${PLACEHOLDER_HINT}</div>

        <button type="submit" class="btn-primary mt-lg">Save</button>
      </form>
    </div>

    <form method="post" action="/admin/welcome/test" class="mt-md" data-loading-text="Sending…">
      <button type="submit" class="btn-secondary">Send test message</button>
    </form>
  `;

  return renderAdminPage("Welcome Message", user, body, flash, flashKind);
}
