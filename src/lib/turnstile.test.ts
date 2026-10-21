import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { verifyTurnstile } from './turnstile';

const deployment = vi.hoisted(() => ({ vercelEnv: undefined as string | undefined }));

vi.mock('@/lib/public-env', async (importOriginal) => {
  const actual = await importOriginal<{ publicEnv: Record<string, unknown> }>();
  return {
    ...actual,
    publicEnv: new Proxy(actual.publicEnv, {
      get: (target, name) =>
        name === 'VERCEL_ENV' ? deployment.vercelEnv : target[name as string],
    }),
  };
});

const NOW = new Date('2026-10-20T03:00:00Z');
const ONE_MINUTE_AGO = '2026-10-20T02:59:00.000Z';
const SIX_MINUTES_AGO = '2026-10-20T02:54:00.000Z';

const fetchMock = vi.fn<typeof fetch>();

function cloudflareAnswers(body: unknown) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
}

function sentForm(): URLSearchParams {
  const body = fetchMock.mock.calls[0]?.[1]?.body;
  return body instanceof URLSearchParams ? body : new URLSearchParams();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  deployment.vercelEnv = undefined;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('verifyTurnstile', () => {
  it('accepts a fresh token issued for this site, sending the secret and the visitor IP', async () => {
    cloudflareAnswers({
      success: true,
      hostname: '127.0.0.1',
      challenge_ts: ONE_MINUTE_AGO,
      action: 'mfa_verify',
    });

    await expect(verifyTurnstile('token-1', '203.0.113.7', 'mfa_verify')).resolves.toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    );
    expect(Object.fromEntries(sentForm())).toEqual({
      secret: '1x0000000000000000000000000000000AA',
      response: 'token-1',
      remoteip: '203.0.113.7',
    });
  });

  it('leaves out an address that is not an IP', async () => {
    cloudflareAnswers({
      success: true,
      hostname: '127.0.0.1',
      challenge_ts: ONE_MINUTE_AGO,
      action: 'mfa_verify',
    });

    await verifyTurnstile('token-1', 'unknown', 'mfa_verify');

    expect(sentForm().has('remoteip')).toBe(false);
  });

  it.each([
    ['Cloudflare says no', { success: false, 'error-codes': ['invalid-input-response'] }],
    [
      'the token was issued for another site',
      { success: true, hostname: 'evil.test', challenge_ts: ONE_MINUTE_AGO },
    ],
    [
      'the token is over five minutes old',
      { success: true, hostname: '127.0.0.1', challenge_ts: SIX_MINUTES_AGO },
    ],
    [
      'the answer has no issue time',
      { success: true, hostname: '127.0.0.1', action: 'mfa_verify' },
    ],
    [
      'the token was made for another form',
      { success: true, hostname: '127.0.0.1', challenge_ts: ONE_MINUTE_AGO, action: 'login' },
    ],
    [
      'the answer names no form',
      { success: true, hostname: '127.0.0.1', challenge_ts: ONE_MINUTE_AGO },
    ],
    ['the answer has another shape', { ok: 'yes' }],
  ])('refuses when %s', async (_case, answer) => {
    cloudflareAnswers(answer);

    await expect(verifyTurnstile('token-1', '203.0.113.7', 'mfa_verify')).resolves.toBe(false);
  });

  it('refuses when Cloudflare cannot be reached in time', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'));

    await expect(verifyTurnstile('token-1', '203.0.113.7', 'mfa_verify')).resolves.toBe(false);
  });

  // Cloudflare's testing keys answer without an action, so the form cannot be checked; src/lib/env.ts refuses them on
  // every deployment, and this refuses their answers there too (review of PR #20, info).
  it('takes a testing-key answer on a local or CI server only', async () => {
    const testingAnswer = {
      success: true,
      hostname: 'example.com',
      challenge_ts: ONE_MINUTE_AGO,
      metadata: { result_with_testing_key: true },
    };
    cloudflareAnswers(testingAnswer);
    await expect(verifyTurnstile('token-1', '203.0.113.7', 'mfa_verify')).resolves.toBe(true);

    for (const vercelEnv of ['preview', 'production']) {
      deployment.vercelEnv = vercelEnv;
      cloudflareAnswers(testingAnswer);
      await expect(verifyTurnstile('token-1', '203.0.113.7', 'mfa_verify')).resolves.toBe(false);
    }
  });
});
