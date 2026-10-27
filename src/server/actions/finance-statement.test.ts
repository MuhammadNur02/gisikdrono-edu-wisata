import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { statementCopy } from '@/lib/copy/midtrans-statement';
import { staffCopy } from '@/lib/copy/staff';
import { AppError, fail } from '@/lib/errors';
import { requireFreshTotp, requireRole, type StaffContext } from '@/server/auth/guards';
import { importStatement } from '@/server/services/statement-import-service';

import { importMidtransCsvAction } from './finance-statement';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireRole: vi.fn(), requireFreshTotp: vi.fn() }));
vi.mock('@/server/services/statement-import-service', () => ({ importStatement: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const SUPERADMIN: StaffContext = {
  userId: 'super-1',
  role: 'superadmin',
  rwId: null,
  isAal2: true,
  totpVerifiedAt: 1_000,
  claimsVersion: 1,
};
const INPUT = {
  fileName: 'midtrans-oktober.csv',
  rows: [{ orderId: 'GSK-7F3K9Q2M-01', status: 'settlement', grossAmount: '300000' }],
};
const SUMMARY = {
  runId: '0192f3a4-5b6c-7d8e-9f01-0000000000cc',
  rowsChecked: 1,
  issuesFound: 0,
  issuesAlreadyOpen: 0,
  alreadyImported: false,
};

beforeEach(() => {
  vi.mocked(requireRole).mockReset().mockResolvedValue({ ok: true, ctx: SUPERADMIN });
  vi.mocked(requireFreshTotp).mockReset().mockResolvedValue({ ok: true, ctx: SUPERADMIN });
  vi.mocked(importStatement).mockReset().mockResolvedValue(SUMMARY);
  vi.mocked(revalidatePath).mockReset();
});

describe('importMidtransCsvAction', () => {
  it('imports after a fresh code and refreshes the reconciliation page', async () => {
    await expect(importMidtransCsvAction(INPUT)).resolves.toEqual({ ok: true, data: SUMMARY });
    expect(requireRole).toHaveBeenCalledWith('superadmin');
    expect(requireFreshTotp).toHaveBeenCalledWith(300);
    expect(importStatement).toHaveBeenCalledWith({ ...INPUT, period: null });
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/finance/reconciliation');
  });

  it('refuses an RW admin and a stale code before the service', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(importMidtransCsvAction(INPUT)).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    vi.mocked(requireFreshTotp).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(importMidtransCsvAction(INPUT)).resolves.toMatchObject({
      error: { message: staffCopy.notFresh },
    });
    expect(importStatement).not.toHaveBeenCalled();
  });

  it('refuses rows of another shape before any guard', async () => {
    const result = await importMidtransCsvAction({
      ...INPUT,
      rows: [{ ...INPUT.rows[0], grossAmount: '1.5' }],
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(requireRole).not.toHaveBeenCalled();
  });

  it('answers a statement the database refuses with the service message', async () => {
    vi.mocked(importStatement).mockRejectedValueOnce(
      new AppError('VALIDATION', statementCopy.invalid),
    );
    await expect(importMidtransCsvAction(INPUT)).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: statementCopy.invalid },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
