import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';
import { requireRole, type StaffContext } from '@/server/auth/guards';
import { markRefundRequestFailedByStaff } from '@/server/services/payment-service';

import { markRefundRequestFailedAction } from './refund-requests';

vi.mock('@/server/auth/guards', () => ({ requireRole: vi.fn() }));
vi.mock('@/server/services/payment-service', () => ({ markRefundRequestFailedByStaff: vi.fn() }));
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
const MARK = {
  requestId: '3f1c2a6e-5b7d-4e8f-9a0b-1c2d3e4f5a6b',
  reason: 'Midtrans tidak membayar dalam sehari',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
  vi.mocked(markRefundRequestFailedByStaff).mockResolvedValue(undefined);
});

describe('markRefundRequestFailedAction (delta review of PR #69, D-2; re-review, M-3)', () => {
  it("marks the request on the server's own look", async () => {
    await expect(markRefundRequestFailedAction(MARK)).resolves.toEqual({ ok: true, data: null });
    expect(requireRole).toHaveBeenCalledWith('superadmin');
    expect(markRefundRequestFailedByStaff).toHaveBeenCalledWith(MARK);
  });

  it('refuses a reason too short to say why, and anything else in the body', async () => {
    await expect(
      markRefundRequestFailedAction({ ...MARK, reason: 'gagal' }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    await expect(markRefundRequestFailedAction({ ...MARK, eventId: 7 })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(markRefundRequestFailedByStaff).not.toHaveBeenCalled();
  });

  it('refuses a superadmin who is not at AAL2', async () => {
    vi.mocked(requireRole).mockResolvedValue({ ok: true, ctx: { ...SUPERADMIN, isAal2: false } });
    await expect(markRefundRequestFailedAction(MARK)).resolves.toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(markRefundRequestFailedByStaff).not.toHaveBeenCalled();
  });

  it('answers a request the look leaves nothing to mark on as STATE_INVALID', async () => {
    vi.mocked(markRefundRequestFailedByStaff).mockRejectedValue(new AppError('STATE_INVALID'));
    await expect(markRefundRequestFailedAction(MARK)).resolves.toMatchObject({
      ok: false,
      error: { code: 'STATE_INVALID' },
    });
  });
});
