import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { staffCopy } from '@/lib/copy/staff';
import { fail } from '@/lib/errors';
import { requireFreshTotp, requireRole, type StaffContext } from '@/server/auth/guards';
import {
  getMaskedBankAccount,
  revealBankAccountNumber,
  setBankAccount,
} from '@/server/services/bank-account-service';

import {
  loadBankAccountAction,
  revealBankAccountAction,
  setBankAccountAction,
} from './bank-accounts';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireRole: vi.fn(), requireFreshTotp: vi.fn() }));
vi.mock('@/server/services/bank-account-service', () => ({
  getMaskedBankAccount: vi.fn(),
  revealBankAccountNumber: vi.fn(),
  setBankAccount: vi.fn(),
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
const RW_TARGET = { kind: 'rw', rwId: 5 };
const ACCOUNT = {
  target: RW_TARGET,
  bankName: 'BRI',
  accountNumber: '1234567890',
  accountHolder: 'Kas RW 05',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
  vi.mocked(requireFreshTotp).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
});

describe('the bank account actions', () => {
  it('show the masked account to the superadmin at AAL2 only', async () => {
    vi.mocked(getMaskedBankAccount).mockResolvedValue({
      bankName: 'BRI',
      accountHolder: 'Kas RW 05',
      accountMasked: '••••7890',
    });
    await expect(loadBankAccountAction({ target: RW_TARGET })).resolves.toMatchObject({ ok: true });
    expect(requireRole).toHaveBeenCalledWith('superadmin');
    vi.mocked(requireRole).mockResolvedValueOnce({
      ok: true,
      ctx: { ...SUPERADMIN, isAal2: false },
    });
    await expect(loadBankAccountAction({ target: RW_TARGET })).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    vi.mocked(requireRole).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(loadBankAccountAction({ target: RW_TARGET })).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(getMaskedBankAccount).toHaveBeenCalledTimes(1);
  });

  // Review of PR #79, L-5: an RW admin or a role-less session stops at the role, before any code is asked for.
  it('refuse a reveal and a change to anyone but the superadmin, before the service is called', async () => {
    vi.mocked(requireRole).mockResolvedValue(fail('FORBIDDEN'));
    await expect(
      revealBankAccountAction({ target: RW_TARGET, reason: 'Cek transfer' }),
    ).resolves.toMatchObject({ error: { code: 'FORBIDDEN' } });
    await expect(setBankAccountAction(ACCOUNT)).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(requireFreshTotp).not.toHaveBeenCalled();
    expect(revealBankAccountNumber).not.toHaveBeenCalled();
    expect(setBankAccount).not.toHaveBeenCalled();
  });

  it('reveal and change only with a fresh authenticator code', async () => {
    vi.mocked(requireFreshTotp).mockResolvedValue(fail('FORBIDDEN'));
    await expect(
      revealBankAccountAction({ target: RW_TARGET, reason: 'Cek transfer' }),
    ).resolves.toMatchObject({ error: { code: 'FORBIDDEN', message: staffCopy.notFresh } });
    await expect(setBankAccountAction(ACCOUNT)).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(revealBankAccountNumber).not.toHaveBeenCalled();
    expect(setBankAccount).not.toHaveBeenCalled();
  });

  it('return the revealed number, and refresh the settings page after a treasury change', async () => {
    vi.mocked(revealBankAccountNumber).mockResolvedValue('1234567890');
    await expect(
      revealBankAccountAction({ target: RW_TARGET, reason: 'Cek transfer' }),
    ).resolves.toEqual({ ok: true, data: '1234567890' });
    await expect(setBankAccountAction(ACCOUNT)).resolves.toEqual({ ok: true, data: null });
    expect(setBankAccount).toHaveBeenCalledWith(ACCOUNT);
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/settings');
  });
});
