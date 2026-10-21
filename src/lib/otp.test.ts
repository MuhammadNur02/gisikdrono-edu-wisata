import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { drawOtpCode, otpCodeHash } from '@/lib/otp';

import { sandboxEnv } from '../../tests/fixtures/env';

describe('drawOtpCode', () => {
  it('draws six digits, leading zeros kept, and does not repeat itself', () => {
    const codes = Array.from({ length: 2000 }, drawOtpCode);
    expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(1900);
  });
});

describe('otpCodeHash', () => {
  const OTP_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000aa';

  it('is an HMAC under OTP_PEPPER over its own label, the OTP id and the code', () => {
    const expected = createHmac('sha256', sandboxEnv.OTP_PEPPER)
      .update(`gsk-otp-code-v1\n${OTP_ID}:482913`)
      .digest('hex');
    expect(otpCodeHash(OTP_ID, '482913')).toBe(expected);
  });

  it('differs for the same code under another OTP, so a code cannot be replayed across rows', () => {
    expect(otpCodeHash(OTP_ID, '482913')).not.toBe(
      otpCodeHash('0192f3a4-5b6c-7d8e-9f01-0000000000bb', '482913'),
    );
  });
});
