import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { drawOtpCode, otpBrowserHash, otpCodeHash } from '@/lib/otp';

import { sandboxEnv } from '../../tests/fixtures/env';

describe('drawOtpCode', () => {
  it('draws six digits, leading zeros kept, and does not repeat itself', () => {
    const codes = Array.from({ length: 2000 }, drawOtpCode);
    expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(1900);
  });
});

describe('otpCodeHash and otpBrowserHash', () => {
  const BROWSER_ID = 'b3J5Lb6Qf0x1Zr2kq9WmTA';

  it('hashes a code under OTP_PEPPER with its own label and the browser it was sent to', () => {
    const expected = createHmac('sha256', sandboxEnv.OTP_PEPPER)
      .update(`gsk-otp-code-v1\n${BROWSER_ID}:482913`)
      .digest('hex');
    expect(otpCodeHash(BROWSER_ID, '482913')).toBe(expected);
  });

  it('gives the same code another hash in another browser, so a code typed elsewhere never matches', () => {
    expect(otpCodeHash(BROWSER_ID, '482913')).not.toBe(
      otpCodeHash('c4K6Mc7Rg1y2As3lr0XnUB', '482913'),
    );
  });

  it('keeps the browser id itself out of the database behind its own label', () => {
    const expected = createHmac('sha256', sandboxEnv.OTP_PEPPER)
      .update(`gsk-otp-browser-v1\n${BROWSER_ID}`)
      .digest('hex');
    expect(otpBrowserHash(BROWSER_ID)).toBe(expected);
  });
});
