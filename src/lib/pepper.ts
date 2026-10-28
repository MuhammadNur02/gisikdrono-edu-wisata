import 'server-only';

import { createHmac } from 'node:crypto';

import { serverEnv } from '@/lib/env';

// Every keyed hash under OTP_PEPPER names its use first, so a hash made for one purpose never equals one made for
// another: a rate-limit bucket says nothing about an OTP row or a log line, even for the same input (review of
// PR #20). The database does the same for its own uses of the pepper (internal.hash_email).
export type PepperLabel =
  | 'gsk-rate-limit-v1'
  | 'gsk-otp-code-v1'
  | 'gsk-otp-browser-v1'
  | 'gsk-log-email-v1'
  | 'gsk-staff-invite-v1'
  | 'gsk-ip-hash-v1';

export function pepperedHash(label: PepperLabel, value: string): string {
  return createHmac('sha256', serverEnv.OTP_PEPPER).update(`${label}\n${value}`).digest('hex');
}
