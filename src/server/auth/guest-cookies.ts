import 'server-only';

import { cookies } from 'next/headers';

import { OTP_BROWSER_COOKIE, OTP_BROWSER_TTL_SECONDS, PHONE_PROOF_COOKIE } from '@/config/guest';
import { newOtpBrowserId, readOtpBrowserId, signOtpBrowserId } from '@/lib/links/otp-browser';
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

export async function readOtpBrowserCookie(): Promise<string | null> {
  const value = (await cookies()).get(OTP_BROWSER_COOKIE)?.value;
  return value === undefined ? null : readOtpBrowserId(value);
}

// Every code request keeps the browser's id, or gives it one, and sets the cookie again either way, so the answer
// looks the same whatever came before (review of PR #20, M1 and L4).
export async function ensureOtpBrowserId(): Promise<string> {
  const browserId = (await readOtpBrowserCookie()) ?? newOtpBrowserId();
  (await cookies()).set(OTP_BROWSER_COOKIE, await signOtpBrowserId(browserId), {
    ...GUEST_COOKIE_OPTIONS,
    path: '/',
    maxAge: OTP_BROWSER_TTL_SECONDS,
  });
  return browserId;
}
