import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { attestationExpiry, attestScan, SCAN_ATTESTATION_TTL_SECONDS } from '@/lib/scanner/attest';

const SECRET = 'fixture-cron-secret';
const SCAN = {
  officerId: '00000000-0000-4000-8000-00000000f005',
  ticketId: '0192f3a4-5b6c-7d8e-9f01-0000000000aa',
  attemptId: '0192f3a4-5b6c-7d8e-9f01-00000000a001',
  mode: 'commit',
  source: 'qr',
  expiresAt: 1_793_000_060,
} as const;

describe('attestScan', () => {
  it('is HMAC-SHA256 under HMAC-SHA256(CRON_SECRET, label) of the fields joined by |, in hex', () => {
    const key = createHmac('sha256', SECRET).update('gsk-scanner-attest-v1').digest();
    const expected = createHmac('sha256', key)
      .update(`${SCAN.officerId}|${SCAN.ticketId}|${SCAN.attemptId}|commit|qr|1793000060`)
      .digest('hex');
    expect(attestScan(SCAN, SECRET)).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['officer', { officerId: '00000000-0000-4000-8000-00000000f013' }],
    ['ticket', { ticketId: '0192f3a4-5b6c-7d8e-9f01-0000000000bb' }],
    ['attempt', { attemptId: '0192f3a4-5b6c-7d8e-9f01-00000000a002' }],
    ['mode', { mode: 'preview' }],
    ['source', { source: 'manual' }],
    ['expiry', { expiresAt: SCAN.expiresAt + 1 }],
  ] as const)('changes with the %s', (_field, change) => {
    expect(attestScan({ ...SCAN, ...change }, SECRET)).not.toBe(attestScan(SCAN, SECRET));
  });

  it('reads a uuid in the lower case Postgres writes it in', () => {
    const shouting = {
      ...SCAN,
      ticketId: SCAN.ticketId.toUpperCase(),
      attemptId: SCAN.attemptId.toUpperCase(),
    };
    expect(attestScan(shouting, SECRET)).toBe(attestScan(SCAN, SECRET));
  });

  // supabase/tests/scanner_attestation.sql expects the same value from internal.scanner_attestation.
  it('matches the database under the pgTAP secret', () => {
    expect(attestScan(SCAN, 'pgtap-cron-secret')).toBe(
      '0408e663a6f8bae9c03acee8bcedd8087156082a55fe2f329693e77cc2dfe1af',
    );
  });

  it('changes with the secret', () => {
    expect(attestScan(SCAN, 'another-secret')).not.toBe(attestScan(SCAN, SECRET));
  });
});

describe('attestationExpiry', () => {
  it('is a minute from now, in whole seconds', () => {
    expect(attestationExpiry(1_793_000_000_999)).toBe(1_793_000_000 + SCAN_ATTESTATION_TTL_SECONDS);
  });
});
