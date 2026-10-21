import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy/id';
import { requireRole, type StaffContext } from '@/server/auth/guards';

import { setRwScopeAction } from './dashboard';
import { updateProfileAction } from './profile';

const cookieJar = vi.hoisted(() => ({ set: vi.fn() }));

vi.mock('next/headers', () => ({ cookies: () => Promise.resolve(cookieJar) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireRole: vi.fn() }));
// The RWs of rw_units: the two of the seed.
vi.mock('@/server/services/rw-unit-service', () => ({
  listRwUnitsForStaff: () => Promise.resolve([{ id: 5 }, { id: 8 }]),
}));
vi.mock('@/server/services/profile-service', () => ({
  updateOwnFullName: (userId: string, fullName: string) =>
    Promise.resolve({ fullName, email: `${userId}@dev.gisikdrono.test` }),
}));

const SUPERADMIN: StaffContext = {
  userId: 'super',
  role: 'superadmin',
  rwId: null,
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
};
const FORBIDDEN = {
  ok: false,
  error: { code: 'FORBIDDEN', message: copy.errors.FORBIDDEN },
} as const;

beforeEach(() => {
  cookieJar.set.mockReset();
  vi.mocked(requireRole).mockReset().mockResolvedValue({ ok: true, ctx: SUPERADMIN });
});

describe('setRwScopeAction', () => {
  it('keeps the superadmin’s choice in an httpOnly cookie under /dashboard', async () => {
    expect(await setRwScopeAction({ scope: 8 })).toEqual({ ok: true, data: null });
    expect(requireRole).toHaveBeenCalledWith('superadmin');
    expect(cookieJar.set).toHaveBeenCalledWith(
      'rw_scope',
      '8',
      expect.objectContaining({ httpOnly: true, secure: true, path: '/dashboard' }),
    );
  });

  it('refuses an RW officer and an AAL1 session, writing nothing', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce(FORBIDDEN);
    expect(await setRwScopeAction({ scope: 5 })).toMatchObject({ error: { code: 'FORBIDDEN' } });

    vi.mocked(requireRole).mockResolvedValueOnce({
      ok: true,
      ctx: { ...SUPERADMIN, isAal2: false },
    });
    expect(await setRwScopeAction({ scope: 5 })).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(cookieJar.set).not.toHaveBeenCalled();
  });

  // Independent review of Task P2.10.02, L2: the switcher points only at an RW that exists.
  it('refuses an RW number no row of rw_units has', async () => {
    expect(await setRwScopeAction({ scope: 42 })).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(cookieJar.set).not.toHaveBeenCalled();
  });

  it('refuses a scope that is not an RW', async () => {
    expect(await setRwScopeAction({ scope: 0 })).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(requireRole).not.toHaveBeenCalled();
  });
});

describe('updateProfileAction', () => {
  it('saves the staff member’s own name', async () => {
    expect(await updateProfileAction({ fullName: ' Superadmin Baru ' })).toEqual({
      ok: true,
      data: { fullName: 'Superadmin Baru', email: 'super@dev.gisikdrono.test' },
    });
    expect(requireRole).toHaveBeenCalledWith('superadmin', 'admin_rw');
  });

  it('refuses an AAL1 session and a name with a link', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({
      ok: true,
      ctx: { ...SUPERADMIN, isAal2: false },
    });
    expect(await updateProfileAction({ fullName: 'Nama' })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(await updateProfileAction({ fullName: 'https://evil.test' })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
  });
});
