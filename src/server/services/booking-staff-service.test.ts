import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requestNotificationResend } from '@/db/rpc-booking-staff';
import { bookingStaffCopy } from '@/lib/copy/booking-staff';

import { resendMessage } from './booking-staff-service';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn(() => ({})) }));
vi.mock('@/lib/env', () => ({ serverEnv: { QR_SIGNING_ACTIVE_KID: 'k1' } }));
vi.mock('@/lib/queries/sessions', () => ({ listAvailableSessions: vi.fn() }));
vi.mock('@/lib/queries/settings', () => ({ getPublicSiteSettings: vi.fn() }));
vi.mock('@/server/services/payment-service', () => ({ settleCancellation: vi.fn() }));
vi.mock('@/server/services/booking-admin-service', () => ({
  asStaffRpcStep: <T>(run: () => Promise<T>) => run(),
}));
vi.mock('@/db/rpc-booking-staff', () => ({
  cancelBookingAsStaff: vi.fn(),
  cancellationPreview: vi.fn(),
  extendBookingHold: vi.fn(),
  reactivateBooking: vi.fn(),
  requestNotificationResend: vi.fn(),
  resolveBookingReview: vi.fn(),
}));

// request_notification_resend refuses a D-1 reminder whose last row names no day with a hint of its own
// (20261105140200), so the page does not say the booking lost its seat.

const RESEND = {
  bookingId: '0192f3a4-5b6c-7d8e-9f01-23456789abcd',
  template: 'visit_reminder_d1',
  channel: 'email',
} as const;

function raised(hint: string) {
  return { code: 'P0001', message: 'refused', hint, details: null };
}

beforeEach(() => {
  vi.mocked(requestNotificationResend).mockReset();
});

describe('resendMessage', () => {
  it('explains a reminder whose last row names no visit day', async () => {
    vi.mocked(requestNotificationResend).mockRejectedValueOnce(raised('REMINDER_DAY_UNKNOWN'));
    await expect(resendMessage(RESEND)).rejects.toMatchObject({
      code: 'STATE_INVALID',
      userMessage: bookingStaffCopy.errors.reminderDayUnknown,
    });
  });

  it('keeps the general sentence for a day the booking no longer holds', async () => {
    vi.mocked(requestNotificationResend).mockRejectedValueOnce(raised('STATE_INVALID'));
    await expect(resendMessage(RESEND)).rejects.toMatchObject({
      code: 'STATE_INVALID',
      userMessage: bookingStaffCopy.errors.stateInvalid,
    });
  });

  // 20261105175000: a message the booking never had, and a first reminder before an officer's pay link went out.
  it.each([
    ['NEVER_SENT', bookingStaffCopy.errors.neverSent],
    ['PAY_LINK_NOT_SENT', bookingStaffCopy.errors.payLinkNotSent],
    ['NOT_SENT', bookingStaffCopy.errors.notSent],
  ])('explains the %s refusal in its own words', async (hint, userMessage) => {
    vi.mocked(requestNotificationResend).mockRejectedValueOnce(raised(hint));
    await expect(resendMessage({ ...RESEND, template: 'payment_reminder' })).rejects.toMatchObject({
      code: 'STATE_INVALID',
      userMessage,
    });
  });
});
