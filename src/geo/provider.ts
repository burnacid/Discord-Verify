import { checkVpn, lookupCountry } from "./store.js";

export interface IpCheckResult {
  countryCode: string | null;
  isVpn: boolean;
  fraudScore: number;
  raw: unknown;
}

export interface GeoProvider {
  check(ip: string): Promise<IpCheckResult>;
}

// Local, self-hosted GeoIP/VPN lookup: country comes from a GeoLite2 mmdb
// file, VPN detection from a known-VPN-network CIDR list. Both are kept
// in memory (see store.ts) and refreshed periodically on disk (see
// updater.ts / jobs/geoUpdater.ts) instead of calling a rate-limited API
// per request. There's no granular fraud score from these open sources, so
// fraudScore is just a 0/100 stand-in for isVpn, kept for backwards
// compatibility with the existing MAX_FRAUD_SCORE threshold and DB columns.
export class LocalGeoProvider implements GeoProvider {
  async check(ip: string): Promise<IpCheckResult> {
    const countryCode = lookupCountry(ip);
    const isVpn = checkVpn(ip);
    return {
      countryCode,
      isVpn,
      fraudScore: isVpn ? 100 : 0,
      raw: { countryCode, isVpn },
    };
  }
}

export const geoProvider: GeoProvider = new LocalGeoProvider();
