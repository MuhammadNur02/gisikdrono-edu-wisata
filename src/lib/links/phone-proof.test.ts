import { describe, expect, it } from 'vitest';

import { PHONE_PROOF_TTL_SECONDS } from '@/config/guest';
import { sign } from '@/lib/links/hmac';
import { readPhoneProof, signPhoneProof } from '@/lib/links/phone-proof';

const NOW = 1_790_000_000;
const OTP_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const WHATSAPP_PROOF = {
  channel: 'whatsapp' as const,
  phone: '+6281234567890',
  email: null,
  otpId: OTP_ID,
};

describe('signPhoneProof and readPhoneProof', () => {
  it('reads back what it signed for 30 minutes', () => {
    const { value, maxAge } = signPhoneProof(WHATSAPP_PROOF, NOW);
    expect(maxAge).toBe(PHONE_PROOF_TTL_SECONDS);
    expect(readPhoneProof(value, NOW + maxAge - 1)).toEqual({
      ...WHATSAPP_PROOF,
      expiresAt: NOW + PHONE_PROOF_TTL_SECONDS,
    });
    expect(readPhoneProof(value, NOW + maxAge)).toBeNull();
  });

  it('keeps an email proof apart from a WhatsApp one', () => {
    const { value } = signPhoneProof(
      { channel: 'email', phone: '+6281234567890', email: 'ani@sekolah.sch.id', otpId: OTP_ID },
      NOW,
    );
    expect(readPhoneProof(value, NOW)?.channel).toBe('email');
  });

  it('refuses a proof whose number was changed after signing', () => {
    const { value } = signPhoneProof(WHATSAPP_PROOF, NOW);
    const [payload = '', signature = ''] = value.split('.');
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const swapped = Buffer.from(
      JSON.stringify({ ...(decoded as object), p: '+6289999999999' }),
    ).toString('base64url');
    expect(readPhoneProof(`${swapped}.${signature}`, NOW)).toBeNull();
  });

  it.each(['', 'garbage', `${'a'.repeat(20)}.${'b'.repeat(43)}`])('refuses %s', (value) => {
    expect(readPhoneProof(value, NOW)).toBeNull();
  });

  it('refuses a correctly signed value that is not a proof', () => {
    const notJson = Buffer.from('{not json at all').toString('base64url');
    const wrongShape = Buffer.from(JSON.stringify({ c: 'sms', p: 'x' })).toString('base64url');
    for (const payload of [notJson, wrongShape]) {
      expect(readPhoneProof(`${payload}.${sign('gsk-phone-proof-v1', payload)}`, NOW)).toBeNull();
    }
  });
});
