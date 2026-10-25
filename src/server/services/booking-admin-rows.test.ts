import { describe, expect, it } from 'vitest';

import {
  toBookingDetail,
  toBookingListRow,
  type BookingListColumns,
} from '@/server/services/booking-admin-rows';

const ROW: BookingListColumns = {
  id: '0192f3a4-5b6c-7d8e-9f01-0000000000bb',
  booking_code: 'GSK-7F3K9Q2M',
  status: 'paid',
  institution_name: 'SD Negeri Gisikdrono 01',
  pic_first_name: 'Ani',
  booker_type: 'school',
  package_name: 'Kombo Ecowastreme & Budaya',
  rw_ids: [5, 13],
  pax_count: 30,
  visit_date: '2026-11-06',
  visit_date_end: null,
  payment_status: 'settled',
  needs_review: null,
  shows_amounts: true,
  total_amount: 900_000,
  amount_paid: 900_000,
  created_at: '2026-10-20T02:00:00+00:00',
};

const ADMIN_ROW = {
  ...ROW,
  admin_notes: null,
  cancel_reason: null,
  cancelled_at: null,
  channel: 'web' as const,
  checked_in_at: null,
  completed_at: null,
  email_masked: 'a•••@sekolah.sch.id',
  expired_at: null,
  expires_at: null,
  is_anonymised: false,
  is_email_verified: true,
  is_phone_verified: true,
  notes: null,
  package_id: null,
  paid_at: null,
  phone_masked: '+62 812-••••-7890',
  quoted_at: null,
  refunded_at: null,
  review_reason: null,
  subtotal_package: null,
  ticket_statuses: null,
  legs: [
    {
      rw_id: 5,
      session_date: '2026-11-06',
      start_time: '09:00:00',
      label: 'Pagi',
      pax: 30,
      status: 'reserved',
    },
  ],
  payments: [
    {
      attempt_no: 1,
      method: 'qris',
      status: 'settled',
      order_id: 'GSK-7F3K9Q2M-01',
      settlement_time: null,
    },
  ],
  tickets: null,
  invoices: null,
};

describe('toBookingListRow', () => {
  it('keeps a booking whole, a one-day visit ending the day it starts', () => {
    expect(toBookingListRow(ROW)).toMatchObject({
      bookingCode: 'GSK-7F3K9Q2M',
      visitDateEnd: '2026-11-06',
      needsReview: false,
      amounts: { total: 900_000, paid: 900_000 },
    });
  });

  it('shows no amounts where the view withholds them (STAFF-02), and drops a row without a code', () => {
    expect(
      toBookingListRow({ ...ROW, shows_amounts: false, total_amount: null })?.amounts,
    ).toBeNull();
    expect(toBookingListRow({ ...ROW, booking_code: null })).toBeNull();
  });
});

describe('toBookingDetail', () => {
  it('reads the legs and payments through their own shapes and treats a missing list as empty', () => {
    const detail = toBookingDetail(ADMIN_ROW);
    expect(detail?.legs).toEqual([
      {
        rwId: 5,
        sessionDate: '2026-11-06',
        startTime: '09:00:00',
        label: 'Pagi',
        pax: 30,
        status: 'reserved',
      },
    ]);
    expect(detail?.payments[0]).toMatchObject({ attemptNo: 1, method: 'qris', status: 'settled' });
    expect(detail?.tickets).toEqual([]);
    expect(detail?.invoices).toEqual([]);
    expect(detail?.phoneMasked).toBe('+62 812-••••-7890');
  });

  it('refuses a JSON column of another shape instead of showing it half read', () => {
    expect(() => toBookingDetail({ ...ADMIN_ROW, legs: [{ rw_id: 'lima' }] })).toThrow();
  });
});
