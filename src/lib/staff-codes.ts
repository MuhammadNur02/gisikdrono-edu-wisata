import 'server-only';

import { randomInt } from 'node:crypto';

import { INVITE_CODE_LENGTH } from '@/config/staff';
import { pepperedHash } from '@/lib/pepper';
import { CROCKFORD_ALPHABET, normalizeStaffCode } from '@/lib/utils/staff-code-format';

// docs/Security.md §5.1 (AUTH-09): the invite code is 20 Crockford base32 characters from the CSPRNG, about 100 bits,
// shown once in the UI and handed over in person or by voice. staff_invites keeps only its keyed hash under
// OTP_PEPPER, which no API role reads back (0005), so a leaked table or log line gives nobody a code. Onboarding
// (Task P4.8.01) hashes what the new officer types with inviteCodeHash and compares inside the database.

export function drawInviteCode(): string {
  return Array.from(
    { length: INVITE_CODE_LENGTH },
    () => CROCKFORD_ALPHABET[randomInt(0, CROCKFORD_ALPHABET.length)],
  ).join('');
}

// Hashes the canonical spelling, so `abcde-fghij…` typed with dashes, spaces or look-alike letters matches.
export function inviteCodeHash(code: string): string {
  return pepperedHash('gsk-staff-invite-v1', normalizeStaffCode(code));
}
