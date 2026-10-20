import 'server-only';

import { isIP } from 'node:net';

import { z } from 'zod';

import { TURNSTILE_MAX_TOKEN_AGE_SECONDS, TURNSTILE_TIMEOUT_MS } from '@/config/auth';
import { serverEnv } from '@/lib/env';
import { publicEnv } from '@/lib/public-env';

// docs/Security.md §4.3 and AUTH-06: the one place a Turnstile token is checked with Cloudflare. A token is good
// once, so a form whose token Supabase Auth checks itself (sign-in, the reset email) never comes here.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MS_PER_SECOND = 1000;

const siteverifySchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  challenge_ts: z.string().optional(),
  metadata: z.object({ result_with_testing_key: z.boolean().optional() }).optional(),
});

type SiteverifyResult = z.infer<typeof siteverifySchema>;

// Cloudflare's testing keys pass every token and report example.com, which is fine anywhere but production.
function isOurHostname(result: SiteverifyResult): boolean {
  if (result.metadata?.result_with_testing_key === true) {
    return publicEnv.VERCEL_ENV !== 'production';
  }
  return result.hostname === new URL(publicEnv.NEXT_PUBLIC_SITE_URL).hostname;
}

function isFresh(challengeTs: string | undefined, nowMs: number): boolean {
  const issuedAtMs = challengeTs === undefined ? Number.NaN : Date.parse(challengeTs);
  return (
    Number.isFinite(issuedAtMs) &&
    nowMs - issuedAtMs <= TURNSTILE_MAX_TOKEN_AGE_SECONDS * MS_PER_SECOND
  );
}

async function askCloudflare(token: string, remoteIp: string): Promise<unknown> {
  const body = new URLSearchParams({ secret: serverEnv.TURNSTILE_SECRET_KEY, response: token });
  // A request seen through no proxy has no client address; Cloudflare refuses a malformed one.
  if (isIP(remoteIp) !== 0) body.set('remoteip', remoteIp);
  const response = await fetch(SITEVERIFY_URL, {
    method: 'POST',
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
  });
  return response.json();
}

// True only when Cloudflare says the token is valid, was issued for this site and is under five minutes old.
// Cloudflare out of reach, a timeout or an answer of another shape refuses the form (fail-closed, RL-04).
export async function verifyTurnstile(token: string, remoteIp: string): Promise<boolean> {
  try {
    const result = siteverifySchema.safeParse(await askCloudflare(token, remoteIp));
    return (
      result.success &&
      result.data.success &&
      isOurHostname(result.data) &&
      isFresh(result.data.challenge_ts, Date.now())
    );
  } catch {
    return false;
  }
}
