import 'server-only';

import { cookies } from 'next/headers';

import {
  CERTIFICATE_PAGE,
  CERTIFICATE_PROOF_COOKIE_SUFFIX,
  GUEST_BOOKING_PATH,
  GUEST_LINK_COOKIE_PREFIX,
  GUEST_LINK_TTL_SECONDS,
  OTP_BROWSER_COOKIE,
  OTP_BROWSER_TTL_SECONDS,
  PHONE_PROOF_COOKIE,
} from '@/config/guest';
import {
  isCertificateProof,
  signCertificateProof,
  type CertificateProofBinding,
} from '@/lib/links/certificate-proof';
import { newOtpBrowserId, readOtpBrowserId, signOtpBrowserId } from '@/lib/links/otp-browser';
import { readPhoneProof, signPhoneProof, type PhoneProof } from '@/lib/links/phone-proof';
import { guestLinkCookieName } from '@/lib/links/token';
import { otpBrowserHash } from '@/lib/otp';

// The visitor's own cookies (docs/Security.md §4.1, §6.7): httpOnly, so no script on the page reads them, Secure and
// SameSite=Lax like the staff session (src/config/auth.ts).
export const GUEST_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'lax' } as const;

const MS_PER_SECOND = 1000;

export function nowInSeconds(): number {
  return Math.floor(Date.now() / MS_PER_SECOND);
}

// browserId is the gsk_otp_browser id the code was checked under: the proof holds only in that browser (review of
// PR #27, L8).
export async function rememberPhoneProof(
  proof: Omit<PhoneProof, 'expiresAt'>,
  browserId: string,
): Promise<void> {
  const binding = { browserHash: otpBrowserHash(browserId), nowSeconds: nowInSeconds() };
  const { value, maxAge } = await signPhoneProof(proof, binding);
  (await cookies()).set(PHONE_PROOF_COOKIE, value, { ...GUEST_COOKIE_OPTIONS, path: '/', maxAge });
}

// The booking actions (Task P3.5.04) take the PIC's phone from here and never from the form.
export async function readPhoneProofCookie(): Promise<PhoneProof | null> {
  const value = (await cookies()).get(PHONE_PROOF_COOKIE)?.value;
  if (value === undefined) return null;
  const browserId = await readOtpBrowserCookie();
  if (browserId === null) return null;
  return readPhoneProof(value, {
    browserHash: otpBrowserHash(browserId),
    nowSeconds: nowInSeconds(),
  });
}

// A booking spends the code its proof names (internal.create_booking), so the next booking from this browser proves
// the contact again.
export async function forgetPhoneProof(): Promise<void> {
  (await cookies()).delete({ name: PHONE_PROOF_COOKIE, path: '/' });
}

// Decision of 2026-10-22 on P3.5, Q1 (docs/Security.md §3.2): the browser that made a booking holds its manage link,
// stored as src/lib/links/redirect.ts stores one that arrives by ?t=, under that booking's pages only.
export async function rememberGuestLink(bookingCode: string, token: string): Promise<void> {
  (await cookies()).set(guestLinkCookieName(bookingCode, 'manage'), token, {
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

// Task P4.5.03 (docs/Security.md DOC-02): the last four digits of the PIC's number, typed on the certificate page,
// open the certificates that print a person's name for half an hour, in this browser, on that page and its downloads
// only, and while the booking's links stand (review of PR #94, L2).
function certificateProofCookie(bookingCode: string) {
  return {
    name: `${GUEST_LINK_COOKIE_PREFIX}${bookingCode}${CERTIFICATE_PROOF_COOKIE_SUFFIX}`,
    path: `${GUEST_BOOKING_PATH}/${bookingCode}/${CERTIFICATE_PAGE}`,
  };
}

export async function rememberCertificateProof(binding: CertificateProofBinding): Promise<void> {
  const { name, path } = certificateProofCookie(binding.bookingCode);
  const { value, maxAge } = await signCertificateProof(binding, nowInSeconds());
  (await cookies()).set(name, value, { ...GUEST_COOKIE_OPTIONS, path, maxAge });
}

export async function hasCertificateProof(binding: CertificateProofBinding): Promise<boolean> {
  const value = (await cookies()).get(certificateProofCookie(binding.bookingCode).name)?.value;
  if (value === undefined) return false;
  return isCertificateProof(value, { ...binding, nowSeconds: nowInSeconds() });
}

// "Cabut tautan": the proof goes with the links, though the version would refuse it anyway.
export async function forgetCertificateProof(bookingCode: string): Promise<void> {
  (await cookies()).delete(certificateProofCookie(bookingCode));
}
