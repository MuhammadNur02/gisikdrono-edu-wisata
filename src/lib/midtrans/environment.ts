import { z } from 'zod';

// CLAUDE.md §7.7: Midtrans runs two separate environments, and a key works on one of them only. The prefix no
// longer tells them apart: older sandbox accounts issue "SB-Mid-server-" keys, newer ones issue "Mid-server-"
// keys exactly like production. Production still refuses every "SB-" key; whether a "Mid-" key belongs to the
// sandbox or to production only the API can tell, which is what pnpm midtrans:check asks it.

const MIDTRANS_API_BASE_URLS = {
  sandbox: 'https://api.sandbox.midtrans.com',
  production: 'https://api.midtrans.com',
} as const;

// Snap, the hosted payment page, lives on its own host in each environment.
const MIDTRANS_SNAP_BASE_URLS = {
  sandbox: 'https://app.sandbox.midtrans.com',
  production: 'https://app.midtrans.com',
} as const;

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]']);

// "G" plus digits on older merchant accounts, "M" plus digits on newer ones.
export const MIDTRANS_MERCHANT_ID_PATTERN = /^[GM]\d+$/;

const LEGACY_SANDBOX_PREFIX = 'SB-';

type KeyKind = 'server' | 'client';

export type MidtransKeys = {
  serverKey: string;
  previousServerKey?: string | undefined;
  clientKey?: string | undefined;
};

export function midtransApiBaseUrl(isProduction: boolean): string {
  return isProduction ? MIDTRANS_API_BASE_URLS.production : MIDTRANS_API_BASE_URLS.sandbox;
}

export function midtransSnapBaseUrl(isProduction: boolean): string {
  return isProduction ? MIDTRANS_SNAP_BASE_URLS.production : MIDTRANS_SNAP_BASE_URLS.sandbox;
}

function isLoopbackUrl(address: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(address).hostname);
  } catch {
    return false;
  }
}

// Decision of 2026-10-24 (Q3): MIDTRANS_LOCAL_STUB_URL points Snap and the Status API at the stand-in of
// tests/fixtures/midtrans-stub.ts, for a local or CI server whose sandbox keys are fake. Every Vercel deployment
// refuses it, and so does any address but this machine's own, so no real payment is ever answered by a stub.
export function findLocalStubProblems(
  stubUrl: string | undefined,
  vercelEnv: string | undefined,
): string[] {
  if (stubUrl === undefined) return [];
  if (vercelEnv !== undefined) {
    return [
      `MIDTRANS_LOCAL_STUB_URL is for local and CI servers only; unset it where VERCEL_ENV is ${vercelEnv}`,
    ];
  }
  if (!isLoopbackUrl(stubUrl)) {
    return ['MIDTRANS_LOCAL_STUB_URL must point at 127.0.0.1, localhost or ::1'];
  }
  return [];
}

function acceptedKeyPrefixes(kind: KeyKind, isProduction: boolean): string[] {
  const currentPrefix = `Mid-${kind}-`;
  return isProduction
    ? [currentPrefix]
    : [`${LEGACY_SANDBOX_PREFIX}${currentPrefix}`, currentPrefix];
}

export function findMidtransKeyProblems(keys: MidtransKeys, isProduction: boolean): string[] {
  const environmentName = isProduction ? 'Midtrans production' : 'the Midtrans sandbox';
  const keysToCheck = [
    ['MIDTRANS_SERVER_KEY', keys.serverKey, 'server'],
    ['MIDTRANS_SERVER_KEY_PREVIOUS', keys.previousServerKey, 'server'],
    ['MIDTRANS_CLIENT_KEY', keys.clientKey, 'client'],
  ] as const;

  return keysToCheck.flatMap(([name, value, kind]) => {
    if (value === undefined) return [];
    const prefixes = acceptedKeyPrefixes(kind, isProduction);
    if (prefixes.some((prefix) => value.startsWith(prefix))) return [];
    return [`${name} must start with ${prefixes.join(' or ')} for ${environmentName}`];
  });
}

// The Status API puts its own code in the body as a string ("404"), next to the HTTP status.
const statusAnswerSchema = z.object({
  status_code: z.string().optional(),
  status_message: z.string().optional(),
});

const UNKNOWN_ORDER_CODE = '404';
const UNKNOWN_ORDER_MESSAGE = /doesn't exist/i;
const UNKNOWN_MERCHANT_CODE = '401';

export type KeyCheckAnswer = {
  outcome: 'key_matches' | 'key_refused' | 'unexpected';
  statusCode: string;
  statusMessage: string;
};

// Reads the answer to a status request for an order that cannot exist. "Transaction doesn't exist" means the
// API knew the key and looked the order up, so the key belongs to that environment. 401 means that host does not
// know the key: usually it comes from the other environment, but a mistyped or revoked key gets 401 as well.
export function readKeyCheckAnswer(httpStatus: number, body: unknown): KeyCheckAnswer {
  const parsed = statusAnswerSchema.safeParse(body);
  const answer = parsed.success ? parsed.data : {};
  const statusCode = answer.status_code ?? String(httpStatus);
  const statusMessage = answer.status_message ?? '';

  if (statusCode === UNKNOWN_ORDER_CODE && UNKNOWN_ORDER_MESSAGE.test(statusMessage)) {
    return { outcome: 'key_matches', statusCode, statusMessage };
  }
  if (statusCode === UNKNOWN_MERCHANT_CODE) {
    return { outcome: 'key_refused', statusCode, statusMessage };
  }
  return { outcome: 'unexpected', statusCode, statusMessage };
}
