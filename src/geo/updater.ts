import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { GEO_DATA_DIR, MMDB_PATH, VPN_LIST_PATH, loadGeoStore } from "./store.js";

// GeoLite2 country database, rebuilt from MaxMind/DB-IP source data twice a
// week by github.com/sapics/ip-location-db's CI — no account/license key
// needed, unlike downloading directly from MaxMind.
const MMDB_URL = "https://github.com/sapics/ip-location-db/releases/download/latest/geolite2-country.mmdb";
// Known VPN provider network ranges, rebuilt daily by github.com/X4BNet/lists_vpn's CI.
const VPN_LIST_URL = "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt";

async function downloadTo(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}) for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const tmpPath = `${destPath}.tmp`;
  await writeFile(tmpPath, buf);
  await rename(tmpPath, destPath);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// Refreshes both data files from their upstream sources and reloads them
// into memory. If a download fails but a previously-downloaded copy is
// already on disk, keeps serving the stale copy rather than taking the
// GeoIP check down over a transient network/CI hiccup.
export async function refreshGeoData(): Promise<void> {
  await mkdir(GEO_DATA_DIR, { recursive: true });

  const results = await Promise.allSettled([
    downloadTo(MMDB_URL, MMDB_PATH),
    downloadTo(VPN_LIST_URL, VPN_LIST_PATH),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("GeoIP data refresh failed for one source", result.reason);
    }
  }

  const [haveMmdb, haveVpnList] = await Promise.all([exists(MMDB_PATH), exists(VPN_LIST_PATH)]);
  if (!haveMmdb || !haveVpnList) {
    throw new Error("GeoIP data is missing and could not be downloaded");
  }

  await loadGeoStore();
}
