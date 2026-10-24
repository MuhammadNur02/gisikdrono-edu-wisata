import { describe, expect, it } from 'vitest';

import {
  findLocalStubProblems,
  findMidtransKeyProblems,
  MIDTRANS_MERCHANT_ID_PATTERN,
  midtransApiBaseUrl,
  midtransSnapBaseUrl,
  readKeyCheckAnswer,
} from '@/lib/midtrans/environment';

describe('midtransApiBaseUrl', () => {
  it('points the sandbox and production at their own hosts', () => {
    expect(midtransApiBaseUrl(false)).toBe('https://api.sandbox.midtrans.com');
    expect(midtransApiBaseUrl(true)).toBe('https://api.midtrans.com');
  });
});

describe('midtransSnapBaseUrl', () => {
  it('points the sandbox and production Snap pages at their own hosts', () => {
    expect(midtransSnapBaseUrl(false)).toBe('https://app.sandbox.midtrans.com');
    expect(midtransSnapBaseUrl(true)).toBe('https://app.midtrans.com');
  });
});

// Decision of 2026-10-24 (Q3): the stand-in answers only a local or CI server.
describe('findLocalStubProblems', () => {
  it('has nothing to say when no stub is set', () => {
    expect(findLocalStubProblems(undefined, 'production')).toEqual([]);
  });

  it('lets a local or CI server use a stub on this machine', () => {
    for (const url of ['http://127.0.0.1:4010', 'http://localhost:4010', 'http://[::1]:4010']) {
      expect(findLocalStubProblems(url, undefined)).toEqual([]);
    }
  });

  it('refuses the stub on every Vercel deployment, whatever its address', () => {
    for (const vercelEnv of ['production', 'preview', 'development']) {
      expect(findLocalStubProblems('http://127.0.0.1:4010', vercelEnv)).toEqual([
        `MIDTRANS_LOCAL_STUB_URL is for local and CI servers only; unset it where VERCEL_ENV is ${vercelEnv}`,
      ]);
    }
  });

  it('refuses a stub that is not on this machine', () => {
    for (const url of ['https://stub.example.test', 'http://10.0.0.5:4010', 'not a url']) {
      expect(findLocalStubProblems(url, undefined)).toEqual([
        'MIDTRANS_LOCAL_STUB_URL must point at 127.0.0.1, localhost or ::1',
      ]);
    }
  });
});

describe('MIDTRANS_MERCHANT_ID_PATTERN', () => {
  it('accepts the older G and the newer M merchant ids', () => {
    expect(MIDTRANS_MERCHANT_ID_PATTERN.test('G123456789')).toBe(true);
    expect(MIDTRANS_MERCHANT_ID_PATTERN.test('M123456')).toBe(true);
  });

  it('refuses anything else', () => {
    for (const merchantId of ['', 'G', 'M', 'g123', 'X123', 'M12a', ' M123', 'M123 ', 'GM123']) {
      expect(MIDTRANS_MERCHANT_ID_PATTERN.test(merchantId)).toBe(false);
    }
  });
});

describe('findMidtransKeyProblems', () => {
  it('accepts both sandbox key formats', () => {
    const legacy = { serverKey: 'SB-Mid-server-a', clientKey: 'SB-Mid-client-a' };
    const current = { serverKey: 'Mid-server-a', clientKey: 'Mid-client-a' };
    expect(findMidtransKeyProblems(legacy, false)).toEqual([]);
    expect(findMidtransKeyProblems(current, false)).toEqual([]);
  });

  it('accepts only Mid- keys in production', () => {
    expect(findMidtransKeyProblems({ serverKey: 'Mid-server-a' }, true)).toEqual([]);
    expect(findMidtransKeyProblems({ serverKey: 'SB-Mid-server-a' }, true)).toEqual([
      'MIDTRANS_SERVER_KEY must start with Mid-server- for Midtrans production',
    ]);
  });

  it('skips the keys that are not set', () => {
    expect(
      findMidtransKeyProblems(
        { serverKey: 'Mid-server-a', previousServerKey: undefined, clientKey: undefined },
        true,
      ),
    ).toEqual([]);
  });

  it('refuses a client key in the server key slot and the other way round', () => {
    expect(
      findMidtransKeyProblems({ serverKey: 'Mid-client-a', clientKey: 'SB-Mid-server-a' }, false),
    ).toEqual([
      'MIDTRANS_SERVER_KEY must start with SB-Mid-server- or Mid-server- for the Midtrans sandbox',
      'MIDTRANS_CLIENT_KEY must start with SB-Mid-client- or Mid-client- for the Midtrans sandbox',
    ]);
  });

  it('matches the prefix exactly, case included', () => {
    expect(findMidtransKeyProblems({ serverKey: 'sb-mid-server-a' }, false)).toHaveLength(1);
    expect(findMidtransKeyProblems({ serverKey: 'mid-server-a' }, true)).toHaveLength(1);
    expect(findMidtransKeyProblems({ serverKey: ' Mid-server-a' }, true)).toHaveLength(1);
  });
});

describe('readKeyCheckAnswer', () => {
  const unknownOrder = { status_code: '404', status_message: "Transaction doesn't exist." };
  const unknownMerchant = { status_code: '401', status_message: 'Unknown Merchant server_key/id' };

  it('reads an unknown order as a key that belongs to that environment', () => {
    expect(readKeyCheckAnswer(404, unknownOrder)).toEqual({
      outcome: 'key_matches',
      statusCode: '404',
      statusMessage: "Transaction doesn't exist.",
    });
    expect(readKeyCheckAnswer(200, unknownOrder).outcome).toBe('key_matches');
  });

  it('reads 401 as a key that host does not know', () => {
    expect(readKeyCheckAnswer(401, unknownMerchant)).toEqual({
      outcome: 'key_refused',
      statusCode: '401',
      statusMessage: 'Unknown Merchant server_key/id',
    });
    expect(readKeyCheckAnswer(401, null).outcome).toBe('key_refused');
  });

  it('treats any other answer as unexpected, a bare 404 included', () => {
    expect(readKeyCheckAnswer(404, null)).toEqual({
      outcome: 'unexpected',
      statusCode: '404',
      statusMessage: '',
    });
    expect(
      readKeyCheckAnswer(404, { status_code: '404', status_message: 'Not Found' }).outcome,
    ).toBe('unexpected');
    expect(readKeyCheckAnswer(500, { status_code: 500 }).outcome).toBe('unexpected');
    expect(
      readKeyCheckAnswer(200, { status_code: '200', transaction_status: 'settlement' }).outcome,
    ).toBe('unexpected');
  });
});
