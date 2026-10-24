import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy/id';
import { requireRole, type StaffContext } from '@/server/auth/guards';
import { countCheckInsToday } from '@/server/services/dashboard-stats-service';

import { readCheckInsTodayAction, setRwScopeAction } from './dashboard';
import { updateProfileAction } from './profile';

const cookieJar = vi.hoisted(() => ({
  set: vi.fn(),
  get: vi.fn<(name: string) => { value: string } | undefined>(),
}));
vi.mock('@/server/services/dashboard-stats-service', () => ({ countCheckInsToday: vi.fn() }));

vi.mock('next/headers', () => ({ cookies: () => Promise.resolve(cookieJar) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireRole: vi.fn() }));
// The RWs of rw_units: the two of the seed.
vi.mock('@/server/services/rw-unit-service', () => ({
  listRwUnitsForStaff: () => Promise.resolve([{ id: 5 }, { id: 8 }]),
}));
vi.mock('@/server/services/profile-service', () => ({
  updateOwnProfile: (userId: string, values: { fullName: string; phone?: string | null }) =>
    Promise.resolve({
      fullName: values.fullName,
      email: `${userId}@dev.gisikdrono.test`,
      phone: values.phone ?? null,
    }),
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
  cookieJar.get.mockReset();
  vi.mocked(countCheckInsToday).mockReset().mockResolvedValue(12);
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

describe('readCheckInsTodayAction', () => {
  const RW_05: StaffContext = { ...SUPERADMIN, userId: 'rw05', role: 'admin_rw', rwId: 5 };

  it('counts the superadmin’s switcher RW, or every RW under Semua', async () => {
    cookieJar.get.mockReturnValueOnce({ value: '8' });
    expect(await readCheckInsTodayAction()).toEqual({ ok: true, data: 12 });
    expect(countCheckInsToday).toHaveBeenLastCalledWith(8);

    expect(await readCheckInsTodayAction()).toEqual({ ok: true, data: 12 });
    expect(countCheckInsToday).toHaveBeenLastCalledWith(null);
  });

  it('keeps an RW officer to their own RW whatever the cookie says', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({ ok: true, ctx: RW_05 });
    cookieJar.get.mockReturnValueOnce({ value: '8' });
    await readCheckInsTodayAction();
    expect(countCheckInsToday).toHaveBeenLastCalledWith(5);
  });

  it('refuses an AAL1 session and an RW officer without an RW, counting nothing', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({ ok: true, ctx: { ...RW_05, isAal2: false } });
    expect(await readCheckInsTodayAction()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    vi.mocked(requireRole).mockResolvedValueOnce({ ok: true, ctx: { ...RW_05, rwId: null } });
    expect(await readCheckInsTodayAction()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(countCheckInsToday).not.toHaveBeenCalled();
  });

  it('answers a failed read with the generic error', async () => {
    vi.mocked(countCheckInsToday).mockRejectedValueOnce(new Error('connection reset'));
    expect(await readCheckInsTodayAction()).toMatchObject({ error: { code: 'INTERNAL' } });
  });
});

describe('updateProfileAction', () => {
  it('saves the staff member’s own name', async () => {
    expect(await updateProfileAction({ fullName: ' Superadmin Baru ' })).toEqual({
      ok: true,
      data: { fullName: 'Superadmin Baru', email: 'super@dev.gisikdrono.test', phone: null },
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

describe('updateProfileAction phone', () => {
  it('saves the staff member’s own phone in E.164', async () => {
    expect(await updateProfileAction({ fullName: 'Siti', phone: '0812 3456 7890' })).toMatchObject({
      ok: true,
      data: { phone: '+6281234567890' },
    });
  });
});
