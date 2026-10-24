// zod/mini, not zod: src/middleware.ts imports this file, and the mini build keeps its bundle small.
import * as z from 'zod/mini';

import { GUEST_LINK_COOKIE_PREFIX, GUEST_LINK_SCOPES, type GuestLinkScope } from '@/config/guest';

// The shape of a guest link token, `<payload>.<signature>`, both base64url: the payload is {s: scope, v:
// token_version, exp} and the signature an HMAC over it and the booking code, made in mint.ts. Nothing here uses a
// key; only verify.ts says whether a token is genuine. The booking's id is never in it: the code in the address names
// the booking (docs/Security.md §6.7).

export interface GuestLinkPayload {
  s: GuestLinkScope;
  v: number;
  exp: number;
}

// 32 bytes of HMAC-SHA256 are 43 base64url characters; a payload this small never needs more than 120.
const TOKEN_PATTERN = /^([A-Za-z0-9_-]{8,120})\.([A-Za-z0-9_-]{43})$/;
const BASE64_BLOCK = 4;

export function toBase64Url(text: string): string {
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(part: string): string {
  const base64 = part.replaceAll('-', '+').replaceAll('_', '/');
  return atob(base64.padEnd(Math.ceil(base64.length / BASE64_BLOCK) * BASE64_BLOCK, '='));
}

export function encodePayload(payload: GuestLinkPayload): string {
  return toBase64Url(JSON.stringify({ s: payload.s, v: payload.v, exp: payload.exp }));
}

const payloadSchema = z.object({
  s: z.enum(GUEST_LINK_SCOPES),
  v: z.int().check(z.minimum(1)),
  exp: z.int().check(z.positive()),
});

export function decodePayload(part: string): GuestLinkPayload | null {
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(fromBase64Url(part)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function splitToken(token: string): { payload: string; signature: string } | null {
  const parts = TOKEN_PATTERN.exec(token);
  if (!parts?.[1] || !parts[2]) return null;
  return { payload: parts[1], signature: parts[2] };
}

// A booking's cookies live under /reservasi/<booking_code> only. A review or certificate link opens one page of its
// own, so it keeps a cookie of its own, bk_<booking_code>_<scope>, and never pushes out the manage, pay or view link
// the browser holds; those three share bk_<booking_code> (review of PR #47).
const OWN_COOKIE_SCOPES: ReadonlySet<GuestLinkScope> = new Set(['review', 'certificate']);

export function guestLinkCookieName(bookingCode: string, scope: GuestLinkScope): string {
  const shared = `${GUEST_LINK_COOKIE_PREFIX}${bookingCode}`;
  return OWN_COOKIE_SCOPES.has(scope) ? `${shared}_${scope}` : shared;
}

// Every cookie a booking's links may have left in this browser, for "Cabut tautan".
export function guestLinkCookieNames(bookingCode: string): string[] {
  return [...new Set(GUEST_LINK_SCOPES.map((scope) => guestLinkCookieName(bookingCode, scope)))];
}
