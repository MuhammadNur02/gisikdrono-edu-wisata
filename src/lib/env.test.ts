import { describe, expect, it } from 'vitest';

import { findEnvProblems, findLeakyPublicNames, serverEnv } from '@/lib/env';

const sandbox = {
  MIDTRANS_IS_PRODUCTION: false,
  MIDTRANS_SERVER_KEY: 'SB-Mid-server-abc',
  MIDTRANS_CLIENT_KEY: 'SB-Mid-client-abc',
  QR_SIGNING_KEYS: { k1: 'key' },
  QR_SIGNING_ACTIVE_KID: 'k1',
};

// Newer Midtrans sandbox accounts issue keys without the SB- prefix.
const currentSandbox = {
  ...sandbox,
  MIDTRANS_SERVER_KEY: 'Mid-server-abc',
  MIDTRANS_CLIENT_KEY: 'Mid-client-abc',
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
  it('accepts SB- sandbox keys on a local or preview deployment', () => {
    expect(findEnvProblems(sandbox)).toEqual([]);
    expect(findEnvProblems({ ...sandbox, VERCEL_ENV: 'preview' })).toEqual([]);
    expect(findEnvProblems({ ...sandbox, VERCEL_ENV: 'development' })).toEqual([]);
  });

  it('accepts the newer sandbox keys without SB- on a local or preview deployment', () => {
    expect(findEnvProblems(currentSandbox)).toEqual([]);
    expect(findEnvProblems({ ...currentSandbox, VERCEL_ENV: 'preview' })).toEqual([]);
  });

  it('accepts a sandbox rotation from one key format to the other', () => {
    expect(
      findEnvProblems({ ...currentSandbox, MIDTRANS_SERVER_KEY_PREVIOUS: 'SB-Mid-server-old' }),
    ).toEqual([]);
    expect(findEnvProblems({ ...sandbox, MIDTRANS_SERVER_KEY_PREVIOUS: 'Mid-server-old' })).toEqual(
      [],
    );
  });

  it('accepts live keys in production', () => {
    expect(findEnvProblems(production)).toEqual([]);
    expect(
      findEnvProblems({ ...production, MIDTRANS_SERVER_KEY_PREVIOUS: 'Mid-server-old' }),
    ).toEqual([]);
  });

  it('rejects every SB- key in production', () => {
    expect(findEnvProblems({ ...production, MIDTRANS_SERVER_KEY: 'SB-Mid-server-abc' })).toEqual([
      'MIDTRANS_SERVER_KEY must start with Mid-server- for Midtrans production',
    ]);
    expect(findEnvProblems({ ...production, MIDTRANS_CLIENT_KEY: 'SB-Mid-client-abc' })).toEqual([
      'MIDTRANS_CLIENT_KEY must start with Mid-client- for Midtrans production',
    ]);
    expect(
      findEnvProblems({ ...production, MIDTRANS_SERVER_KEY_PREVIOUS: 'SB-Mid-server-old' }),
    ).toEqual(['MIDTRANS_SERVER_KEY_PREVIOUS must start with Mid-server- for Midtrans production']);
  });

  it('rejects the sandbox flag in production even with live keys', () => {
    expect(findEnvProblems({ ...production, MIDTRANS_IS_PRODUCTION: false })).toEqual([
      'MIDTRANS_IS_PRODUCTION must be true when VERCEL_ENV is production',
    ]);
  });

  it('rejects the production flag outside production, whatever the key format', () => {
    expect(findEnvProblems({ ...production, VERCEL_ENV: 'preview' })).toEqual([
      'MIDTRANS_IS_PRODUCTION must be false when VERCEL_ENV is preview',
    ]);
    expect(findEnvProblems({ ...sandbox, MIDTRANS_IS_PRODUCTION: true })).toEqual([
      'MIDTRANS_IS_PRODUCTION must be false when VERCEL_ENV is unset',
    ]);
  });

  it('rejects a sandbox key with neither prefix, the previous key included', () => {
    const problems = findEnvProblems({
      ...sandbox,
      MIDTRANS_SERVER_KEY: 'Mid-client-abc',
      MIDTRANS_SERVER_KEY_PREVIOUS: 'server-old',
    });
    expect(problems).toEqual([
      'MIDTRANS_SERVER_KEY must start with SB-Mid-server- or Mid-server- for the Midtrans sandbox',
      'MIDTRANS_SERVER_KEY_PREVIOUS must start with SB-Mid-server- or Mid-server- for the Midtrans sandbox',
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
