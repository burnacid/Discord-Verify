import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { ASN_MMDB_PATH, GEO_DATA_DIR, MMDB_PATH, VPN_ASN_LIST_PATH, VPN_LIST_PATH, loadGeoStore } from "./store.js";

// GeoLite2 country database, rebuilt from MaxMind/DB-IP source data twice a
// week by github.com/sapics/ip-location-db's CI — no account/license key
// needed, unlike downloading directly from MaxMind.
const MMDB_URL = "https://github.com/sapics/ip-location-db/releases/download/latest/geolite2-country.mmdb";
// Known VPN provider network ranges, rebuilt daily by github.com/X4BNet/lists_vpn's CI.
const VPN_LIST_URL = "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt";
// ASN database (IPv4 + IPv6), same rebuild cadence as the country mmdb.
// Combined with VPN_ASN_LIST_URL below to detect VPNs by ASN — the only way
// to cover IPv6, since X4BNet's CIDR list (VPN_LIST_URL) has no IPv6 data.
const ASN_MMDB_URL = "https://github.com/sapics/ip-location-db/releases/download/latest/geolite2-asn.mmdb";
// X4BNet's plain list of ASN numbers it classifies as dedicated VPN
// providers (not the broader/noisier "datacenter" ASN list) — same
// precision tier as VPN_LIST_URL above.
const VPN_ASN_LIST_URL = "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/input/vpn/ASN.txt";

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

// Refreshes the data files from their upstream sources and reloads them
// into memory. If a download fails but a previously-downloaded copy is
// already on disk, keeps serving the stale copy rather than taking the
// GeoIP check down over a transient network/CI hiccup. The ASN files are
// best-effort (see loadGeoStore) — only the country mmdb and IPv4 VPN list
// are required for startup to succeed.
export async function refreshGeoData(): Promise<void> {
  await mkdir(GEO_DATA_DIR, { recursive: true });

  const results = await Promise.allSettled([
    downloadTo(MMDB_URL, MMDB_PATH),
    downloadTo(VPN_LIST_URL, VPN_LIST_PATH),
    downloadTo(ASN_MMDB_URL, ASN_MMDB_PATH),
    downloadTo(VPN_ASN_LIST_URL, VPN_ASN_LIST_PATH),
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
