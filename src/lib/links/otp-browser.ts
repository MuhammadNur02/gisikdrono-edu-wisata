import 'server-only';

import { hasValidSignature, sign } from '@/lib/links/hmac';

// The gsk_otp_browser cookie (review of PR #20, M1): `<browser id>.<signature>`, the id 16 random bytes in base64url.
// A pending code belongs to the browser this names, so a code asked for in another browser replaces nothing here and
// counts against that browser's own daily codes. The database only ever sees the id's keyed hash (src/lib/otp.ts).

const BROWSER_ID_BYTES = 16;
const VALUE_PATTERN = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

export function newOtpBrowserId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(BROWSER_ID_BYTES));
  return Buffer.from(bytes).toString('base64url');
}

export async function signOtpBrowserId(browserId: string): Promise<string> {
  return `${browserId}.${await sign('gsk-otp-browser-cookie-v1', browserId)}`;
}

export async function readOtpBrowserId(value: string): Promise<string | null> {
  const parts = VALUE_PATTERN.exec(value);
  if (!parts?.[1] || !parts[2]) return null;
  const isGenuine = await hasValidSignature('gsk-otp-browser-cookie-v1', parts[1], parts[2]);
  return isGenuine ? parts[1] : null;
}
