import { isIP } from "node:net";

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

function inRange(ip: number, base: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ip & mask) === (ipv4ToInt(base) & mask);
}

const PRIVATE_IPV4_RANGES: Array<[string, number]> = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
];

function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return PRIVATE_IPV4_RANGES.some(([base, prefix]) => inRange(value, base, prefix));
}

// Covers loopback (::1), unique-local (fc00::/7), and link-local (fe80::/10).
function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  const firstGroup = normalized.split(":")[0];
  if (/^f[cd]/.test(firstGroup)) return true;
  if (/^fe[89ab]/.test(firstGroup)) return true;
  return false;
}

// True for private/loopback/link-local addresses (RFC 1918, RFC 4193, RFC
// 3927/4291) — i.e. IPs that will never appear in a public GeoIP database.
// Unwraps IPv4-mapped IPv6 (::ffff:a.b.c.d) before checking.
export function isPrivateIp(ip: string): boolean {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const target = mapped ? mapped[1] : ip;

  if (isIP(target) === 4) return isPrivateIpv4(target);
  if (isIP(target) === 6) return isPrivateIpv6(target);
  return false;
}
