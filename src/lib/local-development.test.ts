import { describe, expect, it } from 'vitest';

import { isLocalDevelopment, messageDelivery, type DeploymentFacts } from '@/lib/local-development';

const LAPTOP: DeploymentFacts = {
  nodeEnv: 'development',
  vercelEnv: undefined,
  siteUrl: 'http://127.0.0.1:3000',
  supabaseUrl: 'http://127.0.0.1:54321',
};

describe('isLocalDevelopment', () => {
  it('is true only for `next dev` on a laptop with the local Supabase', () => {
    expect(isLocalDevelopment(LAPTOP)).toBe(true);
    expect(isLocalDevelopment({ ...LAPTOP, siteUrl: 'http://localhost:3000' })).toBe(true);
  });

  it.each<[string, Partial<DeploymentFacts>]>([
    ['a production build', { nodeEnv: 'production' }],
    ['the test runner', { nodeEnv: 'test' }],
    ['a Vercel production deployment', { vercelEnv: 'production' }],
    ['a Vercel preview (staging)', { vercelEnv: 'preview' }],
    ['vercel dev with remote variables', { vercelEnv: 'development' }],
    ['a dev server on the staging Supabase', { supabaseUrl: 'https://abcdefgh.supabase.co' }],
    ['a dev server reached under a public address', { siteUrl: 'https://staging.gisikdrono.id' }],
    ['a look-alike host', { supabaseUrl: 'http://127.0.0.1.evil.example' }],
    ['an address that is no URL', { siteUrl: 'not a url' }],
  ])('is false for %s', (_case, change) => {
    expect(isLocalDevelopment({ ...LAPTOP, ...change })).toBe(false);
  });

  it('is false for the environment this test suite runs in', () => {
    expect(isLocalDevelopment()).toBe(false);
  });
});

// Independent review of PR #50, M1: only a Vercel preview or production deployment reaches Meta and Resend.
describe('messageDelivery', () => {
  const HOSTED_SUPABASE = 'https://abcdefgh.supabase.co';

  it.each<[string, Partial<DeploymentFacts>, ReturnType<typeof messageDelivery>]>([
    ['CI: a production build on the local stack', { nodeEnv: 'production' }, 'mailpit'],
    ['`pnpm start` on a laptop, real keys or not', { nodeEnv: 'production' }, 'mailpit'],
    ['`next dev` on a laptop', {}, 'mailpit'],
    [
      'a laptop server on the hosted Supabase',
      { nodeEnv: 'production', supabaseUrl: HOSTED_SUPABASE },
      'none',
    ],
    [
      'vercel dev with remote variables',
      { vercelEnv: 'development', supabaseUrl: HOSTED_SUPABASE },
      'none',
    ],
    [
      'a Vercel preview (staging)',
      { nodeEnv: 'production', vercelEnv: 'preview', supabaseUrl: HOSTED_SUPABASE },
      'live',
    ],
    [
      'Vercel production',
      { nodeEnv: 'production', vercelEnv: 'production', supabaseUrl: HOSTED_SUPABASE },
      'live',
    ],
  ])('%s', (_case, change, delivery) => {
    expect(messageDelivery({ ...LAPTOP, ...change })).toBe(delivery);
  });
});
