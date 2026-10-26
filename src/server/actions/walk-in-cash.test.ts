import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, fail } from '@/lib/errors';
import {
  requireFreshTotp,
  requireRole,
  requireRwAccess,
  type StaffContext,
} from '@/server/auth/guards';
import { getBookingDetail } from '@/server/services/booking-admin-service';
import { recordWalkInCash, sendWalkInPayLink } from '@/server/services/walk-in-service';
import type { BookingDetail } from '@/types/booking-admin';

import { recordWalkInCashAction, sendWalkInPayLinkAction } from './walk-in-cash';

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
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000d1';
const CASH = { bookingId: BOOKING_ID, amount: 120000, reference: 'Kuitansi 001' };
const bookingOf = (rwIds: number[]) => ({ rwIds }) as unknown as BookingDetail;

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(recordWalkInCash).toHaveBeenCalledWith(CASH);
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/bookings/${BOOKING_ID}`);
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
