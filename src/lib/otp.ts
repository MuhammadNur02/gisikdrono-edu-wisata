import 'server-only';

import { createHmac, randomInt } from 'node:crypto';

import { OTP_CODE_LENGTH } from '@/config/guest';
import { serverEnv } from '@/lib/env';

// docs/Security.md §4.1, GUEST-03: six digits from the CSPRNG, kept by guest_otps only as an HMAC under OTP_PEPPER,
// which the database never holds. The plain code lives in its outbox message only until that is sent or five
// minutes pass (internal.complete_notification and claim_notifications empty it).

const DECIMAL_BASE = 10;
const CODE_SPACE = DECIMAL_BASE ** OTP_CODE_LENGTH;

export function drawOtpCode(): string {
  return String(randomInt(0, CODE_SPACE)).padStart(OTP_CODE_LENGTH, '0');
}

// Keyed by the row's own id as well, so one code typed against another OTP never matches its hash.
export function otpCodeHash(otpId: string, code: string): string {
  return createHmac('sha256', serverEnv.OTP_PEPPER).update(`${otpId}:${code}`).digest('hex');
}
