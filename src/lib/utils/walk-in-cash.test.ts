import { describe, expect, it } from 'vitest';

import type { BookingDetail } from '@/types/booking-admin';

import { cashDeadlineOf, isCashReceivable } from './walk-in-cash';

// Task P4.3.10, docs/PRD.md §13.1 A23: "Terima tunai" until 23:59 WIB of the visit day.

const NOW = new Date('2026-10-30T05:00:00Z'); // 12.00 WIB
type CashBooking = Parameters<typeof isCashReceivable>[0];
const BOOKING: CashBooking = {
  channel: 'admin',
  status: 'pending_payment',
  needsReview: false,
  rwIds: [5],
  expiresAt: '2026-10-30T16:59:00Z',
  visitDateEnd: '2026-10-30',
  amounts: { total: 120000, paid: 0 },
  payments: [],
};
const PAYMENT: BookingDetail['payments'][number] = {
  attemptNo: 1,
  method: null,
  status: 'pending',
  orderId: 'GSK-7F3K9Q2M-01',
  settlementTime: null,
};

describe('cashDeadlineOf', () => {
  it('is 23:59 WIB of the visit day', () => {
    expect(cashDeadlineOf('2026-10-30').toISOString()).toBe('2026-10-30T16:59:00.000Z');
  });
});

describe('isCashReceivable', () => {
  it('offers the cash to an RW admin for an unpaid, held officer booking of one RW', () => {
    expect(isCashReceivable(BOOKING, true, NOW)).toBe(true);
  });

  it('never to the superadmin, for a web booking, a combo or a booking under review', () => {
    expect(isCashReceivable(BOOKING, false, NOW)).toBe(false);
    expect(isCashReceivable({ ...BOOKING, channel: 'web' }, true, NOW)).toBe(false);
    expect(isCashReceivable({ ...BOOKING, rwIds: [5, 13] }, true, NOW)).toBe(false);
    expect(isCashReceivable({ ...BOOKING, needsReview: true }, true, NOW)).toBe(false);
  });

  it('not once the hold or the visit day is over', () => {
    expect(isCashReceivable(BOOKING, true, new Date('2026-10-30T16:59:00Z'))).toBe(false);
    expect(isCashReceivable({ ...BOOKING, expiresAt: '2026-10-30T04:00:00Z' }, true, NOW)).toBe(
      false,
    );
  });

  it('not while a payment is open or settled, and again once it closed', () => {
    expect(isCashReceivable({ ...BOOKING, payments: [PAYMENT] }, true, NOW)).toBe(false);
    expect(
      isCashReceivable({ ...BOOKING, payments: [{ ...PAYMENT, status: 'expired' }] }, true, NOW),
    ).toBe(true);
  });
});
