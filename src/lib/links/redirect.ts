import { NextResponse, type NextRequest } from 'next/server';

import { GUEST_BOOKING_PATH, GUEST_LINK_PARAM } from '@/config/guest';
import { guestLinkCookieName } from '@/lib/links/token';
import { readGuestLink } from '@/lib/links/verify';
import { isBookingCode } from '@/lib/utils/codes';

// docs/Security.md §6.7: a guest link /reservasi/<code>?t=<token> leaves its token in a cookie scoped to that booking
// and goes on to the same address without it, so the token stays out of the address bar, the history and the
// Referer. src/middleware.ts calls this. Only a token whose signature and expiry pass for this booking is stored; any
// other value leaves the cookie the browser already holds as it is, so a crafted link cannot push out the visitor's
// own (review of PR #20, L2). What the token opens is still decided by the page, through requireGuestToken.

const SEE_OTHER = 303;
const GUEST_BOOKING_PATTERN = new RegExp(`^${GUEST_BOOKING_PATH}/([^/]+)(?:/|$)`);

export async function redirectGuestLink(
  request: NextRequest,
  nowSeconds: number,
): Promise<NextResponse | null> {
  const token = request.nextUrl.searchParams.get(GUEST_LINK_PARAM);
  const bookingCode = GUEST_BOOKING_PATTERN.exec(request.nextUrl.pathname)?.[1];
  if (token === null || bookingCode === undefined || !isBookingCode(bookingCode)) return null;
  const destination = request.nextUrl.clone();
  destination.searchParams.delete(GUEST_LINK_PARAM);
  const redirect = NextResponse.redirect(destination, SEE_OTHER);
  const reading = await readGuestLink(token, { bookingCode, nowSeconds });
  if (reading.ok) {
    redirect.cookies.set(guestLinkCookieName(bookingCode), token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: `${GUEST_BOOKING_PATH}/${bookingCode}`,
      maxAge: reading.link.exp - nowSeconds,
    });
  }
  return redirect;
}
