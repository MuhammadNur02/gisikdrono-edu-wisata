import { afterEach, describe, expect, it, vi } from 'vitest';

// verifyTurnstile against Cloudflare itself (Task P3.2.02, docs/Security.md RL-04), with Cloudflare's published
// testing secret keys: one passes every token, the other fails every token. The dummy token is the one Cloudflare
// documents for them. The module is loaded after the key is set, because src/lib/env.ts reads the environment once.
const ALWAYS_PASSES = '1x0000000000000000000000000000000AA';
const ALWAYS_FAILS = '2x0000000000000000000000000000000AA';
const DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

async function verifyWithSecret(secret: string): Promise<boolean> {
  vi.stubEnv('TURNSTILE_SECRET_KEY', secret);
  vi.resetModules();
  const { verifyTurnstile } = await import('@/lib/turnstile');
  return verifyTurnstile(DUMMY_TOKEN, '203.0.113.7', 'otp_request');
}

describe('verifyTurnstile with Cloudflare', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a token Cloudflare accepts', async () => {
    await expect(verifyWithSecret(ALWAYS_PASSES)).resolves.toBe(true);
  });

  it('refuses a token Cloudflare refuses', async () => {
    await expect(verifyWithSecret(ALWAYS_FAILS)).resolves.toBe(false);
  });
});
