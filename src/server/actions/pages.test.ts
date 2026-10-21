import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAal2, type StaffContext } from '@/server/auth/guards';
import { updateRwPage } from '@/server/services/rw-page-service';

import { updateRwPageAction } from './pages';

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));

// The RWs of rw_units the RwSwitcher can point at.
vi.mock('@/server/services/rw-unit-service', () => ({
  listRwUnitsForStaff: () => Promise.resolve([{ id: 5 }, { id: 8 }, { id: 13 }]),
}));
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({ get: () => (cookie.value ? { value: cookie.value } : undefined) }),
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireAal2: vi.fn() }));
vi.mock('@/server/services/rw-page-service', () => ({ updateRwPage: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const BASE = { userId: 'user-1', isAal2: true, totpVerifiedAt: null, claimsVersion: 1 };
const ADMIN_05: StaffContext = { ...BASE, role: 'admin_rw', rwId: 5 };
const SUPERADMIN: StaffContext = { ...BASE, role: 'superadmin', rwId: null };
const INPUT = {
  tagline: 'Kampung bebas sampah',
  descriptionMd: '',
  visionMd: '',
  heroImagePath: null,
  contactPhone: '',
  contactEmail: '',
  mapLat: null,
  mapLng: null,
};

beforeEach(() => {
  cookie.value = undefined;
  vi.mocked(requireAal2).mockReset().mockResolvedValue({ ok: true, ctx: ADMIN_05 });
  vi.mocked(updateRwPage)
    .mockReset()
    .mockImplementation((_ctx, rwId) =>
      Promise.resolve({
        value: {
          rwId,
          path: '/rw-05-ecowastreme',
          name: 'RW',
          tagline: 'Kampung bebas sampah',
          descriptionMd: null,
          visionMd: null,
          heroImagePath: null,
          contactPhone: null,
          contactEmail: null,
          mapLat: null,
          mapLng: null,
        },
        filesRemoved: true,
      }),
    );
  vi.mocked(revalidateTag).mockReset();
});

describe('updateRwPageAction', () => {
  it("saves the RW admin's own page and refreshes the RW pages", async () => {
    expect(await updateRwPageAction(INPUT)).toMatchObject({ ok: true, data: { rwId: 5 } });
    expect(updateRwPage).toHaveBeenCalledWith(
      ADMIN_05,
      5,
      expect.objectContaining({ tagline: 'Kampung bebas sampah' }),
    );
    expect(revalidateTag).toHaveBeenCalledWith('rw-units');
  });

  // The task's rule: an RW 05 admin cannot reach RW 08's page, neither through the form nor a hand-made cookie.
  it('keeps an RW 05 admin on RW 05 even with an RW scope cookie of RW 08', async () => {
    cookie.value = '8';
    await updateRwPageAction(INPUT);
    expect(updateRwPage).toHaveBeenCalledWith(expect.anything(), 5, expect.anything());
    expect(updateRwPage).not.toHaveBeenCalledWith(expect.anything(), 8, expect.anything());
  });

  it('refuses a form that names an RW at all', async () => {
    expect(await updateRwPageAction({ ...INPUT, rwId: 8 })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(updateRwPage).not.toHaveBeenCalled();
  });

  it('saves the RW the superadmin picked, and asks them to pick one under Semua', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    cookie.value = '8';
    await updateRwPageAction(INPUT);
    expect(updateRwPage).toHaveBeenCalledWith(expect.anything(), 8, expect.anything());

    cookie.value = undefined;
    vi.mocked(updateRwPage).mockClear();
    expect(await updateRwPageAction(INPUT)).toMatchObject({ error: { code: 'STATE_INVALID' } });
    expect(updateRwPage).not.toHaveBeenCalled();
  });

  it('refuses a session below AAL2 before anything is written', async () => {
    vi.mocked(requireAal2).mockResolvedValue({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'x' },
    });
    expect(await updateRwPageAction(INPUT)).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(updateRwPage).not.toHaveBeenCalled();
  });
});
