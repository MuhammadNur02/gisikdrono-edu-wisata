import { describe, expect, it } from 'vitest';

import { isOwnDocumentUrl, testEnvironmentOf, testNumbersOf } from './wa-send-test-guards.ts';

const LOCAL = 'http://127.0.0.1:54321';
const BASE = {
  WHATSAPP_ACCESS_TOKEN: 'fake',
  WHATSAPP_PHONE_NUMBER_ID: '0',
  NEXT_PUBLIC_SUPABASE_URL: LOCAL,
};
const SIGNED = `${LOCAL}/storage/v1/object/sign/documents/bookings/0192f3a4/ticket-GSK-7F3K9Q2M.pdf?token=abc`;

describe('testEnvironmentOf', () => {
  it('accepts this machine and the staging project the file names', () => {
    expect(testEnvironmentOf(BASE).NEXT_PUBLIC_SUPABASE_URL).toBe(LOCAL);
    const ref = 'abcdefghijklmnopqrst';
    const staging = {
      ...BASE,
      NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
      STAGING_PROJECT_REF: ref,
    };
    expect(testEnvironmentOf(staging).STAGING_PROJECT_REF).toBe(ref);
  });

  it.each([
    ['VERCEL_ENV=production', { VERCEL_ENV: 'production' }],
    ['MIDTRANS_IS_PRODUCTION=true', { MIDTRANS_IS_PRODUCTION: 'true' }],
    ['MIDTRANS_IS_PRODUCTION=1', { MIDTRANS_IS_PRODUCTION: '1' }],
    ['MIDTRANS_IS_PRODUCTION=TRUE', { MIDTRANS_IS_PRODUCTION: 'TRUE' }],
    ['MIDTRANS_IS_PRODUCTION=yes', { MIDTRANS_IS_PRODUCTION: 'yes' }],
    [
      'a Supabase that is neither local nor the named staging project',
      { NEXT_PUBLIC_SUPABASE_URL: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co' },
    ],
  ])('refuses %s', (_case, overrides) => {
    expect(() => testEnvironmentOf({ ...BASE, ...overrides })).toThrow();
  });

  it('refuses an unknown VERCEL_ENV rather than guessing', () => {
    expect(() => testEnvironmentOf({ ...BASE, VERCEL_ENV: 'prod' })).toThrow();
  });
});

describe('isOwnDocumentUrl', () => {
  it('accepts a signed URL of our documents bucket', () => {
    expect(isOwnDocumentUrl(SIGNED, LOCAL)).toBe(true);
  });

  it.each([
    ['another origin', SIGNED.replace(LOCAL, 'https://evil.example')],
    ['another port', SIGNED.replace(':54321', ':54322')],
    [
      'a path that climbs out with ../',
      `${LOCAL}/storage/v1/object/sign/documents/../../../other/x.pdf?token=abc`,
    ],
    [
      'a path that climbs out with %2e%2e',
      `${LOCAL}/storage/v1/object/sign/documents/%2e%2e/%2e%2e/other/x.pdf?token=abc`,
    ],
    ['an encoded slash', `${LOCAL}/storage/v1/object/sign/documents/a%2F..%2Fx.pdf?token=abc`],
    ['another bucket', `${LOCAL}/storage/v1/object/sign/public-media/x.pdf?token=abc`],
    ['a public, unsigned path', `${LOCAL}/storage/v1/object/public/documents/x.pdf?token=abc`],
    ['no token', SIGNED.replace('?token=abc', '')],
    ['an empty token', SIGNED.replace('token=abc', 'token=')],
    ['no URL at all', 'not a url'],
  ])('refuses %s', (_case, url) => {
    expect(isOwnDocumentUrl(url, LOCAL)).toBe(false);
  });
});

describe('testNumbersOf', () => {
  it('reads one number a line, without blanks and comments', () => {
    expect(testNumbersOf('# uji\n+6281234567890\r\n\n  +6281200000001  \n')).toEqual([
      '+6281234567890',
      '+6281200000001',
    ]);
  });
});
