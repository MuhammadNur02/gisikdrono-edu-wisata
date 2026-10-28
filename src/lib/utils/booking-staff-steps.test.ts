import { describe, expect, it } from 'vitest';

import { staffStepsFor } from './booking-staff-steps';
import { officerBookingDetail } from '../../../tests/fixtures/booking-detail';

// Task P4.3.08, docs/PRD.md §13.1 A28: the buttons the booking page shows.

const NOW = new Date('2026-10-30T05:00:00Z');
const OFFICER = { isSuperadmin: false, isAal2: true };
const SUPERADMIN = { isSuperadmin: true, isAal2: true };
const PENDING = {
  attemptNo: 1,
  method: null,
  status: 'pending' as const,
  orderId: 'GSK-ADM0TNA1-01',
  settlementTime: null,
};

describe('staffStepsFor', () => {
  it('offers an officer the cancellation, the extension and a resend of a running hold', () => {
    expect(staffStepsFor(officerBookingDetail, OFFICER, NOW)).toEqual({
      cancel: true,
      extend: true,
      reactivate: false,
      resend: true,
      resolveReview: false,
    });
  });

  it('extends no hold while the PIC has a pay page open', () => {
    const booking = { ...officerBookingDetail, payments: [PENDING] };
    expect(staffStepsFor(booking, OFFICER, NOW).extend).toBe(false);
  });

  it("leaves a paid booking's cancellation to the superadmin", () => {
    const paid = { ...officerBookingDetail, status: 'paid' as const };
    expect(staffStepsFor(paid, OFFICER, NOW).cancel).toBe(false);
    expect(staffStepsFor(paid, SUPERADMIN, NOW).cancel).toBe(true);
  });

  it('reactivates a lapsed hold of a verified phone, never a lapsed quotation (review of PR #102, HIGH 1)', () => {
    const released = officerBookingDetail.legs.map((leg) => ({
      ...leg,
      status: 'released' as const,
    }));
    const lapsed = { ...officerBookingDetail, status: 'expired' as const, legs: released };
    expect(staffStepsFor(lapsed, OFFICER, NOW).reactivate).toBe(true);
    // A28: an officer's booking is exempt from the proven phone, a web booking is not.
    expect(staffStepsFor({ ...lapsed, isPhoneVerified: false }, OFFICER, NOW).reactivate).toBe(
      true,
    );
    const unprovenWeb = { ...lapsed, channel: 'web' as const, isPhoneVerified: false };
    expect(staffStepsFor(unprovenWeb, OFFICER, NOW).reactivate).toBe(false);
    const unreserved = officerBookingDetail.legs.map((leg) => ({
      ...leg,
      status: 'unreserved' as const,
    }));
    expect(staffStepsFor({ ...lapsed, legs: unreserved }, OFFICER, NOW).reactivate).toBe(false);
  });

  it('offers the superadmin the review of a booking paid without seats, and nothing else of it', () => {
    const waiting = {
      ...officerBookingDetail,
      status: 'paid' as const,
      needsReview: true,
      reviewReason: 'PAID_AFTER_EXPIRY_NO_QUOTA',
    };
    expect(staffStepsFor(waiting, SUPERADMIN, NOW)).toMatchObject({
      resolveReview: true,
      cancel: false,
    });
    expect(staffStepsFor(waiting, OFFICER, NOW).resolveReview).toBe(false);
    const otherReview = { ...waiting, reviewReason: 'AMOUNT_MISMATCH' };
    expect(staffStepsFor(otherReview, SUPERADMIN, NOW).resolveReview).toBe(false);
  });

  it('offers nothing before AAL2 or for an anonymised booking', () => {
    expect(
      Object.values(staffStepsFor(officerBookingDetail, { ...OFFICER, isAal2: false }, NOW)),
    ).not.toContain(true);
    const anonymised = { ...officerBookingDetail, isAnonymised: true };
    expect(Object.values(staffStepsFor(anonymised, SUPERADMIN, NOW))).not.toContain(true);
  });
});
