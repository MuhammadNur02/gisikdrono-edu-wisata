import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { pepperedHash } from '@/lib/pepper';

import { sandboxEnv } from '../../tests/fixtures/env';

describe('pepperedHash', () => {
  const value = '203.0.113.7';

  it('is an HMAC under OTP_PEPPER of the label, a line break and the value', () => {
    const expected = createHmac('sha256', sandboxEnv.OTP_PEPPER)
      .update(`gsk-rate-limit-v1\n${value}`)
      .digest('hex');
    expect(pepperedHash('gsk-rate-limit-v1', value)).toBe(expected);
  });

  it('gives one value a different hash for every use, and none equals the unlabelled HMAC', () => {
    const labels = ['gsk-rate-limit-v1', 'gsk-otp-code-v1', 'gsk-log-email-v1'] as const;
    const hashes = labels.map((label) => pepperedHash(label, value));
    const unlabelled = createHmac('sha256', sandboxEnv.OTP_PEPPER).update(value).digest('hex');
    expect(new Set([...hashes, unlabelled]).size).toBe(labels.length + 1);
  });
});
