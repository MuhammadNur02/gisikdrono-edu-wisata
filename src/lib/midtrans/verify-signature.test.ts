import { describe, expect, it } from 'vitest';

import { hasValidMidtransSignature, midtransSignature } from '@/lib/midtrans/verify-signature';

const SERVER_KEY = 'SB-Mid-server-fixture';
const PREVIOUS_KEY = 'SB-Mid-server-previous';
const FIELDS = { order_id: 'GSK-7F3K9Q2M-01', status_code: '200', gross_amount: '600000.00' };
// sha512('GSK-7F3K9Q2M-01' + '200' + '600000.00' + 'SB-Mid-server-fixture'), worked out once and kept.
const SIGNATURE =
  'ef4f83e8432fb2f3cb4e2cd4d5e927a510ca9c75662e6b27296ffa3ae472a6300a2345232963abfa7766479cfec553f4269a1c7cb94666331fe5c556bb7d52b6';

describe('midtransSignature', () => {
  it('is sha512 over the order, status code, amount and key, as Midtrans documents it', () => {
    expect(midtransSignature(FIELDS, SERVER_KEY)).toBe(SIGNATURE);
  });
});

describe('hasValidMidtransSignature', () => {
  it('accepts a notification signed with the server key', () => {
    expect(hasValidMidtransSignature({ ...FIELDS, signature_key: SIGNATURE }, [SERVER_KEY])).toBe(
      true,
    );
  });

  it('accepts the previous key during a rotation, and only while it is given', () => {
    const signedWithPrevious = midtransSignature(FIELDS, PREVIOUS_KEY);
    const notification = { ...FIELDS, signature_key: signedWithPrevious };
    expect(hasValidMidtransSignature(notification, [SERVER_KEY, PREVIOUS_KEY])).toBe(true);
    expect(hasValidMidtransSignature(notification, [SERVER_KEY])).toBe(false);
  });

  it('refuses a tampered amount, order or status code', () => {
    for (const tampered of [
      { ...FIELDS, gross_amount: '600000' },
      { ...FIELDS, gross_amount: '1.00' },
      { ...FIELDS, order_id: 'GSK-7F3K9Q2M-02' },
      { ...FIELDS, status_code: '201' },
    ]) {
      expect(
        hasValidMidtransSignature({ ...tampered, signature_key: SIGNATURE }, [SERVER_KEY]),
      ).toBe(false);
    }
  });

  it('refuses a signature of the wrong length without comparing it', () => {
    expect(hasValidMidtransSignature({ ...FIELDS, signature_key: 'abc' }, [SERVER_KEY])).toBe(
      false,
    );
  });
});
