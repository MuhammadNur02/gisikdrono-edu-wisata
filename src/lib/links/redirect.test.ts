import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { GUEST_LINK_TTL_SECONDS } from '@/config/guest';
import { mintGuestLink } from '@/lib/links/mint';
import { redirectGuestLink } from '@/lib/links/redirect';

const NOW = 1_790_000_000;
const CODE = 'GSK-7F3K9Q2M';
const SITE = 'http://127.0.0.1:3000';

function requestFor(path: string) {
  return new NextRequest(new URL(path, SITE));
}

// NextURL writes 127.0.0.1 as localhost, so the path and query are what is compared.
function destinationOf(response: Response | null): string {
  const location = new URL(response?.headers.get('location') ?? '/', SITE);
  return `${location.pathname}${location.search}`;
}

describe('redirectGuestLink', () => {
  const token = mintGuestLink({
    bookingCode: CODE,
    scope: 'manage',
    tokenVersion: 1,
    nowSeconds: NOW,
  });

  it('moves the token into an httpOnly cookie for this booking and drops it from the address', () => {
    const response = redirectGuestLink(requestFor(`/reservasi/${CODE}?t=${token}&tab=tiket`), NOW);
    expect(response?.status).toBe(303);
    expect(destinationOf(response)).toBe(`/reservasi/${CODE}?tab=tiket`);
    const cookie = response?.cookies.get(`bk_${CODE}`);
    expect(cookie).toMatchObject({
      value: token,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: `/reservasi/${CODE}`,
      maxAge: GUEST_LINK_TTL_SECONDS.manage,
    });
  });

  it('does the same below the booking, for /bayar or /tiket', () => {
    const response = redirectGuestLink(requestFor(`/reservasi/${CODE}/tiket?t=${token}`), NOW);
    expect(destinationOf(response)).toBe(`/reservasi/${CODE}/tiket`);
  });

  it('drops a value that is no live token instead of storing it, and still cleans the address', () => {
    for (const value of ['garbage', token]) {
      const nowSeconds = value === token ? NOW + GUEST_LINK_TTL_SECONDS.manage : NOW;
      const response = redirectGuestLink(requestFor(`/reservasi/${CODE}?t=${value}`), nowSeconds);
      expect(destinationOf(response)).toBe(`/reservasi/${CODE}`);
      expect(response?.cookies.get(`bk_${CODE}`)).toBeUndefined();
    }
  });

  it.each([
    `/reservasi/${CODE}`,
    '/reservasi/cari?t=abc',
    '/reservasi/gsk-7f3k9q2m?t=abc',
    '/paket-wisata?t=abc',
  ])('leaves %s alone', (path) => {
    expect(redirectGuestLink(requestFor(path), NOW)).toBeNull();
  });
});
