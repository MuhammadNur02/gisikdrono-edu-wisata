import { describe, expect, it } from 'vitest';

import {
  cancelBookingSchema,
  extendHoldSchema,
  resendMessageSchema,
  resolveReviewFormSchema,
  resolveReviewSchema,
} from './booking-staff';

// Task P4.3.08, docs/PRD.md §13.1 A28: the staff steps' inputs.

const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000d1';
const SESSION_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000e1';

describe('the staff step schemas', () => {
  it('take a cancellation with its reason, category and the previewed refund, nothing more', () => {
    const cancellation = {
      bookingId: BOOKING_ID,
      reason: 'Tamu minta batal',
      reasonCategory: 'guest_request',
      expectedAmount: 27000,
      expectedPct: 90,
    };
    expect(cancelBookingSchema.safeParse(cancellation).success).toBe(true);
    expect(
      cancelBookingSchema.safeParse({ ...cancellation, reasonCategory: 'other' }).success,
    ).toBe(false);
    expect(cancelBookingSchema.safeParse({ ...cancellation, reason: 'ok' }).success).toBe(false);
    expect(cancelBookingSchema.safeParse({ ...cancellation, expectedPct: 101 }).success).toBe(
      false,
    );
    expect(cancelBookingSchema.safeParse({ ...cancellation, refund: 30000 }).success).toBe(false);
  });

  it('take a new deadline as an instant with its offset', () => {
    const extension = { bookingId: BOOKING_ID, newExpiresAt: '2026-10-31T16:59:00.000Z' };
    expect(extendHoldSchema.safeParse(extension).success).toBe(true);
    expect(
      extendHoldSchema.safeParse({ ...extension, newExpiresAt: '2026-10-31 23:59' }).success,
    ).toBe(false);
  });

  it('send again only the PIC messages staff may resend', () => {
    const resend = { bookingId: BOOKING_ID, template: 'payment_received_ticket', channel: 'email' };
    expect(resendMessageSchema.safeParse(resend).success).toBe(true);
    expect(resendMessageSchema.safeParse({ ...resend, template: 'phone_otp' }).success).toBe(false);
  });

  it('move a booking under review to sessions, or refund it with none', () => {
    const review = {
      bookingId: BOOKING_ID,
      resolution: 'move',
      reason: 'Pindah ke sesi lain',
      sessionIds: [SESSION_ID],
    };
    expect(resolveReviewSchema.safeParse(review).success).toBe(true);
    expect(resolveReviewSchema.safeParse({ ...review, sessionIds: [] }).success).toBe(false);
    expect(resolveReviewSchema.safeParse({ ...review, resolution: 'refund' }).success).toBe(false);
    expect(
      resolveReviewSchema.safeParse({ ...review, resolution: 'refund', sessionIds: [] }).success,
    ).toBe(true);
    expect(resolveReviewSchema.safeParse({ ...review, reason: 'Pindah' }).success).toBe(false);
  });

  it('let the review form start with empty pickers, which a move must fill', () => {
    const form = {
      bookingId: BOOKING_ID,
      resolution: 'refund',
      reason: 'Sesi penuh, dana kembali',
      sessionIds: [''],
      code: '123456',
    };
    expect(resolveReviewFormSchema.safeParse(form).success).toBe(true);
    expect(resolveReviewFormSchema.safeParse({ ...form, resolution: 'move' }).success).toBe(false);
  });
});
