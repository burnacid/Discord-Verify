import type { GuildTextChannel } from "../../../bot/channelLookup.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Renders <option>s for a channel-picking <select data-channel-picker>,
// grouped into <optgroup>s by category (uncategorized channels first as
// plain options) to match Discord's own channel list — the channels
// themselves already come out of fetchGuildTextChannels/
// fetchGuildVoiceChannels (src/bot/channelLookup.ts) in that same order.
// Paired with admin.js's buildChannelPicker(), which turns the <select>
// into a searchable dropdown; the plain <select> is left fully functional
// as the real form field and as the no-JS fallback.
export function channelOptions(channels: GuildTextChannel[], selectedId?: string | null, namePrefix = ""): string {
  const uncategorized = channels.filter((c) => c.category === null);
  const categorized = channels.filter((c) => c.category !== null);

  const groups = new Map<string, GuildTextChannel[]>();
  for (const c of categorized) {
    const list = groups.get(c.category!) ?? [];
    list.push(c);
    groups.set(c.category!, list);
  }

  const option = (c: GuildTextChannel) =>
    `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${namePrefix}${escapeHtml(c.name)}</option>`;

  const plainOptions = uncategorized.map(option).join("");
  const optgroups = [...groups.entries()]
    .map(([category, groupChannels]) => `<optgroup label="${escapeHtml(category)}">${groupChannels.map(option).join("")}</optgroup>`)
    .join("");

  return plainOptions + optgroups;
}
