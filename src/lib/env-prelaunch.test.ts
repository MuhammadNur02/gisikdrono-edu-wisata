import { afterEach, describe, expect, it, vi } from 'vitest';

import { findEnvProblems } from '@/lib/env';

import { prelaunchProductionEnv } from '../../tests/fixtures/env';

// docs/Security.md §8.9: the env matrix of the pre-launch flag. Every combination of production or preview, flag on
// or off, and the Midtrans and WhatsApp credentials present, absent or sandbox ones. The flag may relax a missing
// credential on a production deployment only, and nothing else: a key that is present keeps every check, and a
// launched production (flag off or unset) demands each credential exactly as before.

const VALUES_EVERY_DEPLOYMENT_NEEDS = {
  QR_SIGNING_KEYS: { k1: 'key' },
  QR_SIGNING_ACTIVE_KID: 'k1',
  TURNSTILE_SECRET_KEY: '0x4AAAAAAAsiteOwnSecretForTests',
};

const LIVE_CREDENTIALS = {
  MIDTRANS_SERVER_KEY: 'Mid-server-abc',
  MIDTRANS_CLIENT_KEY: 'Mid-client-abc',
  MIDTRANS_MERCHANT_ID: 'G000000000',
  MIDTRANS_WEBHOOK_PATH_TOKEN: 'not-a-secret',
  WHATSAPP_ACCESS_TOKEN: 'not-a-secret',
  WHATSAPP_PHONE_NUMBER_ID: '123',
  WHATSAPP_APP_SECRET: 'not-a-secret',
  WHATSAPP_VERIFY_TOKEN: 'not-a-secret',
};

const SANDBOX_KEYS = {
  MIDTRANS_SERVER_KEY: 'SB-Mid-server-abc',
  MIDTRANS_CLIENT_KEY: 'SB-Mid-client-abc',
};

const NO_CREDENTIALS = {
  MIDTRANS_SERVER_KEY: undefined,
  MIDTRANS_CLIENT_KEY: undefined,
  MIDTRANS_MERCHANT_ID: undefined,
  MIDTRANS_WEBHOOK_PATH_TOKEN: undefined,
  WHATSAPP_ACCESS_TOKEN: undefined,
  WHATSAPP_PHONE_NUMBER_ID: undefined,
  WHATSAPP_APP_SECRET: undefined,
  WHATSAPP_VERIFY_TOKEN: undefined,
};

const REQUIRED_EVERYWHERE = [
  'MIDTRANS_SERVER_KEY is required',
  'MIDTRANS_CLIENT_KEY is required',
  'MIDTRANS_MERCHANT_ID is required',
  'MIDTRANS_WEBHOOK_PATH_TOKEN is required',
  'WHATSAPP_VERIFY_TOKEN is required',
];
const REQUIRED_IN_PRODUCTION = [
  'WHATSAPP_ACCESS_TOKEN is required in production',
  'WHATSAPP_PHONE_NUMBER_ID is required in production',
  'WHATSAPP_APP_SECRET is required in production',
];
const SANDBOX_KEYS_IN_PRODUCTION = [
  'MIDTRANS_SERVER_KEY must start with Mid-server- for Midtrans production',
  'MIDTRANS_CLIENT_KEY must start with Mid-client- for Midtrans production',
];

type Flag = 'on' | 'off' | undefined;
const FLAG_ON: Flag = 'on';
const FLAGS_OFF: Flag[] = ['off', undefined];

function production(flag: Flag, credentials: Record<string, string | undefined>) {
  return {
    ...VALUES_EVERY_DEPLOYMENT_NEEDS,
    ...LIVE_CREDENTIALS,
    ...credentials,
    VERCEL_ENV: 'production' as const,
    NEXT_PUBLIC_FLAG_PRELAUNCH: flag,
    MIDTRANS_IS_PRODUCTION: true,
  };
}

function preview(flag: Flag, credentials: Record<string, string | undefined>) {
  return {
    ...production(flag, credentials),
    VERCEL_ENV: 'preview' as const,
    MIDTRANS_IS_PRODUCTION: false,
  };
}

