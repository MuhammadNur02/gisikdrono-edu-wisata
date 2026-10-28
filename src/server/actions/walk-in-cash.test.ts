import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, fail } from '@/lib/errors';
import {
  requireFreshTotp,
  requireRole,
  requireRwAccess,
  type StaffContext,
} from '@/server/auth/guards';
import { getBookingDetail } from '@/server/services/booking-admin-service';
import { recordWalkInCash, sendWalkInPayLink } from '@/server/services/walk-in-service';

import { recordWalkInCashAction, sendWalkInPayLinkAction } from './walk-in-cash';
import { officerBookingDetail } from '../../../tests/fixtures/booking-detail';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({
  requireRole: vi.fn(),
  requireRwAccess: vi.fn(),
  requireFreshTotp: vi.fn(),
}));
vi.mock('@/server/services/booking-admin-service', () => ({ getBookingDetail: vi.fn() }));
vi.mock('@/server/services/notification-service', () => ({ kickNotificationWorker: vi.fn() }));
vi.mock('@/server/services/walk-in-service', () => ({
  recordWalkInCash: vi.fn(),
  sendWalkInPayLink: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const OFFICER: StaffContext = {
  userId: 'user-5',
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
  role: 'admin_rw',
  rwId: 5,
};
const BOOKING_ID = officerBookingDetail.id;
const CASH = {
  bookingId: BOOKING_ID,
  amount: 120000,
  reference: 'Kuitansi 001',
  attendeeCount: null,
};
const bookingOf = (rwIds: number[]) => ({ ...officerBookingDetail, rwIds });
// 12.00 WIB on the visit day: the hold runs and 23:59 WIB is ahead.
const NOON_OF_THE_VISIT = new Date('2026-10-30T05:00:00Z');

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON_OF_THE_VISIT);
  vi.mocked(requireRole).mockResolvedValue({ ok: true, ctx: OFFICER });
  vi.mocked(requireRwAccess).mockResolvedValue({ ok: true, ctx: OFFICER });
  vi.mocked(requireFreshTotp).mockResolvedValue({ ok: true, ctx: OFFICER });
  vi.mocked(getBookingDetail).mockResolvedValue(bookingOf([5]));
});

