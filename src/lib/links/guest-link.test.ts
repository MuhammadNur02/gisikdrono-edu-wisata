import { describe, expect, it } from 'vitest';

import { GUEST_LINK_SCOPES, GUEST_LINK_TTL_SECONDS } from '@/config/guest';
import { hasValidSignature, sign } from '@/lib/links/hmac';
import { mintGuestLink, signedMessage } from '@/lib/links/mint';
import { decodePayload, encodePayload, guestLinkCookieMaxAge, splitToken } from '@/lib/links/token';
import { grantsScope, isCurrentLink, readGuestLink } from '@/lib/links/verify';

const CODE = 'GSK-7F3K9Q2M';
const OTHER_CODE = 'GSK-7F3K9Q2N';
const NOW = 1_790_000_000;

function minted(scope: (typeof GUEST_LINK_SCOPES)[number] = 'manage', tokenVersion = 1) {
  return mintGuestLink({ bookingCode: CODE, scope, tokenVersion, nowSeconds: NOW });
}

function reading(token: string, nowSeconds = NOW, bookingCode = CODE) {
  return readGuestLink(token, { bookingCode, nowSeconds });
}

describe('mintGuestLink and readGuestLink', () => {
  it.each(GUEST_LINK_SCOPES)(
    'mints a %s link that reads back with its scope, version and TTL',
    (scope) => {
      expect(reading(minted(scope, 3))).toEqual({
        ok: true,
        link: { s: scope, v: 3, exp: NOW + GUEST_LINK_TTL_SECONDS[scope] },
      });
    },
  );

  it('carries no booking id and no booking code inside the token', () => {
    const token = minted();
    const payload = splitToken(token)?.payload ?? '';
    expect(Buffer.from(payload, 'base64url').toString()).not.toMatch(/GSK|-[0-9a-f]{4}-/i);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  });

  it('refuses a link for another booking, which its signature does not cover', () => {
    expect(reading(minted(), NOW, OTHER_CODE)).toEqual({ ok: false, reason: 'forged' });
  });

  it('refuses a payload changed after signing, for instance a longer life or a wider scope', () => {
    const [, signature] = minted('view').split('.');
    const widened = encodePayload({ s: 'manage', v: 1, exp: NOW + 10 ** 6 });
    expect(reading(`${widened}.${String(signature)}`)).toEqual({ ok: false, reason: 'forged' });
  });

  it('refuses a changed or truncated signature', () => {
    const token = minted();
    const flipped = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    expect(reading(flipped)).toEqual({ ok: false, reason: 'forged' });
    expect(reading(token.slice(0, -2))).toEqual({ ok: false, reason: 'malformed' });
  });

  it('refuses a link at and after its expiry', () => {
    const token = minted('pay');
    const expiry = NOW + GUEST_LINK_TTL_SECONDS.pay;
    expect(reading(token, expiry - 1).ok).toBe(true);
    expect(reading(token, expiry)).toEqual({ ok: false, reason: 'expired' });
  });

  it.each(['', 'x', 'abc.def', `${'a'.repeat(200)}.${'b'.repeat(43)}`, 'not base64!.x'])(
    'calls %s malformed',
    (token) => {
      expect(reading(token)).toEqual({ ok: false, reason: 'malformed' });
    },
  );

  it('calls a well-shaped token with an unknown scope or a bad version malformed', () => {
    const fake = (payload: object) =>
      `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${'A'.repeat(43)}`;
    expect(reading(fake({ s: 'admin', v: 1, exp: NOW + 60 }))).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(reading(fake({ s: 'view', v: 0, exp: NOW + 60 })).ok).toBe(false);
    expect(reading(fake({ s: 'view', v: 1.5, exp: NOW + 60 })).ok).toBe(false);
  });
});

describe('isCurrentLink and grantsScope', () => {
  const link = { s: 'manage' as const, v: 2, exp: NOW + 60 };

  it('accepts a link of the current token_version for a scope it grants', () => {
    expect(isCurrentLink(link, { tokenVersion: 2, required: 'view' })).toBe(true);
    expect(isCurrentLink(link, { tokenVersion: 2, required: 'pay' })).toBe(true);
  });

  it('refuses a link minted before the links were revoked', () => {
    expect(isCurrentLink(link, { tokenVersion: 3, required: 'manage' })).toBe(false);
  });

  it('never lets a view link manage, pay, review or download a certificate', () => {
    expect(grantsScope('view', 'view')).toBe(true);
    for (const required of ['manage', 'pay', 'review', 'certificate'] as const) {
      expect(grantsScope('view', required)).toBe(false);
    }
    expect(grantsScope('pay', 'view')).toBe(true);
    expect(grantsScope('pay', 'manage')).toBe(false);
    expect(grantsScope('review', 'view')).toBe(false);
    expect(grantsScope('certificate', 'certificate')).toBe(true);
  });
});

describe('token helpers', () => {
  it('round-trips a payload and refuses a payload that is not JSON', () => {
    const payload = { s: 'review' as const, v: 4, exp: NOW };
    expect(decodePayload(encodePayload(payload))).toEqual(payload);
    expect(decodePayload(Buffer.from('{not json').toString('base64url'))).toBeNull();
  });

  it('gives the guest cookie the life left in its token, and none to an expired or broken one', () => {
    expect(guestLinkCookieMaxAge(minted('view'), NOW + 60)).toBe(GUEST_LINK_TTL_SECONDS.view - 60);
    expect(guestLinkCookieMaxAge(minted('view'), NOW + GUEST_LINK_TTL_SECONDS.view)).toBeNull();
    expect(guestLinkCookieMaxAge('garbage', NOW)).toBeNull();
  });

  it('signs under separate labels, so a guest link signature never passes as a phone proof', () => {
    const message = signedMessage(CODE, 'payload');
    const linkSignature = sign('gsk-guest-link-v1', message);
    expect(hasValidSignature('gsk-guest-link-v1', message, linkSignature)).toBe(true);
    expect(hasValidSignature('gsk-phone-proof-v1', message, linkSignature)).toBe(false);
    expect(hasValidSignature('gsk-guest-link-v1', message, linkSignature.slice(0, 20))).toBe(false);
  });
});
