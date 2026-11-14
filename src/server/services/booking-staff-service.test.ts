import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requestNotificationResend, rescheduleBooking } from '@/db/rpc-booking-staff';
import { bookingStaffCopy } from '@/lib/copy/booking-staff';
import { listAvailableSessions } from '@/lib/queries/sessions';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import type { PublicSiteSettings } from '@/types/settings';

import { listRescheduleLegs, rescheduleByStaff, resendMessage } from './booking-staff-service';
import { officerBookingDetail } from '../../../tests/fixtures/booking-detail';

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
  rescheduleBooking: vi.fn(),
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

// 20261114080000: an officer's reschedule.
const NOW = new Date('2026-10-28T02:00:00Z');
const SESSION = { rwId: 5 as const, endTime: '15:00', label: null, capacity: 40 };

function sessionOn(id: string, sessionDate: string, startTime: string, remaining: number) {
  return { ...SESSION, id, sessionDate, startTime, remaining };
}

describe('listRescheduleLegs', () => {
  beforeEach(() => {
    vi.mocked(getPublicSiteSettings).mockResolvedValue({
      maxAdvanceDays: 90,
    } as PublicSiteSettings);
    vi.mocked(listAvailableSessions).mockResolvedValue([
      sessionOn('0192f3a4-5b6c-7d8e-9f01-0000000000a1', '2026-10-28', '09:30', 20),
      sessionOn('0192f3a4-5b6c-7d8e-9f01-0000000000a2', '2026-10-28', '10:30', 20),
      sessionOn('0192f3a4-5b6c-7d8e-9f01-0000000000a3', '2026-10-30', '13:00', 20),
      sessionOn('0192f3a4-5b6c-7d8e-9f01-0000000000a4', '2026-11-02', '08:00', 2),
      sessionOn('0192f3a4-5b6c-7d8e-9f01-0000000000a5', '2026-11-03', '08:00', 10),
    ]);
  });

  it('offers sessions an hour away or later, with room, other than the one the leg is in', async () => {
    const paid = { ...officerBookingDetail, status: 'paid' as const };
    const [leg] = await listRescheduleLegs(paid, NOW);
    // 09.00 WIB now: 09.30 is too close, 13.00 on the 30th is the leg's own, 4 visitors do not fit in 2 seats.
    expect(leg?.sessions.map((session) => session.value)).toEqual([
      '0192f3a4-5b6c-7d8e-9f01-0000000000a2',
      '0192f3a4-5b6c-7d8e-9f01-0000000000a5',
    ]);
    expect(leg?.label).toContain('RW 05');
  });

  it('leaves out a leg that visits today or no longer holds its seats', async () => {
    const today = {
      ...officerBookingDetail,
      legs: officerBookingDetail.legs.map((leg) => ({ ...leg, sessionDate: '2026-10-28' })),
    };
    expect(await listRescheduleLegs(today, NOW)).toEqual([]);
    const released = {
      ...officerBookingDetail,
      legs: officerBookingDetail.legs.map((leg) => ({ ...leg, status: 'released' as const })),
    };
    expect(await listRescheduleLegs(released, NOW)).toEqual([]);
  });
});

describe('rescheduleByStaff', () => {
  const MOVE = {
    bookingId: '0192f3a4-5b6c-7d8e-9f01-23456789abcd',
    sessionId: '0192f3a4-5b6c-7d8e-9f01-0000000000a5',
    reason: 'Sekolah minta pindah hari',
  };

  it.each([
    ['RESCHEDULE_TOO_LATE', bookingStaffCopy.errors.rescheduleTooLate],
    ['RESCHEDULE_LIMIT', bookingStaffCopy.errors.rescheduleLimit],
    ['WEATHER_LINK_OPEN', bookingStaffCopy.errors.weatherLinkOpen],
  ])('explains the %s refusal in its own words', async (hint, userMessage) => {
    vi.mocked(rescheduleBooking).mockRejectedValueOnce(raised(hint));
    await expect(rescheduleByStaff(MOVE)).rejects.toMatchObject({
      code: 'STATE_INVALID',
      userMessage,
    });
  });

  it('says the session filled up when its seats are gone', async () => {
    vi.mocked(rescheduleBooking).mockRejectedValueOnce(raised('QUOTA_UNAVAILABLE'));
    await expect(rescheduleByStaff(MOVE)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  });
});