describe('recordWalkInCashAction', () => {
  it('reads the booking under RLS, checks its RW, then records the cash with a fresh code', async () => {
    await expect(recordWalkInCashAction(CASH)).resolves.toEqual({ ok: true, data: null });
    expect(requireRole).toHaveBeenCalledWith('admin_rw');
    expect(getBookingDetail).toHaveBeenCalledWith(BOOKING_ID);
    expect(requireRwAccess).toHaveBeenCalledWith(5);
    expect(requireFreshTotp).toHaveBeenCalledWith(300);
    expect(recordWalkInCash).toHaveBeenCalledWith(OFFICER, CASH);
    expect(after).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/bookings/${BOOKING_ID}`);
  });

  // Delta review of PR #91, M-1 and L-1: an open pay link does not stop the cash, but a booking that takes no cash
  // stops before Midtrans is called.
  it('takes the cash while the PIC has a pay link open', async () => {
    const payment = {
      attemptNo: 1,
      method: null,
      status: 'pending' as const,
      orderId: 'GSK-ADM0TNA1-01',
      settlementTime: null,
    };
    vi.mocked(getBookingDetail).mockResolvedValueOnce({
      ...officerBookingDetail,
      payments: [payment],
    });
    await expect(recordWalkInCashAction(CASH)).resolves.toEqual({ ok: true, data: null });
  });

  it('stops a booking under review, paid, lapsed or past 23.59 WIB before Midtrans is called', async () => {
    const refusals = [
      { ...officerBookingDetail, needsReview: true },
      { ...officerBookingDetail, status: 'paid' as const },
      { ...officerBookingDetail, expiresAt: '2026-10-30T04:00:00.000Z' },
      { ...officerBookingDetail, visitDateEnd: '2026-10-29' },
    ];
    for (const booking of refusals) {
      vi.mocked(getBookingDetail).mockResolvedValueOnce(booking);
      await expect(recordWalkInCashAction(CASH)).resolves.toMatchObject({
        error: { code: 'STATE_INVALID' },
      });
    }
    expect(requireFreshTotp).not.toHaveBeenCalled();
    expect(recordWalkInCash).not.toHaveBeenCalled();
  });

  it("leaves the cash to an RW admin of the booking's one RW (A9)", async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(recordWalkInCashAction(CASH)).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    vi.mocked(getBookingDetail).mockResolvedValueOnce(bookingOf([5, 13]));
    await expect(recordWalkInCashAction(CASH)).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    vi.mocked(getBookingDetail).mockResolvedValueOnce(null);
    await expect(recordWalkInCashAction(CASH)).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
    vi.mocked(requireRwAccess).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(recordWalkInCashAction(CASH)).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(recordWalkInCash).not.toHaveBeenCalled();
  });

  it('stops without a fresh code, and never takes the code itself', async () => {
    vi.mocked(requireFreshTotp).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(recordWalkInCashAction(CASH)).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    await expect(recordWalkInCashAction({ ...CASH, code: '123456' })).resolves.toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(recordWalkInCash).not.toHaveBeenCalled();
  });

  it('passes the people counted in, and says when they are needed or the QR key id is off the list', async () => {
    await expect(recordWalkInCashAction({ ...CASH, attendeeCount: 4 })).resolves.toMatchObject({
      error: { code: 'STATE_INVALID' },
    });
    expect(recordWalkInCash).not.toHaveBeenCalled();
    vi.setSystemTime(new Date('2026-10-30T06:30:00Z')); // 13.30 WIB: the session has started
    await expect(recordWalkInCashAction(CASH)).resolves.toMatchObject({
      error: { code: 'STATE_INVALID' },
    });
    await recordWalkInCashAction({ ...CASH, attendeeCount: 4 });
    expect(recordWalkInCash).toHaveBeenCalledWith(OFFICER, { ...CASH, attendeeCount: 4 });
    for (const [hint, text] of [
      ['ATTENDANCE_REQUIRED', 'sudah dimulai'],
      ['QR_KEY_UNKNOWN', 'Superadmin Kelurahan'],
    ] as const) {
      vi.mocked(recordWalkInCash).mockRejectedValueOnce({
        code: 'P0001',
        message: 'refused',
        hint,
        details: '',
      });
      const refused = await recordWalkInCashAction({ ...CASH, attendeeCount: 4 });
      expect(refused.ok ? '' : refused.error.message).toContain(text);
    }
  });

  it('says why a booking takes no cash now', async () => {
    vi.mocked(recordWalkInCash).mockRejectedValueOnce(new AppError('STATE_INVALID'));
    const refused = await recordWalkInCashAction(CASH);
    expect(refused).toMatchObject({ error: { code: 'STATE_INVALID' } });
    expect(refused.ok ? '' : refused.error.message).toContain('23.59 WIB');
  });
});

describe('sendWalkInPayLinkAction', () => {
  it("sends the pay link of a booking in the officer's RW and kicks the outbox", async () => {
    await expect(sendWalkInPayLinkAction({ bookingId: BOOKING_ID })).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(requireRole).toHaveBeenCalledWith('superadmin', 'admin_rw');
    expect(requireRwAccess).toHaveBeenCalledWith(5);
    expect(sendWalkInPayLink).toHaveBeenCalledWith(BOOKING_ID);
    expect(after).toHaveBeenCalledOnce();
  });

  it('refuses an AAL1 session and a booking of another RW', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({ ok: true, ctx: { ...OFFICER, isAal2: false } });
    await expect(sendWalkInPayLinkAction({ bookingId: BOOKING_ID })).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    vi.mocked(requireRwAccess).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(sendWalkInPayLinkAction({ bookingId: BOOKING_ID })).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(sendWalkInPayLink).not.toHaveBeenCalled();
  });
});
