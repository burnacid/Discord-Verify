import { renderAdminPage } from "./layout.js";
import type { AdminUser } from "./layout.js";
import type { JtcTrigger } from "@prisma/client";
import type { GuildVoiceChannel } from "../../../bot/channelLookup.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function channelOptions(channels: GuildVoiceChannel[]): string {
  return channels.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
}

function triggerRow(trigger: JtcTrigger, activeCount: number, channels: GuildVoiceChannel[]): string {
  const channel = channels.find((c) => c.id === trigger.channelId);
  const channelLabel = channel ? escapeHtml(channel.name) : `<span class="hint">${escapeHtml(trigger.channelId)}</span>`;

  return `<tr>
    <td>${escapeHtml(trigger.name)}</td>
    <td>${channelLabel}</td>
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
): string {
  const body = `
    <h1>Join to Create</h1>
    <p class="hint" style="margin-bottom:16px;">When a member joins a trigger voice channel, a new channel is created in the same category and they're moved into it. It's deleted automatically once it's empty again.</p>

    ${
      triggers.length === 0
        ? `<div class="card empty">No Join to Create triggers configured yet.</div>`
        : `<table>
          <thead>
            <tr><th>Name</th><th>Trigger channel</th><th>Active channels</th><th></th></tr>
          </thead>
          <tbody>${triggers.map((t, i) => triggerRow(t, activeCounts[i], channels)).join("")}</tbody>
        </table>`
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
              <select id="channelId" name="channelId" required>${channelOptions(availableChannels)}</select>
              <div class="hint">The voice channel members join to spawn a new channel.</div>

              <button type="submit" class="btn-primary" style="margin-top:20px;">Add trigger</button>
            </form>`
      }
    </div>
  `;

  return renderAdminPage("Join to Create", user, body, flash);
}
