import { afterEach, describe, expect, it, vi } from 'vitest';

import { findPublicEnvProblems } from './public-env';

const SAMPLE_NUMBER = '+6281200000000';
const OFFICIAL_LOOKING_NUMBER = '+6281234567890';
const SITE_KEY = '0x4AAAAAAAsiteOwnKey';
// Cloudflare's published test site keys: pass, block, pass invisibly, block invisibly, always ask.
const TURNSTILE_TEST_SITE_KEYS = [
  '1x00000000000000000000AA',
  '2x00000000000000000000AB',
  '1x00000000000000000000BB',
  '2x00000000000000000000BB',
  '3x00000000000000000000FF',
];

describe('findPublicEnvProblems', () => {
  it('refuses the sample WhatsApp number on production', () => {
    expect(
      findPublicEnvProblems({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: SAMPLE_NUMBER,
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: SITE_KEY,
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
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: SITE_KEY,
      }),
    ).toEqual([]);
  });

  it('lets local, CI and preview builds use the sample', () => {
    for (const VERCEL_ENV of [undefined, 'development', 'preview'] as const) {
      expect(
        findPublicEnvProblems({
          VERCEL_ENV,
          NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: SAMPLE_NUMBER,
          NEXT_PUBLIC_TURNSTILE_SITE_KEY: SITE_KEY,
        }),
      ).toEqual([]);
    }
  });

  it("lets local and CI builds use Cloudflare's test site keys", () => {
    for (const VERCEL_ENV of [undefined, 'development'] as const) {
      for (const NEXT_PUBLIC_TURNSTILE_SITE_KEY of TURNSTILE_TEST_SITE_KEYS) {
        expect(
          findPublicEnvProblems({
            VERCEL_ENV,
            NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: OFFICIAL_LOOKING_NUMBER,
            NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          }),
        ).toEqual([]);
      }
    }
  });

  // Review of PR #20 (info): a test site key renders a widget that every visitor passes.
  it('refuses them on preview and production builds', () => {
    for (const VERCEL_ENV of ['preview', 'production'] as const) {
      for (const NEXT_PUBLIC_TURNSTILE_SITE_KEY of TURNSTILE_TEST_SITE_KEYS) {
        expect(
          findPublicEnvProblems({
            VERCEL_ENV,
            NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: OFFICIAL_LOOKING_NUMBER,
            NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          }),
        ).toEqual([
          `NEXT_PUBLIC_TURNSTILE_SITE_KEY is one of Cloudflare's test keys, which let every visitor through; ${VERCEL_ENV} needs the site's own key`,
        ]);
      }
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
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: SITE_KEY,
    });
    expect(env.VERCEL_ENV).toBe('production');
  });

  it('reads the pre-launch flag, and refuses a value that is neither on nor off', async () => {
    expect(
      (await loadPublicEnv({ NEXT_PUBLIC_FLAG_PRELAUNCH: 'on' })).NEXT_PUBLIC_FLAG_PRELAUNCH,
    ).toBe('on');
    expect(
      (await loadPublicEnv({ NEXT_PUBLIC_FLAG_PRELAUNCH: '' })).NEXT_PUBLIC_FLAG_PRELAUNCH,
    ).toBeUndefined();
    await expect(loadPublicEnv({ NEXT_PUBLIC_FLAG_PRELAUNCH: 'yes' })).rejects.toThrow();
  });

  it("refuses Cloudflare's test site key on a production build", async () => {
    await expect(
      loadPublicEnv({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: OFFICIAL_LOOKING_NUMBER,
      }),
    ).rejects.toThrow();
  });
});

describe('findPublicEnvProblems and NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS', () => {
  const values = {
    NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: OFFICIAL_LOOKING_NUMBER,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: SITE_KEY,
  };

  it('refuses images without the transformer on a launched production', () => {
    for (const NEXT_PUBLIC_FLAG_PRELAUNCH of [undefined, 'off'] as const) {
      expect(
        findPublicEnvProblems({
          ...values,
          VERCEL_ENV: 'production',
          NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS: 'off',
          NEXT_PUBLIC_FLAG_PRELAUNCH,
        }),
      ).toEqual([
        'NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS=off is for a Free-plan project (staging, or production in pre-launch); a launched production resizes images',
      ]);
    }
  });

  // docs/Security.md §8.9: pre-launch production runs on Supabase Free, which has no transformer.
  it('lets a pre-launch production switch the transformer off', () => {
    expect(
      findPublicEnvProblems({
        ...values,
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS: 'off',
        NEXT_PUBLIC_FLAG_PRELAUNCH: 'on',
      }),
    ).toEqual([]);
  });

  it('relaxes nothing else on a pre-launch production', () => {
    expect(
      findPublicEnvProblems({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: SAMPLE_NUMBER,
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
        NEXT_PUBLIC_FLAG_PRELAUNCH: 'on',
      }),
    ).toHaveLength(2);
  });

  it('lets production keep the transformer, by default or explicitly', () => {
    for (const NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS of [undefined, 'on'] as const) {
      expect(
        findPublicEnvProblems({
          ...values,
          VERCEL_ENV: 'production',
          NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS,
        }),
      ).toEqual([]);
    }
  });

  it('lets a preview, such as the Free-plan staging site, switch the transformer off', () => {
    for (const VERCEL_ENV of [undefined, 'development', 'preview'] as const) {
      expect(
        findPublicEnvProblems({ ...values, VERCEL_ENV, NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS: 'off' }),
      ).toEqual([]);
    }
  });
});
