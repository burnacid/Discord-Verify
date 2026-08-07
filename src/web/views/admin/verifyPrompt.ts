import { renderAdminPage } from "./layout.js";
import type { AdminUser, FlashKind } from "./layout.js";
import type { VerifyPromptSettingsView } from "../../../bot/verifyPrompt.js";
import type { GuildTextChannel } from "../../../bot/channelLookup.js";
import { channelOptions } from "./channelOptions.js";

export function verifyPromptPage(
  user: AdminUser,
  settings: VerifyPromptSettingsView,
  channels: GuildTextChannel[],
  flash?: string,
  flashKind?: FlashKind,
): string {
  const body = `
    <h1>Verify on Post</h1>
    <p class="hint" style="margin-bottom:16px;">When a member who isn't verified yet posts in the chosen channel, they're sent a verification link by DM (their existing link if they already have one, e.g. from joining). If their DMs are closed, the link is posted as a reply in that channel instead. Throttled to once per 10 minutes per member, so posting several messages in a row won't re-send it every time.</p>

    <div class="card">
      <form method="post" action="/admin/verify-prompt">
        <div class="checkbox-row">
          <input type="checkbox" id="enabled" name="enabled" ${settings.enabled ? "checked" : ""} />
          <label for="enabled">Enabled</label>
        </div>

        <label for="channelId">Trigger channel</label>
        <select id="channelId" name="channelId" data-channel-picker>
          <option value="">— none —</option>
          ${channelOptions(channels, settings.channelId, "#")}
        </select>
        <div class="hint">Every not-yet-verified member who posts here gets a verification link sent automatically (at most once per 10 minutes).</div>

        <button type="submit" class="btn-primary mt-lg">Save</button>
      </form>
    </div>
  `;

  return renderAdminPage("Verify on Post", user, body, flash, flashKind);
}
