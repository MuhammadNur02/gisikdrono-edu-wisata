import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail } from '@/lib/errors';
import { requireRole, requireRwAccess, type StaffContext } from '@/server/auth/guards';
import { getBookingDetail } from '@/server/services/booking-admin-service';
import { cancelBookingByStaff, resolveReview } from '@/server/services/booking-staff-service';

import { cancelBookingAction, resolveBookingReviewAction } from './booking-staff';
import { officerBookingDetail } from '../../../tests/fixtures/booking-detail';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireRole: vi.fn(), requireRwAccess: vi.fn() }));
vi.mock('@/server/services/booking-admin-service', () => ({ getBookingDetail: vi.fn() }));
vi.mock('@/server/services/notification-service', () => ({ kickNotificationWorker: vi.fn() }));
vi.mock('@/server/services/booking-staff-service', () => ({
  cancelBookingByStaff: vi.fn(),
  extendHold: vi.fn(),
  previewStaffCancellation: vi.fn(),
  reactivate: vi.fn(),
  resendMessage: vi.fn(),
  resolveReview: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

// Task P4.3.08, docs/PRD.md §13.1 A28: the booking page's staff steps, in the order of CLAUDE.md §5.2.

const OFFICER: StaffContext = {
  userId: 'user-5',
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
  role: 'admin_rw',
  rwId: 5,
};
const CANCEL = {
  bookingId: officerBookingDetail.id,
  reason: 'Rombongan batal datang',
  reasonCategory: null,
  expectedAmount: 0,
  expectedPct: null,
};
const REVIEW = {
  bookingId: officerBookingDetail.id,
  resolution: 'refund',
  reason: 'Sesi penuh, dana kembali',
  sessionIds: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ ok: true, ctx: OFFICER });
  vi.mocked(requireRwAccess).mockResolvedValue({ ok: true, ctx: OFFICER });
  vi.mocked(getBookingDetail).mockResolvedValue(officerBookingDetail);
});

describe('cancelBookingAction', () => {
  it("cancels a booking the officer's RLS shows, in their RW, and kicks the outbox", async () => {
    await expect(cancelBookingAction(CANCEL)).resolves.toEqual({ ok: true, data: null });
    expect(requireRwAccess).toHaveBeenCalledWith(5);
    expect(cancelBookingByStaff).toHaveBeenCalledWith(CANCEL);
    expect(after).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/bookings/${officerBookingDetail.id}`);
  });

  it('refuses an AAL1 session, a booking RLS hides and another RW', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({ ok: true, ctx: { ...OFFICER, isAal2: false } });
    await expect(cancelBookingAction(CANCEL)).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    vi.mocked(getBookingDetail).mockResolvedValueOnce(null);
    await expect(cancelBookingAction(CANCEL)).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
    vi.mocked(requireRwAccess).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(cancelBookingAction(CANCEL)).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(cancelBookingByStaff).not.toHaveBeenCalled();
  });
});

describe('resolveBookingReviewAction', () => {
  it("is the superadmin's (A28)", async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(resolveBookingReviewAction(REVIEW)).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(requireRole).toHaveBeenCalledWith('superadmin');
    expect(resolveReview).not.toHaveBeenCalled();
    await expect(resolveBookingReviewAction(REVIEW)).resolves.toEqual({ ok: true, data: null });
    expect(resolveReview).toHaveBeenCalledWith(REVIEW);
  });
});
