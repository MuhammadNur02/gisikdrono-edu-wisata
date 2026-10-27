import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireFinanceStepUp } from '@/server/auth/finance-guards';
import { requireRole, type StaffContext } from '@/server/auth/guards';
import { apply } from '@/server/services/adjustment-service';

import { applyAdjustmentAction } from './finance-adjustments';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireRole: vi.fn(), requireAal2: vi.fn() }));
vi.mock('@/server/auth/finance-guards', () => ({ requireFinanceStepUp: vi.fn() }));
vi.mock('@/server/services/adjustment-service', () => ({
  apply: vi.fn(),
  approve: vi.fn(),
  propose: vi.fn(),
  reject: vi.fn(),
}));
vi.mock('@/server/services/finance-service', () => ({ findFinanceBooking: vi.fn() }));
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
const ADJUSTMENT_ID = '3f1c2a6e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
  vi.mocked(requireFinanceStepUp).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
});

describe('applyAdjustmentAction (review of PR #69, M-2: a transfer Midtrans overtook)', () => {
  it('answers an applied adjustment as applied', async () => {
    vi.mocked(apply).mockResolvedValue({
      id: ADJUSTMENT_ID,
      status: 'applied',
      applyNotBefore: null,
    });
    await expect(applyAdjustmentAction({ adjustmentId: ADJUSTMENT_ID })).resolves.toEqual({
      ok: true,
      data: { id: ADJUSTMENT_ID, status: 'applied', applyNotBefore: null, outcome: 'applied' },
    });
  });

  it("answers apply_adjustment's rejected row as an overtaken result, not an error", async () => {
    vi.mocked(apply).mockResolvedValue({
      id: ADJUSTMENT_ID,
      status: 'rejected',
      applyNotBefore: null,
    });
    await expect(applyAdjustmentAction({ adjustmentId: ADJUSTMENT_ID })).resolves.toMatchObject({
      ok: true,
      data: { status: 'rejected', outcome: 'overtaken' },
    });
  });

  it('applies nothing without the step-up', async () => {
    vi.mocked(requireFinanceStepUp).mockResolvedValue({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Masukkan kode autentikator lagi.' },
    });
    await expect(applyAdjustmentAction({ adjustmentId: ADJUSTMENT_ID })).resolves.toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(apply).not.toHaveBeenCalled();
  });
});
