import { afterEach, describe, expect, it, vi } from 'vitest';

import { findPublicEnvProblems } from './public-env';

const SAMPLE_NUMBER = '+6281200000000';
const OFFICIAL_LOOKING_NUMBER = '+6281234567890';

describe('findPublicEnvProblems', () => {
  it('refuses the sample WhatsApp number on production', () => {
    expect(
      findPublicEnvProblems({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: SAMPLE_NUMBER,
      }),
    ).toEqual([
      'NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER looks like a sample number; production needs the kelurahan number',
    ]);
  });

  it('accepts a real-looking number on production', () => {
    expect(
      findPublicEnvProblems({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: OFFICIAL_LOOKING_NUMBER,
      }),
    ).toEqual([]);
  });

  it('lets local, CI and preview builds use the sample', () => {
    for (const VERCEL_ENV of [undefined, 'development', 'preview'] as const) {
      expect(
        findPublicEnvProblems({ VERCEL_ENV, NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: SAMPLE_NUMBER }),
      ).toEqual([]);
    }
  });
});

// The schema itself, read fresh from the stubbed environment each time (tests/fixtures/env.ts is the base).
async function loadPublicEnv(overrides: Record<string, string>) {
  for (const [name, value] of Object.entries(overrides)) vi.stubEnv(name, value);
  vi.resetModules();
  const { publicEnv } = await import('./public-env');
  return publicEnv;
}

describe('publicEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the sandbox values and fills the defaults', async () => {
    const env = await loadPublicEnv({ NEXT_PUBLIC_SENTRY_DSN: '' });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toMatch(/^https?:\/\//);
    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined();
  });

  it('refuses a malformed URL, an empty key and a number that is not Indonesian mobile', async () => {
    await expect(loadPublicEnv({ NEXT_PUBLIC_SUPABASE_URL: 'not a url' })).rejects.toThrow();
    await expect(loadPublicEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: '' })).rejects.toThrow();
    await expect(
      loadPublicEnv({ NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: '+6221123456' }),
    ).rejects.toThrow();
  });

  it('refuses the sample WhatsApp number on a production build', async () => {
    await expect(
      loadPublicEnv({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: SAMPLE_NUMBER,
      }),
    ).rejects.toThrow();
    const env = await loadPublicEnv({
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: OFFICIAL_LOOKING_NUMBER,
    });
    expect(env.VERCEL_ENV).toBe('production');
  });
});
