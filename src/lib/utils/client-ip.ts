// The visitor's IP for per-IP rate limits. Vercel sets x-real-ip and puts the client first in x-forwarded-for,
// replacing whatever the client sent, so both are trustworthy there. Without either (a local dev server behind
// nothing) every request shares one bucket, which only makes the limit stricter.
const UNKNOWN_CLIENT = 'unknown';

export function clientIpFrom(headers: Headers): string {
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const forwardedFor = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor || UNKNOWN_CLIENT;
}

const IPV6_GROUPS = 8;
// docs/Security.md §8.3 (L3 of the PR #17 review): one IPv6 subscriber usually holds a whole /64, so per-IP limits
// count the /64 rather than each of its addresses.
const IPV6_PREFIX_GROUPS = 4;
const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const HEX_GROUP = /^[0-9a-f]{1,4}$/;

function ipv6Groups(address: string): string[] | null {
  // At most one "::" may stand for the zero groups.
  const [head = '', tail, ...extraHalves] = address.toLowerCase().split('::');
  if (extraHalves.length > 0) return null;
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const filler = tail === undefined ? 0 : IPV6_GROUPS - left.length - right.length;
  const groups = [...left, ...Array<string>(Math.max(filler, 0)).fill('0'), ...right];
  if (groups.length !== IPV6_GROUPS || !groups.every((group) => HEX_GROUP.test(group))) return null;
  return groups.map((group) => group.replace(/^0+(?=.)/, ''));
}

// The subject a per-IP rate limit counts: an IPv4 address as it is (also when it arrives IPv4-mapped), an IPv6
// address as its /64, and anything else unchanged.
export function rateLimitIpBucket(ip: string): string {
  const mapped = IPV4_MAPPED.exec(ip);
  if (mapped?.[1]) return mapped[1];
  if (!ip.includes(':')) return ip;
  const groups = ipv6Groups(ip.split('%')[0] ?? '');
  return groups ? `${groups.slice(0, IPV6_PREFIX_GROUPS).join(':')}::/64` : ip;
}
