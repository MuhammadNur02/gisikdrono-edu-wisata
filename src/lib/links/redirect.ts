import { NextResponse, type NextRequest } from 'next/server';

import { GUEST_BOOKING_PATH, GUEST_LINK_PARAM } from '@/config/guest';
import { guestLinkCookieMaxAge, guestLinkCookieName } from '@/lib/links/token';
import { isBookingCode } from '@/lib/utils/codes';

// docs/Security.md §6.7: a guest link /reservasi/<code>?t=<token> leaves its token in a cookie scoped to that booking
// and goes on to the same address without it, so the token stays out of the address bar, the history and the
// Referer. Nothing is decided here (src/middleware.ts calls this): the page checks the cookie with requireGuestToken.
// A value that is not a live token is dropped rather than stored.

const SEE_OTHER = 303;
const GUEST_BOOKING_PATTERN = new RegExp(`^${GUEST_BOOKING_PATH}/([^/]+)(?:/|$)`);

export function redirectGuestLink(request: NextRequest, nowSeconds: number): NextResponse | null {
  const token = request.nextUrl.searchParams.get(GUEST_LINK_PARAM);
  const bookingCode = GUEST_BOOKING_PATTERN.exec(request.nextUrl.pathname)?.[1];
  if (token === null || bookingCode === undefined || !isBookingCode(bookingCode)) return null;
  const destination = request.nextUrl.clone();
  destination.searchParams.delete(GUEST_LINK_PARAM);
  const redirect = NextResponse.redirect(destination, SEE_OTHER);
  const maxAge = guestLinkCookieMaxAge(token, nowSeconds);
  if (maxAge !== null) {
    redirect.cookies.set(guestLinkCookieName(bookingCode), token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: `${GUEST_BOOKING_PATH}/${bookingCode}`,
      maxAge,
    });
  }
  return redirect;
}
