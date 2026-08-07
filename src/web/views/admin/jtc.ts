import { renderAdminPage } from "./layout.js";
import type { AdminUser, FlashKind } from "./layout.js";
import type { JtcTrigger } from "@prisma/client";
import type { GuildVoiceChannel } from "../../../bot/channelLookup.js";
import { channelOptions } from "./channelOptions.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function channelLabel(channelId: string, channels: GuildVoiceChannel[]): string {
  const channel = channels.find((c) => c.id === channelId);
  if (!channel) return `<span class="hint">${escapeHtml(channelId)}</span>`;
  return channel.category
    ? `<span class="hint">${escapeHtml(channel.category)} /</span> ${escapeHtml(channel.name)}`
    : escapeHtml(channel.name);
}

function triggerRow(trigger: JtcTrigger, activeCount: number, channels: GuildVoiceChannel[]): string {
  return `<tr>
    <td>${escapeHtml(trigger.name)}</td>
    <td>${channelLabel(trigger.channelId, channels)}</td>
    <td>${activeCount}</td>
    <td class="actions">
      <form class="inline" method="post" action="/admin/jtc/${trigger.id}/delete">
        <button type="submit" class="btn-deny" onclick="return confirm('Delete this trigger? Already-spawned channels are left running.')">Delete</button>
      </form>
    </td>
  </tr>`;
}

export function jtcPage(
  user: AdminUser,
  triggers: JtcTrigger[],
  activeCounts: number[],
  channels: GuildVoiceChannel[],
  availableChannels: GuildVoiceChannel[],
  flash?: string,
  flashKind?: FlashKind,
): string {
  const body = `
    <h1>Join to Create</h1>
    <p class="hint" style="margin-bottom:16px;">When a member joins a trigger voice channel, a new channel is created in the same category and they're moved into it. It's deleted automatically once it's empty again.</p>

    ${
      triggers.length === 0
        ? `<div class="card empty">No Join to Create triggers configured yet.</div>`
        : `<div class="table-wrap"><table>
          <thead>
            <tr><th>Name</th><th>Trigger channel</th><th>Active channels</th><th></th></tr>
          </thead>
          <tbody>${triggers.map((t, i) => triggerRow(t, activeCounts[i], channels)).join("")}</tbody>
        </table></div>`
    }

    <h2>Add a trigger</h2>
    <div class="card">
      ${
        availableChannels.length === 0
          ? `<p class="hint">No voice channels available — either there are none in the server, or all of them are already triggers.</p>`
          : `<form method="post" action="/admin/jtc">
              <label for="name">Name</label>
              <input type="text" id="name" name="name" placeholder="e.g. Gaming" required />
              <div class="hint">Spawned channels are named "{name} #N", e.g. "Gaming #1".</div>

              <label for="channelId">Trigger channel</label>
              <select id="channelId" name="channelId" required data-channel-picker>${channelOptions(availableChannels)}</select>
              <div class="hint">The voice channel members join to spawn a new channel.</div>

              <button type="submit" class="btn-primary mt-lg">Add trigger</button>
            </form>`
      }
    </div>
  `;

  return renderAdminPage("Join to Create", user, body, flash, flashKind);
}
