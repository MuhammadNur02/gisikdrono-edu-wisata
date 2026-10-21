import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { serverEnv } from '@/lib/env';

// The one key behind every guest link and the phone proof cookie (CLAUDE.md §7.5). Each kind of token signs under
// its own label, so a value made for one can never pass as the other.
export type SignatureLabel = 'gsk-guest-link-v1' | 'gsk-phone-proof-v1';

const SIGNATURE_BYTES = 32;

function signatureBytes(label: SignatureLabel, message: string): Buffer {
  return createHmac('sha256', serverEnv.BOOKING_LINK_SECRET)
    .update(`${label}\n${message}`)
    .digest();
}

export function sign(label: SignatureLabel, message: string): string {
  return signatureBytes(label, message).toString('base64url');
}

// A wrongly sized signature is refused before the comparison, which timingSafeEqual needs equal lengths for; the
// length of a genuine signature is no secret.
export function hasValidSignature(
  label: SignatureLabel,
  message: string,
  presented: string,
): boolean {
  const given = Buffer.from(presented, 'base64url');
  if (given.length !== SIGNATURE_BYTES) return false;
  return timingSafeEqual(signatureBytes(label, message), given);
}
