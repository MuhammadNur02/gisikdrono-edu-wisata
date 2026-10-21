import 'server-only';

import { cookies } from 'next/headers';

import { PHONE_PROOF_COOKIE } from '@/config/guest';
import { readPhoneProof, signPhoneProof, type PhoneProof } from '@/lib/links/phone-proof';

// The visitor's own cookies (docs/Security.md §4.1, §6.7): httpOnly, so no script on the page reads them, Secure and
// SameSite=Lax like the staff session (src/config/auth.ts).
export const GUEST_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'lax' } as const;

const MS_PER_SECOND = 1000;

export function nowInSeconds(): number {
  return Math.floor(Date.now() / MS_PER_SECOND);
}

export async function rememberPhoneProof(proof: Omit<PhoneProof, 'expiresAt'>): Promise<void> {
  const { value, maxAge } = await signPhoneProof(proof, nowInSeconds());
  (await cookies()).set(PHONE_PROOF_COOKIE, value, { ...GUEST_COOKIE_OPTIONS, path: '/', maxAge });
}

// The booking actions (Task P3.5.04) take the PIC's phone from here and never from the form.
export async function readPhoneProofCookie(): Promise<PhoneProof | null> {
  const value = (await cookies()).get(PHONE_PROOF_COOKIE)?.value;
  return value === undefined ? null : readPhoneProof(value, nowInSeconds());
}
