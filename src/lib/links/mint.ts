import 'server-only';

import { GUEST_LINK_TTL_SECONDS, type GuestLinkScope } from '@/config/guest';
import { sign } from '@/lib/links/hmac';
import { encodePayload } from '@/lib/links/token';

// The only place a guest link is made (CLAUDE.md §7.5, docs/Security.md §6.7, GUEST-02). The signature covers the
// booking code as well as the payload, so a token works for its own booking only, though the code is not inside it.
export interface GuestLinkRequest {
  bookingCode: string;
  scope: GuestLinkScope;
  // bookings.token_version now: bumping it revokes every link made before.
  tokenVersion: number;
  nowSeconds: number;
}

export function signedMessage(bookingCode: string, payload: string): string {
  return `${bookingCode}.${payload}`;
}

export async function mintGuestLink({
  bookingCode,
  scope,
  tokenVersion,
  nowSeconds,
}: GuestLinkRequest): Promise<string> {
  const payload = encodePayload({
    s: scope,
    v: tokenVersion,
    exp: nowSeconds + GUEST_LINK_TTL_SECONDS[scope],
  });
  return `${payload}.${await sign('gsk-guest-link-v1', signedMessage(bookingCode, payload))}`;
}
