import { describe, expect, it } from 'vitest';

import { findEnvProblems, findLeakyPublicNames, serverEnv } from '@/lib/env';

const sandbox = {
  MIDTRANS_IS_PRODUCTION: false,
  MIDTRANS_SERVER_KEY: 'SB-Mid-server-abc',
  MIDTRANS_CLIENT_KEY: 'SB-Mid-client-abc',
  QR_SIGNING_KEYS: { k1: 'key' },
  QR_SIGNING_ACTIVE_KID: 'k1',
};

const production = {
  ...sandbox,
  VERCEL_ENV: 'production' as const,
  MIDTRANS_IS_PRODUCTION: true,
  MIDTRANS_SERVER_KEY: 'Mid-server-abc',
  MIDTRANS_CLIENT_KEY: 'Mid-client-abc',
  WHATSAPP_ACCESS_TOKEN: 'token',
  WHATSAPP_PHONE_NUMBER_ID: '123',
  WHATSAPP_APP_SECRET: 'secret',
};

describe('findEnvProblems', () => {
  it('accepts sandbox keys on a local or preview deployment', () => {
    expect(findEnvProblems(sandbox)).toEqual([]);
    expect(findEnvProblems({ ...sandbox, VERCEL_ENV: 'preview' })).toEqual([]);
  });

  it('accepts live keys in production', () => {
    expect(findEnvProblems(production)).toEqual([]);
  });

  it('rejects sandbox keys in production', () => {
    const problems = findEnvProblems({ ...production, MIDTRANS_SERVER_KEY: 'SB-Mid-server-abc' });
    expect(problems).toEqual([
      'MIDTRANS_SERVER_KEY must start with Mid-server- on this deployment',
    ]);
  });

  it('rejects live keys and the production flag on a preview', () => {
    const problems = findEnvProblems({ ...production, VERCEL_ENV: 'preview' });
    expect(problems).toHaveLength(3);
    expect(problems).toContain('MIDTRANS_IS_PRODUCTION must be false when VERCEL_ENV is preview');
  });

  it('checks the previous server key during a rotation', () => {
    const problems = findEnvProblems({
      ...sandbox,
      MIDTRANS_SERVER_KEY_PREVIOUS: 'Mid-server-old',
    });
    expect(problems).toEqual([
      'MIDTRANS_SERVER_KEY_PREVIOUS must start with SB-Mid-server- on this deployment',
    ]);
  });

  it('rejects an active kid that is missing from its key ring', () => {
    expect(findEnvProblems({ ...sandbox, QR_SIGNING_ACTIVE_KID: 'k2' })).toHaveLength(1);
    expect(findEnvProblems({ ...sandbox, PARTICIPANT_PII_ACTIVE_KID: 'k1' })).toHaveLength(1);
  });

  it('demands the WhatsApp credentials in production only', () => {
    expect(findEnvProblems({ ...production, WHATSAPP_APP_SECRET: undefined })).toEqual([
      'WHATSAPP_APP_SECRET is required in production',
    ]);
  });
});

describe('findLeakyPublicNames', () => {
  it('flags public names that look like secrets', () => {
    expect(
      findLeakyPublicNames([
        'NEXT_PUBLIC_MIDTRANS_SERVER_KEY',
        'NEXT_PUBLIC_CRON_SECRET',
        'NEXT_PUBLIC_API_TOKEN',
      ]),
    ).toHaveLength(3);
  });

  it('allows the two public keys and ignores server-side names', () => {
    expect(
      findLeakyPublicNames([
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
        'NEXT_PUBLIC_SITE_URL',
        'MIDTRANS_SERVER_KEY',
      ]),
    ).toEqual([]);
  });
});

describe('serverEnv', () => {
  it('parses booleans and key rings from the raw strings', () => {
    expect(serverEnv.MIDTRANS_IS_PRODUCTION).toBe(false);
    expect(Object.keys(serverEnv.QR_SIGNING_KEYS)).toEqual(['k1']);
  });
});
