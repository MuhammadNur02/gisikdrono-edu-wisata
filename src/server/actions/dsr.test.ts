import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, fail } from '@/lib/errors';
import { requireFreshTotp, requireRole, type StaffContext } from '@/server/auth/guards';
import {
  acknowledgeDsrRequest,
  anonymiseDsrBooking,
  closeDsrRequest,
  deleteDsrParticipants,
  exportDsrData,
  openDsrRequest,
} from '@/server/services/dsr-service';

import {
  acknowledgeDsrRequestAction,
  anonymiseDsrBookingAction,
  closeDsrRequestAction,
  deleteDsrParticipantsAction,
  exportDsrDataAction,
  openDsrRequestAction,
} from './dsr';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireRole: vi.fn(), requireFreshTotp: vi.fn() }));
vi.mock('@/server/services/dsr-service', () => ({
  acknowledgeDsrRequest: vi.fn(),
  anonymiseDsrBooking: vi.fn(),
  closeDsrRequest: vi.fn(),
  deleteDsrParticipants: vi.fn(),
  exportDsrData: vi.fn(),
  openDsrRequest: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const SUPERADMIN: StaffContext = {
  userId: 'user-1',
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
  role: 'superadmin',
  rwId: null,
};
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const REQUEST_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000d5';
const STEP = { bookingId: BOOKING_ID, requestId: REQUEST_ID };
const FINISH = { ...STEP, note: 'Dikirim sesuai UU PDP pasal 7' };
const DETAIL_PATH = `/dashboard/bookings/${BOOKING_ID}`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
  vi.mocked(requireFreshTotp).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
});

describe('openDsrRequestAction', () => {
  const input = { bookingId: BOOKING_ID, requestType: 'access', reason: 'Diminta lewat telepon' };

  it('records the request for the superadmin at AAL2 and reads the booking again', async () => {
    vi.mocked(openDsrRequest).mockResolvedValue({ isGuestNotified: true });
    await expect(openDsrRequestAction(input)).resolves.toEqual({
      ok: true,
      data: { isGuestNotified: true },
    });
    expect(requireRole).toHaveBeenCalledWith('superadmin');
    expect(requireFreshTotp).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith(DETAIL_PATH);
  });

  it('refuses an RW admin, an AAL1 session, a short reason and a field it does not know', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(openDsrRequestAction(input)).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    vi.mocked(requireRole).mockResolvedValueOnce({
      ok: true,
      ctx: { ...SUPERADMIN, isAal2: false },
    });
    await expect(openDsrRequestAction(input)).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    await expect(openDsrRequestAction({ ...input, reason: 'pendek' })).resolves.toMatchObject({
      error: { code: 'VALIDATION' },
    });
    await expect(
      openDsrRequestAction({ ...input, phone: '+6281200000000' }),
    ).resolves.toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(openDsrRequest).not.toHaveBeenCalled();
  });
});

describe('acknowledgeDsrRequestAction', () => {
  it('acknowledges without a fresh code and maps a step out of order', async () => {
    await expect(acknowledgeDsrRequestAction(STEP)).resolves.toEqual({ ok: true, data: null });
    expect(acknowledgeDsrRequest).toHaveBeenCalledWith(STEP);
    vi.mocked(acknowledgeDsrRequest).mockRejectedValueOnce(new AppError('STATE_INVALID'));
    await expect(acknowledgeDsrRequestAction(STEP)).resolves.toMatchObject({
      error: { code: 'STATE_INVALID' },
    });
  });
});

describe('the steps that hand out or delete data', () => {
  const steps = [
    [exportDsrDataAction, exportDsrData],
    [deleteDsrParticipantsAction, deleteDsrParticipants],
    [anonymiseDsrBookingAction, anonymiseDsrBooking],
  ] as const;

  it.each(steps)(
    'run with a fresh code and say whether the guest was told',
    async (action, step) => {
      vi.mocked(step).mockResolvedValue({ isCompleted: true, isGuestNotified: false });
      await expect(action(FINISH)).resolves.toEqual({ ok: true, data: { isGuestNotified: false } });
      expect(requireFreshTotp).toHaveBeenCalledOnce();
      expect(step).toHaveBeenCalledWith(FINISH);
      expect(revalidatePath).toHaveBeenCalledWith(DETAIL_PATH);
    },
  );

  it.each(steps)('stop before anything runs without a fresh code', async (action, step) => {
    vi.mocked(requireFreshTotp).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(action(FINISH)).resolves.toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(step).not.toHaveBeenCalled();
  });

  it('never take the authenticator code to the service', async () => {
    await expect(exportDsrDataAction({ ...FINISH, code: '123456' })).resolves.toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(exportDsrData).not.toHaveBeenCalled();
  });
});

describe('closeDsrRequestAction', () => {
  it('closes with an outcome it allows and refuses one a step of its own gives', async () => {
    vi.mocked(closeDsrRequest).mockResolvedValue({ isCompleted: false, isGuestNotified: true });
    await expect(closeDsrRequestAction({ ...FINISH, outcome: 'rejected_other' })).resolves.toEqual({
      ok: true,
      data: { isGuestNotified: true },
    });
    await expect(
      closeDsrRequestAction({ ...FINISH, outcome: 'anonymised' }),
    ).resolves.toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(closeDsrRequest).toHaveBeenCalledOnce();
    expect(requireFreshTotp).not.toHaveBeenCalled();
  });
});
