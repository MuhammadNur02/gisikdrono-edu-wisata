import { describe, expect, it } from 'vitest';

import { serverEnv } from '@/lib/env';

import { hasValidCronSecret } from './cron-secret';

describe('hasValidCronSecret', () => {
  it('accepts the bearer token pg_cron sends', () => {
    expect(hasValidCronSecret(`Bearer ${serverEnv.CRON_SECRET}`)).toBe(true);
  });

  it.each([
    ['no header', null],
    ['an empty header', ''],
    ['the secret without the Bearer scheme', serverEnv.CRON_SECRET],
    ['a lower-case scheme', `bearer ${serverEnv.CRON_SECRET}`],
    ['another secret', 'Bearer not-the-cron-secret'],
    ['the secret with a trailing space', `Bearer ${serverEnv.CRON_SECRET} `],
    ['a prefix of the secret', `Bearer ${serverEnv.CRON_SECRET.slice(0, 10)}`],
  ])('refuses %s', (_case, authorization) => {
    expect(hasValidCronSecret(authorization)).toBe(false);
  });
});
