import { describe, expect, it } from 'vitest';

import { PHONE_PROOF_TTL_SECONDS } from '@/config/guest';
import { sign } from '@/lib/links/hmac';
import { readPhoneProof, signPhoneProof } from '@/lib/links/phone-proof';

const NOW = 1_790_000_000;
const OTP_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
// The keyed hash of the gsk_otp_browser id (src/lib/otp.ts), as guest-cookies.ts hands it in.
const THIS_BROWSER = 'a'.repeat(64);
const AT_NOW = { browserHash: THIS_BROWSER, nowSeconds: NOW };
const WHATSAPP_PROOF = {
  channel: 'whatsapp' as const,
  phone: '+6281234567890',
  email: null,
  otpId: OTP_ID,
};

describe('signPhoneProof and readPhoneProof', () => {
  it('reads back what it signed for 30 minutes', async () => {
    const { value, maxAge } = await signPhoneProof(WHATSAPP_PROOF, AT_NOW);
    expect(maxAge).toBe(PHONE_PROOF_TTL_SECONDS);
    await expect(
      readPhoneProof(value, { ...AT_NOW, nowSeconds: NOW + maxAge - 1 }),
    ).resolves.toEqual({ ...WHATSAPP_PROOF, expiresAt: NOW + PHONE_PROOF_TTL_SECONDS });
    await expect(
      readPhoneProof(value, { ...AT_NOW, nowSeconds: NOW + maxAge }),
    ).resolves.toBeNull();
  });

  // Review of PR #27, L8: the cookie copied into another browser proves nothing there.
  it('reads back only in the browser that entered the code', async () => {
    const { value } = await signPhoneProof(WHATSAPP_PROOF, AT_NOW);
    await expect(
      readPhoneProof(value, { ...AT_NOW, browserHash: 'b'.repeat(64) }),
    ).resolves.toBeNull();
  });

  it('keeps an email proof apart from a WhatsApp one', async () => {
    const { value } = await signPhoneProof(
      { channel: 'email', phone: '+6281234567890', email: 'ani@sekolah.sch.id', otpId: OTP_ID },
      AT_NOW,
    );
    expect((await readPhoneProof(value, AT_NOW))?.channel).toBe('email');
  });

  it('holds the longest address an email field takes', async () => {
    const longest = `${'a'.repeat(64)}@${'b'.repeat(185)}.id`;
    const { value } = await signPhoneProof({ ...WHATSAPP_PROOF, email: longest }, AT_NOW);
    expect((await readPhoneProof(value, AT_NOW))?.email).toBe(longest);
  });

  it.each([
    ['number', { p: '+6289999999999' }],
    ['browser', { b: 'b'.repeat(64) }],
  ])('refuses a proof whose %s was changed after signing', async (_field, change) => {
    const { value } = await signPhoneProof(WHATSAPP_PROOF, AT_NOW);
    const [payload = '', signature = ''] = value.split('.');
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const swapped = Buffer.from(JSON.stringify({ ...(decoded as object), ...change })).toString(
      'base64url',
    );
    const otherBrowser = { ...AT_NOW, browserHash: 'b'.repeat(64) };
    await expect(readPhoneProof(`${swapped}.${signature}`, AT_NOW)).resolves.toBeNull();
    await expect(readPhoneProof(`${swapped}.${signature}`, otherBrowser)).resolves.toBeNull();
  });

  it.each(['', 'garbage', `${'a'.repeat(20)}.${'b'.repeat(43)}`])('refuses %s', async (value) => {
    await expect(readPhoneProof(value, AT_NOW)).resolves.toBeNull();
  });

  it('refuses a correctly signed value that is not a proof', async () => {
    const notJson = Buffer.from('{not json at all').toString('base64url');
    const wrongShape = Buffer.from(JSON.stringify({ c: 'sms', p: 'x' })).toString('base64url');
    for (const payload of [notJson, wrongShape]) {
      const signed = `${payload}.${await sign('gsk-phone-proof-v1', payload)}`;
      await expect(readPhoneProof(signed, AT_NOW)).resolves.toBeNull();
    }
  });
});
