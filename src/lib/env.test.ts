import { describe, expect, it } from 'vitest';

import { findEnvProblems, findLeakyPublicNames, serverEnv } from '@/lib/env';

const sandbox = {
  MIDTRANS_IS_PRODUCTION: false,
  MIDTRANS_SERVER_KEY: 'SB-Mid-server-abc',
  MIDTRANS_CLIENT_KEY: 'SB-Mid-client-abc',
  QR_SIGNING_KEYS: { k1: 'key' },
  QR_SIGNING_ACTIVE_KID: 'k1',
  TURNSTILE_SECRET_KEY: '0x4AAAAAAAsiteOwnSecretForTests',
};

// Cloudflare's published test secrets: always pass, always fail, and "token already spent".
const TURNSTILE_TEST_SECRETS = [
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
];

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
  it("lets a local or CI server use Cloudflare's Turnstile test secrets", () => {
    for (const VERCEL_ENV of [undefined, 'development'] as const) {
      for (const TURNSTILE_SECRET_KEY of TURNSTILE_TEST_SECRETS) {
        expect(findEnvProblems({ ...sandbox, VERCEL_ENV, TURNSTILE_SECRET_KEY })).toEqual([]);
      }
    }
  });

  // Review of PR #20 (info): a test secret passes every visitor, so on a deployment it would switch Turnstile off.
  it('refuses them on preview and production', () => {
    for (const TURNSTILE_SECRET_KEY of TURNSTILE_TEST_SECRETS) {
      expect(findEnvProblems({ ...sandbox, VERCEL_ENV: 'preview', TURNSTILE_SECRET_KEY })).toEqual([
        "TURNSTILE_SECRET_KEY is one of Cloudflare's test keys, which let every visitor through; preview needs the site's own secret",
      ]);
      expect(findEnvProblems({ ...production, TURNSTILE_SECRET_KEY })).toEqual([
        "TURNSTILE_SECRET_KEY is one of Cloudflare's test keys, which let every visitor through; production needs the site's own secret",
      ]);
    }
  });

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

  it('refuses the Midtrans stub on a Vercel deployment and off this machine', () => {
    expect(
      findEnvProblems({ ...sandbox, MIDTRANS_LOCAL_STUB_URL: 'http://127.0.0.1:4010' }),
    ).toEqual([]);
    expect(
      findEnvProblems({
        ...sandbox,
        VERCEL_ENV: 'preview',
        MIDTRANS_LOCAL_STUB_URL: 'http://127.0.0.1:4010',
      }),
    ).toHaveLength(1);
    expect(
      findEnvProblems({ ...sandbox, MIDTRANS_LOCAL_STUB_URL: 'https://stub.example.test' }),
    ).toHaveLength(1);
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
