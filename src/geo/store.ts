import { isIPv4 } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { open, type Reader } from "maxmind";

export const GEO_DATA_DIR = path.resolve(process.cwd(), "data", "geoip");
export const MMDB_PATH = path.join(GEO_DATA_DIR, "GeoLite2-Country.mmdb");
export const VPN_LIST_PATH = path.join(GEO_DATA_DIR, "vpn-ipv4.txt");
// ASN-based detection is the only way to cover IPv6 VPNs: X4BNet's curated
// list (VPN_LIST_PATH above) has no IPv6 data at all, in any of its source
// files. ASN allocations span both address families, so matching a
// visitor's ASN against X4BNet's plain list of known-VPN ASN numbers works
// for v4 and v6 alike, and is used as an extra signal alongside the CIDR
// list (not a replacement) for IPv4.
export const ASN_MMDB_PATH = path.join(GEO_DATA_DIR, "GeoLite2-ASN.mmdb");
export const VPN_ASN_LIST_PATH = path.join(GEO_DATA_DIR, "vpn-asn.txt");

interface Range {
  start: number;
  end: number;
}

// sapics/ip-location-db's country mmdb uses a flattened schema
// (`{ country_code: "US" }`), not MaxMind's own nested
// `{ country: { iso_code: "US" } }` — hence the custom shape instead of
// mmdb-lib's built-in CountryResponse type.
interface FlatCountryResponse {
  country_code?: string;
}

interface FlatAsnResponse {
  autonomous_system_number?: number;
}

// `Reader<FlatCountryResponse>` doesn't typecheck: TS's weak-type detection
// rejects FlatCountryResponse as a type arg for maxmind's `T extends
// Response` constraint since it shares no property names with any Response
// member. Use the untyped reader and cast at the read site instead.
let countryReader: Reader<Record<string, unknown>> | null = null;
let vpnRanges: Range[] = [];
// ASN data is best-effort: a hiccup fetching it shouldn't take down country
// lookups or the existing IPv4 CIDR-based VPN check, so these default to
// "nothing loaded" rather than throwing (see loadGeoStore below).
let asnReader: Reader<Record<string, unknown>> | null = null;
let vpnAsns: Set<number> = new Set();
let loadedAt: Date | null = null;

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

function parseVpnRanges(text: string): Range[] {
  const ranges: Range[] = [];
  for (const line of text.split("\n")) {
    const cidr = line.trim();
    if (!cidr || cidr.startsWith("#")) continue;
    const [base, prefixStr] = cidr.split("/");
    if (!base || prefixStr === undefined) continue;
    const prefix = Number(prefixStr);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) continue;
    const baseInt = ipv4ToInt(base);
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const start = (baseInt & mask) >>> 0;
    const size = prefix === 32 ? 0 : 2 ** (32 - prefix) - 1;
    ranges.push({ start, end: (start + size) >>> 0 });
  }
  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

// X4BNet's ASN list is plain text, one entry per line, e.g.
// "AS9009 # M247, GB (NordVPN)".
function parseVpnAsns(text: string): Set<number> {
  const asns = new Set<number>();
  for (const line of text.split("\n")) {
    const match = line.trim().match(/^AS(\d+)/i);
    if (match) asns.add(Number(match[1]));
  }
  return asns;
}

function isInVpnRanges(ip: string): boolean {
  if (!isIPv4(ip)) return false;
  const target = ipv4ToInt(ip);
  let lo = 0;
  let hi = vpnRanges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const range = vpnRanges[mid];
    if (target < range.start) hi = mid - 1;
    else if (target > range.end) lo = mid + 1;
    else return true;
  }
  return false;
}

function isVpnByAsn(ip: string): boolean {
  if (!asnReader) return false;
  const result = asnReader.get(ip) as FlatAsnResponse | null;
  return result?.autonomous_system_number !== undefined && vpnAsns.has(result.autonomous_system_number);
}

async function loadOptionalAsnData(): Promise<void> {
  try {
    const [reader, asnText] = await Promise.all([
      open<Record<string, unknown>>(ASN_MMDB_PATH),
      readFile(VPN_ASN_LIST_PATH, "utf8"),
    ]);
    asnReader = reader;
    vpnAsns = parseVpnAsns(asnText);
  } catch (err) {
    console.error("ASN-based VPN data not available — falling back to IPv4-only VPN detection", err);
    asnReader = null;
    vpnAsns = new Set();
  }
}

// Loads the on-disk mmdb + VPN CIDR/ASN data into memory. Called once at
// startup (after the updater guarantees the required files exist) and again
// after every background refresh so a running process picks up new data
// without a restart.
export async function loadGeoStore(): Promise<void> {
  const [reader, vpnText] = await Promise.all([
    open<Record<string, unknown>>(MMDB_PATH),
    readFile(VPN_LIST_PATH, "utf8"),
    loadOptionalAsnData(),
  ]);
  countryReader = reader;
  vpnRanges = parseVpnRanges(vpnText);
  loadedAt = new Date();
}

export function isGeoStoreLoaded(): boolean {
  return countryReader !== null;
}

export interface GeoStoreStatus {
  loaded: boolean;
  loadedAt: Date | null;
  countryDbBuiltAt: Date | null;
  vpnRangeCount: number;
  vpnAsnLoaded: boolean;
  vpnAsnCount: number;
}

// Surfaced on the admin GeoIP tools page (src/web/admin/geoRoutes.ts) so an
// admin can see at a glance whether the data actually loaded and how stale
// it is, without digging through server logs.
export function getGeoStoreStatus(): GeoStoreStatus {
  return {
    loaded: countryReader !== null,
    loadedAt,
    countryDbBuiltAt: countryReader?.metadata.buildEpoch ?? null,
    vpnRangeCount: vpnRanges.length,
    vpnAsnLoaded: asnReader !== null,
    vpnAsnCount: vpnAsns.size,
  };
}

export function lookupCountry(ip: string): string | null {
  if (!countryReader) {
    throw new Error("GeoIP data not loaded yet");
  }
  const result = countryReader.get(ip) as FlatCountryResponse | null;
  return result?.country_code ?? null;
}

export function checkVpn(ip: string): boolean {
  return isInVpnRanges(ip) || isVpnByAsn(ip);
}
