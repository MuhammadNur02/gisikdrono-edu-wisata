import { beforeEach, describe, expect, it, vi } from 'vitest';

import { staffCopy } from '@/lib/copy/staff';
import { fail } from '@/lib/errors';
import { requireFreshTotp, requireRole, type StaffContext } from '@/server/auth/guards';
import { acknowledgeSecurityAlert } from '@/server/services/security-service';

import { acknowledgeSecurityAlertAction } from './security-alerts';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireRole: vi.fn(), requireFreshTotp: vi.fn() }));
vi.mock('@/server/services/security-service', () => ({ acknowledgeSecurityAlert: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const ALERT_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000d4';
const SUPERADMIN: StaffContext = {
  userId: 'super-1',
  role: 'superadmin',
  rwId: null,
  isAal2: true,
  totpVerifiedAt: 1_000,
  claimsVersion: 1,
};

beforeEach(() => {
  vi.mocked(requireRole).mockReset().mockResolvedValue({ ok: true, ctx: SUPERADMIN });
  vi.mocked(requireFreshTotp).mockReset().mockResolvedValue({ ok: true, ctx: SUPERADMIN });
  vi.mocked(acknowledgeSecurityAlert).mockReset();
});

describe('acknowledgeSecurityAlertAction', () => {
  it('acknowledges in the superadmin’s own name after a fresh code', async () => {
    await expect(acknowledgeSecurityAlertAction({ alertId: ALERT_ID })).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(requireFreshTotp).toHaveBeenCalledWith(300);
    expect(acknowledgeSecurityAlert).toHaveBeenCalledWith(SUPERADMIN, ALERT_ID);
  });

  it('refuses an RW admin and a stale session before the service', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(acknowledgeSecurityAlertAction({ alertId: ALERT_ID })).resolves.toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    vi.mocked(requireFreshTotp).mockResolvedValueOnce(fail('FORBIDDEN'));
    await expect(acknowledgeSecurityAlertAction({ alertId: ALERT_ID })).resolves.toMatchObject({
      error: { message: staffCopy.notFresh },
    });
    expect(acknowledgeSecurityAlert).not.toHaveBeenCalled();
  });

  it('refuses an id that is not one, and a name the browser chose', async () => {
    const result = await acknowledgeSecurityAlertAction({ alertId: ALERT_ID, acknowledgedBy: 'x' });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(requireRole).not.toHaveBeenCalled();
  });
});
