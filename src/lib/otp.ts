import 'server-only';

import { randomInt } from 'node:crypto';

import { OTP_CODE_LENGTH } from '@/config/guest';
import { pepperedHash } from '@/lib/pepper';

// docs/Security.md §4.1, GUEST-03: six digits from the CSPRNG, kept by guest_otps only as an HMAC under OTP_PEPPER,
// which the OTP functions in the database never see. The plain code lives in its outbox message only until that is
// sent or five minutes pass (internal.complete_notification and claim_notifications empty it).

const DECIMAL_BASE = 10;
const CODE_SPACE = DECIMAL_BASE ** OTP_CODE_LENGTH;

export function drawOtpCode(): string {
  return String(randomInt(0, CODE_SPACE)).padStart(OTP_CODE_LENGTH, '0');
}

// Keyed by the browser the code was sent to as well (src/lib/links/otp-browser.ts), so a code typed in another
// browser never matches its hash.
export function otpCodeHash(browserId: string, code: string): string {
  return pepperedHash('gsk-otp-code-v1', `${browserId}:${code}`);
}

// guest_otps.browser_hash: which browser a code belongs to, without the cookie's id itself in the database.
export function otpBrowserHash(browserId: string): string {
  return pepperedHash('gsk-otp-browser-v1', browserId);
}
