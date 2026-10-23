import { describe, expect, it } from 'vitest';

import { mapMidtransStatus, needsStatusConfirmation } from '@/lib/midtrans/map-status';

// CLAUDE.md §7.2: every status Midtrans sends, mapped as internal.midtrans_payment_status maps it.
describe('mapMidtransStatus', () => {
  it.each([
    ['settlement', undefined, 'settled'],
    ['capture', 'accept', 'settled'],
    ['capture', 'challenge', 'needs_review'],
    ['capture', 'deny', 'denied'],
    ['capture', undefined, 'needs_review'],
    ['pending', undefined, 'pending'],
    ['deny', undefined, 'denied'],
    ['failure', undefined, 'failed'],
    ['cancel', undefined, 'cancelled'],
    ['expire', undefined, 'expired'],
    ['refund', undefined, 'refunded'],
    ['partial_refund', undefined, 'partially_refunded'],
    ['chargeback', undefined, 'disputed'],
    ['partial_chargeback', undefined, 'disputed'],
  ] as const)('maps %s with fraud status %s to %s', (transactionStatus, fraudStatus, expected) => {
    expect(mapMidtransStatus(transactionStatus, fraudStatus)).toBe(expected);
  });

  it('knows no status this site never asks for, such as a card authorisation', () => {
    expect(mapMidtransStatus('authorize', 'accept')).toBeNull();
    expect(mapMidtransStatus('', undefined)).toBeNull();
  });
});

describe('needsStatusConfirmation', () => {
  it('asks the Status API about everything but pending (docs/Security.md §3.3 step 10)', () => {
    expect(needsStatusConfirmation('settled')).toBe(true);
    expect(needsStatusConfirmation('expired')).toBe(true);
    expect(needsStatusConfirmation('denied')).toBe(true);
    expect(needsStatusConfirmation('pending')).toBe(false);
    expect(needsStatusConfirmation(null)).toBe(false);
  });
});