describe('findEnvProblems on production with the pre-launch flag on', () => {
  it('starts with no Midtrans and no WhatsApp credentials at all', () => {
    expect(findEnvProblems(production(FLAG_ON, NO_CREDENTIALS))).toEqual([]);
  });

  it('accepts live keys when they are already there', () => {
    expect(findEnvProblems(production(FLAG_ON, {}))).toEqual([]);
  });

  it('still refuses every SB- key that is present', () => {
    expect(findEnvProblems(production(FLAG_ON, { ...NO_CREDENTIALS, ...SANDBOX_KEYS }))).toEqual(
      SANDBOX_KEYS_IN_PRODUCTION,
    );
    expect(
      findEnvProblems(
        production(FLAG_ON, {
          ...NO_CREDENTIALS,
          MIDTRANS_SERVER_KEY_PREVIOUS: 'SB-Mid-server-old',
        }),
      ),
    ).toEqual(['MIDTRANS_SERVER_KEY_PREVIOUS must start with Mid-server- for Midtrans production']);
  });

  it('still demands MIDTRANS_IS_PRODUCTION=true', () => {
    expect(
      findEnvProblems({ ...production(FLAG_ON, NO_CREDENTIALS), MIDTRANS_IS_PRODUCTION: false }),
    ).toEqual(['MIDTRANS_IS_PRODUCTION must be true when VERCEL_ENV is production']);
  });

  it('relaxes nothing else: the QR key ring and the Turnstile secret keep their checks', () => {
    const values = production(FLAG_ON, NO_CREDENTIALS);
    expect(findEnvProblems({ ...values, QR_SIGNING_ACTIVE_KID: 'k2' })).toEqual([
      'QR_SIGNING_ACTIVE_KID must name a kid that exists in QR_SIGNING_KEYS',
    ]);
    expect(
      findEnvProblems({ ...values, TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' }),
    ).toHaveLength(1);
  });
});

// The guard against misuse: pre-launch can never weaken a launched production.
describe('findEnvProblems on a launched production (flag off or unset)', () => {
  it('demands every Midtrans and WhatsApp credential, as before the flag existed', () => {
    for (const flag of FLAGS_OFF) {
      expect(findEnvProblems(production(flag, NO_CREDENTIALS))).toEqual([
        ...REQUIRED_EVERYWHERE,
        ...REQUIRED_IN_PRODUCTION,
      ]);
      expect(findEnvProblems(production(flag, {}))).toEqual([]);
    }
  });

  it('names each missing credential on its own', () => {
    for (const flag of FLAGS_OFF) {
      for (const name of Object.keys(NO_CREDENTIALS)) {
        const problems = findEnvProblems(production(flag, { [name]: undefined }));
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(new RegExp(`^${name} is required`));
      }
    }
  });

  it('refuses SB- keys and a sandbox MIDTRANS_IS_PRODUCTION', () => {
    for (const flag of FLAGS_OFF) {
      expect(findEnvProblems(production(flag, SANDBOX_KEYS))).toEqual(SANDBOX_KEYS_IN_PRODUCTION);
      expect(
        findEnvProblems({ ...production(flag, {}), MIDTRANS_IS_PRODUCTION: false }),
      ).toHaveLength(1);
    }
  });
});

// Staging and previews do not change at all, whatever the flag says.
describe('findEnvProblems on a preview or a local server', () => {
  it('demands the Midtrans credentials and the verify token with the flag on, off or unset', () => {
    for (const flag of [FLAG_ON, ...FLAGS_OFF]) {
      expect(findEnvProblems(preview(flag, NO_CREDENTIALS))).toEqual(REQUIRED_EVERYWHERE);
      const local = { ...preview(flag, NO_CREDENTIALS), VERCEL_ENV: undefined };
      expect(findEnvProblems(local)).toEqual(REQUIRED_EVERYWHERE);
    }
  });

  it('accepts sandbox keys and leaves WhatsApp optional with the flag on, off or unset', () => {
    const withoutWhatsApp = {
      ...SANDBOX_KEYS,
      WHATSAPP_ACCESS_TOKEN: undefined,
      WHATSAPP_PHONE_NUMBER_ID: undefined,
      WHATSAPP_APP_SECRET: undefined,
    };
    for (const flag of [FLAG_ON, ...FLAGS_OFF]) {
      expect(findEnvProblems(preview(flag, withoutWhatsApp))).toEqual([]);
    }
  });

  it('refuses MIDTRANS_IS_PRODUCTION=true with the flag on as well', () => {
    expect(findEnvProblems({ ...preview(FLAG_ON, {}), MIDTRANS_IS_PRODUCTION: true })).toEqual([
      'MIDTRANS_IS_PRODUCTION must be false when VERCEL_ENV is preview',
    ]);
  });
});

// The schema end to end, read fresh from the stubbed environment (tests/fixtures/env.ts is the base): production as a
// Vercel build of the pre-launch phase would see it.
async function loadServerEnv(overrides: Record<string, string>) {
  for (const [name, value] of Object.entries(overrides)) vi.stubEnv(name, value);
  vi.resetModules();
  const { serverEnv } = await import('@/lib/env');
  return serverEnv;
}

// Each case sets the flag itself.
const PRODUCTION_WITHOUT_PAYMENTS: Record<string, string> = prelaunchProductionEnv;

describe('serverEnv on a production build', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('starts in pre-launch without Midtrans, WhatsApp or the image transformer', async () => {
    const env = await loadServerEnv({
      ...PRODUCTION_WITHOUT_PAYMENTS,
      NEXT_PUBLIC_FLAG_PRELAUNCH: 'on',
    });
    expect(env.MIDTRANS_SERVER_KEY).toBeUndefined();
    expect(env.MIDTRANS_IS_PRODUCTION).toBe(true);
  });

  it('refuses to start the same environment once the flag is off, unset or misspelt', async () => {
    for (const flag of ['off', '', 'yes']) {
      await expect(
        loadServerEnv({ ...PRODUCTION_WITHOUT_PAYMENTS, NEXT_PUBLIC_FLAG_PRELAUNCH: flag }),
      ).rejects.toThrow();
    }
  });

  it('refuses a sandbox key in pre-launch too', async () => {
    await expect(
      loadServerEnv({
        ...PRODUCTION_WITHOUT_PAYMENTS,
        NEXT_PUBLIC_FLAG_PRELAUNCH: 'on',
        MIDTRANS_SERVER_KEY: 'SB-Mid-server-fixture',
      }),
    ).rejects.toThrow();
  });
});
