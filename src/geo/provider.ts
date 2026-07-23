export interface IpCheckResult {
  countryCode: string | null;
  isVpn: boolean;
  fraudScore: number;
  raw: unknown;
}

export interface GeoProvider {
  check(ip: string): Promise<IpCheckResult>;
}

const IPQS_API_KEY = process.env.IPQS_API_KEY;

interface IpqsResponse {
  success: boolean;
  message?: string;
  fraud_score: number;
  country_code: string;
  vpn: boolean;
  proxy: boolean;
  tor: boolean;
}

export class IpQualityScoreProvider implements GeoProvider {
  async check(ip: string): Promise<IpCheckResult> {
    if (!IPQS_API_KEY) {
      throw new Error("IPQS_API_KEY is not configured");
    }

    const url = `https://ipqualityscore.com/api/json/ip/${IPQS_API_KEY}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=true`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`IPQS request failed with status ${res.status}`);
    }

    const data = (await res.json()) as IpqsResponse;
    if (!data.success) {
      throw new Error(`IPQS request unsuccessful: ${data.message ?? "unknown error"}`);
    }

    return {
      countryCode: data.country_code ?? null,
      isVpn: Boolean(data.vpn || data.proxy || data.tor),
      fraudScore: data.fraud_score,
      raw: data,
    };
  }
}

export const geoProvider: GeoProvider = new IpQualityScoreProvider();
