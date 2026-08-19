import { getRuntimeSettings } from "../runtimeSettings.js";

export interface GeoCheckLike {
  countryCode: string | null;
  fraudScore: number;
  isVpn: boolean;
}

// Shared by the post-join /verify flow (src/web/routes/verify.ts) and the
// pre-join /join invite gate (src/web/routes/join.ts) so the two can't drift
// out of sync on what counts as "safe enough to auto-verify" / "safe enough
// to hand out an invite without a captcha".
export function isGeoAllowed(geo: GeoCheckLike, guildId: string): boolean {
  const settings = getRuntimeSettings(guildId);
  const countryAllowed = geo.countryCode !== null && settings.allowedCountries.includes(geo.countryCode);
  const lowRisk = geo.fraudScore <= settings.maxFraudScore && !geo.isVpn;
  return countryAllowed && lowRisk;
}

// `context` fills in what auto-approval was skipped for. The post-join
// review form (src/web/routes/verify.ts) actually verifies the member, but
// the pre-join invite gate (src/web/routes/join.ts) only hands out a join
// link — calling that step "verification" too would be misleading, so each
// caller supplies wording that matches what it's actually doing.
export function geoReasonMessage(geo: GeoCheckLike, context: "verify" | "join"): string {
  if (context === "verify") {
    return geo.isVpn
      ? "We detected a VPN or proxy connection, so we can't verify you automatically."
      : "Your country isn't on our auto-verify list.";
  }
  return geo.isVpn
    ? "We detected a VPN or proxy connection, so we can't skip the extra check for this join link."
    : "Your country isn't on our auto-approve list for join links.";
}
