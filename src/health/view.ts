import type { HealthStatus } from "./status.js";

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function row(label: string, ok: boolean, value: string): string {
  return `<div class="row">
    <span class="dot ${ok ? "ok" : "bad"}"></span>
    <span class="label">${label}</span>
    <span class="value">${value}</span>
  </div>`;
}

export function healthPage(status: HealthStatus): string {
  const rows = [
    row("Discord bot", status.discord.ready, status.discord.tag ?? "not logged in"),
    row(
      "Guild connection",
      status.discord.guildConnected,
      status.discord.memberCount !== null ? `${status.discord.memberCount} members` : "unreachable",
    ),
    row(
      "Gateway latency",
      status.discord.wsPingMs !== null && status.discord.wsPingMs < 500,
      status.discord.wsPingMs !== null ? `${status.discord.wsPingMs}ms` : "n/a",
    ),
    row("Database", status.database.ok, status.database.ok ? "connected" : (status.database.error ?? "error")),
  ].join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="30" />
    <title>${status.ok ? "All systems operational" : "Service issue"} — Discord Verify</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1e1f22;
        color: #f2f3f5;
        font-family: "gg sans", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        padding: 24px;
      }
      .card {
        max-width: 420px;
        width: 100%;
        background: #2b2d31;
        border-radius: 12px;
        padding: 32px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      }
      h1 {
        font-size: 1.15rem;
        font-weight: 600;
        margin: 0 0 4px;
        text-align: center;
        color: ${status.ok ? "#23a559" : "#f23f42"};
      }
      .uptime {
        text-align: center;
        color: #b5bac1;
        font-size: 0.85rem;
        margin: 0 0 24px;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 0;
        border-top: 1px solid #1e1f22;
        font-size: 0.9rem;
      }
      .row:first-of-type { border-top: none; }
      .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .dot.ok { background: #23a559; }
      .dot.bad { background: #f23f42; }
      .label { color: #b5bac1; flex: 1; }
      .value { font-weight: 600; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${status.ok ? "All systems operational" : "Service issue detected"}</h1>
      <p class="uptime">Uptime: ${formatUptime(status.uptimeSeconds)}</p>
      ${rows}
    </div>
  </body>
</html>`;
}
