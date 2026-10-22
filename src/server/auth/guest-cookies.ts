import 'server-only';

import { cookies } from 'next/headers';

import {
  GUEST_BOOKING_PATH,
  GUEST_LINK_TTL_SECONDS,
  OTP_BROWSER_COOKIE,
  OTP_BROWSER_TTL_SECONDS,
  PHONE_PROOF_COOKIE,
} from '@/config/guest';
import { newOtpBrowserId, readOtpBrowserId, signOtpBrowserId } from '@/lib/links/otp-browser';
import { readPhoneProof, signPhoneProof, type PhoneProof } from '@/lib/links/phone-proof';
import { guestLinkCookieName } from '@/lib/links/token';

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

// A booking spends the code its proof names (internal.create_booking), so the next booking from this browser proves
// the contact again.
export async function forgetPhoneProof(): Promise<void> {
  (await cookies()).delete({ name: PHONE_PROOF_COOKIE, path: '/' });
}

// Decision of 2026-10-22 on P3.5, Q1 (docs/Security.md §3.2): the browser that made a booking holds its manage link,
// stored as src/lib/links/redirect.ts stores one that arrives by ?t=, under that booking's pages only.
export async function rememberGuestLink(bookingCode: string, token: string): Promise<void> {
  (await cookies()).set(guestLinkCookieName(bookingCode), token, {
    ...GUEST_COOKIE_OPTIONS,
    path: `${GUEST_BOOKING_PATH}/${bookingCode}`,
    maxAge: GUEST_LINK_TTL_SECONDS.manage,
  });
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
