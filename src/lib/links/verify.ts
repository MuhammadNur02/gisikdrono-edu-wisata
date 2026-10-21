import 'server-only';

import { GUEST_LINK_GRANTS, type GuestLinkScope } from '@/config/guest';
import { hasValidSignature } from '@/lib/links/hmac';
import { signedMessage } from '@/lib/links/mint';
import { decodePayload, splitToken, type GuestLinkPayload } from '@/lib/links/token';

// The only place a guest link is checked (CLAUDE.md §7.5, docs/Security.md GUEST-02). Two steps, so a forged or
// expired token is turned away before anything asks the database: readGuestLink checks the signature and the expiry,
// then isCurrentLink compares the version and scope with the booking row the caller read.

export type GuestLinkReading =
  { ok: true; link: GuestLinkPayload } | { ok: false; reason: 'malformed' | 'forged' | 'expired' };

export function readGuestLink(
  token: string,
  { bookingCode, nowSeconds }: { bookingCode: string; nowSeconds: number },
): GuestLinkReading {
  const parts = splitToken(token);
  const link = parts ? decodePayload(parts.payload) : null;
  if (!parts || !link) return { ok: false, reason: 'malformed' };
  const message = signedMessage(bookingCode, parts.payload);
  if (!hasValidSignature('gsk-guest-link-v1', message, parts.signature)) {
    return { ok: false, reason: 'forged' };
  }
  if (link.exp <= nowSeconds) return { ok: false, reason: 'expired' };
  return { ok: true, link };
}

export function grantsScope(granted: GuestLinkScope, required: GuestLinkScope): boolean {
  const opens: readonly GuestLinkScope[] = GUEST_LINK_GRANTS[granted];
  return opens.includes(required);
}

// A link minted before the last "Cabut tautan" carries an older token_version and stops working.
export function isCurrentLink(
  link: GuestLinkPayload,
  { tokenVersion, required }: { tokenVersion: number; required: GuestLinkScope },
): boolean {
  return link.v === tokenVersion && grantsScope(link.s, required);
}
