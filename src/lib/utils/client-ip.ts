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
