import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { GUEST_LINK_TTL_SECONDS } from '@/config/guest';
import { mintGuestLink } from '@/lib/links/mint';
import { redirectGuestLink } from '@/lib/links/redirect';
import { encodePayload } from '@/lib/links/token';

const NOW = 1_790_000_000;
const CODE = 'GSK-7F3K9Q2M';
const OTHER_CODE = 'GSK-7F3K9Q2N';
const SITE = 'http://127.0.0.1:3000';

function requestFor(path: string, cookie?: string) {
  const headers = cookie === undefined ? undefined : { cookie };
  return new NextRequest(new URL(path, SITE), { headers });
}

// NextURL writes 127.0.0.1 as localhost, so the path and query are what is compared.
function destinationOf(response: Response | null): string {
  const location = new URL(response?.headers.get('location') ?? '/', SITE);
  return `${location.pathname}${location.search}`;
}

function linkFor(bookingCode: string) {
  return mintGuestLink({ bookingCode, scope: 'manage', tokenVersion: 1, nowSeconds: NOW });
}

describe('redirectGuestLink', () => {
  const token = linkFor(CODE);

  it('moves the token into an httpOnly cookie for this booking and drops it from the address', async () => {
    const response = await redirectGuestLink(
      requestFor(`/reservasi/${CODE}?t=${await token}&tab=tiket`),
      NOW,
    );
    expect(response?.status).toBe(303);
    expect(destinationOf(response)).toBe(`/reservasi/${CODE}?tab=tiket`);
    const cookie = response?.cookies.get(`bk_${CODE}`);
    expect(cookie).toMatchObject({
      value: await token,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: `/reservasi/${CODE}`,
      maxAge: GUEST_LINK_TTL_SECONDS.manage,
    });
  });

  it('does the same below the booking, for /bayar or /tiket', async () => {
    const response = await redirectGuestLink(
      requestFor(`/reservasi/${CODE}/tiket?t=${await token}`),
      NOW,
    );
    expect(destinationOf(response)).toBe(`/reservasi/${CODE}/tiket`);
  });

  it('drops a value that is no live token instead of storing it, and still cleans the address', async () => {
    for (const value of ['garbage', await token]) {
      const nowSeconds = value === (await token) ? NOW + GUEST_LINK_TTL_SECONDS.manage : NOW;
      const response = await redirectGuestLink(
        requestFor(`/reservasi/${CODE}?t=${value}`),
        nowSeconds,
      );
      expect(destinationOf(response)).toBe(`/reservasi/${CODE}`);
      expect(response?.cookies.get(`bk_${CODE}`)).toBeUndefined();
    }
  });

  // Review of PR #20, L2: a well-formed token with a wrong signature used to be stored, replacing the visitor's own.
  it('stores no token whose signature fails, and leaves the link the browser already holds untouched', async () => {
    const [, signature] = (await token).split('.');
    const widened = `${encodePayload({ s: 'manage', v: 9, exp: NOW + 600 })}.${String(signature)}`;
    for (const forged of [widened, await linkFor(OTHER_CODE)]) {
      const response = await redirectGuestLink(
        requestFor(`/reservasi/${CODE}?t=${forged}`, `bk_${CODE}=${await token}`),
        NOW,
      );
      expect(response?.status).toBe(303);
      expect(destinationOf(response)).toBe(`/reservasi/${CODE}`);
      expect(response?.cookies.get(`bk_${CODE}`)).toBeUndefined();
      expect(response?.headers.get('set-cookie')).toBeNull();
    }
  });

  it.each([
    `/reservasi/${CODE}`,
    '/reservasi/cari?t=abc',
    '/reservasi/gsk-7f3k9q2m?t=abc',
    '/paket-wisata?t=abc',
  ])('leaves %s alone', async (path) => {
    expect(await redirectGuestLink(requestFor(path), NOW)).toBeNull();
  });
});
