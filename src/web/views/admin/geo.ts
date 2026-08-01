import { renderAdminPage } from "./layout.js";
import type { AdminUser, FlashKind } from "./layout.js";
import type { GeoStoreStatus } from "../../../geo/store.js";

function formatDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—";
}

export function geoPage(user: AdminUser, status: GeoStoreStatus, flash?: string, flashKind?: FlashKind): string {
  const body = `
    <h1>GeoIP / VPN tools</h1>

    <h2>Data status</h2>
    <div class="card">
      <table>
        <tbody>
          <tr><td>Loaded</td><td>${status.loaded ? '<span class="badge badge-verified">yes</span>' : '<span class="badge badge-unverified">no</span>'}</td></tr>
          <tr><td>Last loaded</td><td>${formatDate(status.loadedAt)}</td></tr>
          <tr><td>Country database built</td><td>${formatDate(status.countryDbBuiltAt)}</td></tr>
          <tr><td>VPN network ranges</td><td>${status.vpnRangeCount.toLocaleString()}</td></tr>
        </tbody>
      </table>
      <div class="hint">Refreshed automatically every 12h from open-source sources (see README). Use the button below to fetch the latest data immediately.</div>
      <form class="inline mt-md" method="post" action="/admin/geo/refresh" data-loading-text="Refreshing…">
        <button type="submit" class="btn-primary">Refresh now</button>
      </form>
    </div>

    <h2>Test an IP</h2>
    <div class="card">
      <form method="post" action="/admin/geo/test">
        <label for="ip">IPv4 or IPv6 address</label>
        <input type="text" id="ip" name="ip" placeholder="e.g. 8.8.8.8" required />
        <div class="hint">Runs the same check a verifying member's IP goes through — country, VPN/proxy detection, and fraud score.</div>
        <button type="submit" class="btn-primary mt-md">Check</button>
      </form>
    </div>
  `;

  return renderAdminPage("GeoIP / VPN tools", user, body, flash, flashKind);
}
