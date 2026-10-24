import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAal2, type StaffContext } from '@/server/auth/guards';
import {
  archiveActivityPoint,
  createActivityPoint,
  readActivityPointOwner,
  removeActivityPoint,
  updateActivityPoint,
} from '@/server/services/activity-point-service';

import {
  archiveActivityPointAction,
  createActivityPointAction,
  removeActivityPointAction,
  updateActivityPointAction,
} from './activity-points';

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
vi.mock('@/server/services/activity-point-service', () => ({
  archiveActivityPoint: vi.fn(),
  createActivityPoint: vi.fn(),
  readActivityPointOwner: vi.fn(),
  removeActivityPoint: vi.fn(),
  updateActivityPoint: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const BASE = { userId: 'user-1', isAal2: true, totpVerifiedAt: null, claimsVersion: 1 };
const ADMIN_05: StaffContext = { ...BASE, role: 'admin_rw', rwId: 5 };
const SUPERADMIN: StaffContext = { ...BASE, role: 'superadmin', rwId: null };
const POINT_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const INPUT = {
  id: POINT_ID,
  name: 'Bank Sampah Sumber Rejeki',
  slug: 'bank-sampah-sumber-rejeki',
  pointType: 'bank_sampah',
  shortDescription: '',
  bodyMd: '',
  imagePath: null,
  mapX: 40,
  mapY: 55.5,
  svgHotspotId: null,
  lat: null,
  lng: null,
  sortOrder: 0,
  status: 'published',
};

beforeEach(() => {
  cookie.value = undefined;
  vi.mocked(requireAal2).mockReset().mockResolvedValue({ ok: true, ctx: ADMIN_05 });
  for (const mock of [createActivityPoint, updateActivityPoint, removeActivityPoint])
    vi.mocked(mock).mockReset();
  vi.mocked(readActivityPointOwner).mockReset().mockResolvedValue(5);
  // A removal whose files all went, unless a test says otherwise.
  vi.mocked(removeActivityPoint).mockResolvedValue(true);
  vi.mocked(archiveActivityPoint).mockReset().mockResolvedValue(undefined);
  vi.mocked(revalidateTag).mockReset();
});

describe('createActivityPointAction', () => {
  it("adds the point to the RW admin's own RW, even with an RW 08 scope cookie", async () => {
    cookie.value = '8';
    await createActivityPointAction(INPUT);
    expect(createActivityPoint).toHaveBeenCalledWith(
      ADMIN_05,
      5,
      expect.objectContaining({ slug: INPUT.slug }),
    );
    expect(revalidateTag).toHaveBeenCalledWith('activity-points:all');
  });

  // Mass assignment: the RW and the columns no API role writes are not fields of the form.
  it.each([
    ['rwId', 8],
    ['createdAt', '2020-01-01'],
  ])('refuses an extra field %s', async (field, value) => {
    expect(await createActivityPointAction({ ...INPUT, [field]: value })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(createActivityPoint).not.toHaveBeenCalled();
  });

  // svg_hotspot_id binds the point to one element of public/map/denah.svg (PLAN_HOTSPOT_IDS); any other id is refused.
  it('binds a hotspot to a plan element the plan has, and refuses one it has not', async () => {
    await createActivityPointAction({ ...INPUT, svgHotspotId: 'rw-13-sanggar' });
    expect(createActivityPoint).toHaveBeenCalledWith(
      ADMIN_05,
      5,
      expect.objectContaining({ svgHotspotId: 'rw-13-sanggar' }),
    );
    expect(
      await createActivityPointAction({ ...INPUT, svgHotspotId: 'rw-08-sanggar' }),
    ).toMatchObject({ error: { code: 'VALIDATION' } });
  });

  it('asks the superadmin to pick an RW under Semua', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    expect(await createActivityPointAction(INPUT)).toMatchObject({
      error: { code: 'STATE_INVALID' },
    });
    expect(createActivityPoint).not.toHaveBeenCalled();
  });
});

describe('updateActivityPointAction and removeActivityPointAction', () => {
  it("changes a point of the RW admin's own RW and refreshes that RW's points", async () => {
    await updateActivityPointAction(INPUT);
    expect(updateActivityPoint).toHaveBeenCalledWith(
      ADMIN_05,
      5,
      expect.objectContaining({ id: POINT_ID }),
    );
    expect(revalidateTag).toHaveBeenCalledWith('activity-points:all');
  });

  // The guard half of the task's proof: should RLS ever show an RW 05 admin a point of RW 08, the action still
  // refuses before the service writes (the RLS half is supabase/tests/rls_content_writes.sql).
  it('refuses an RW 05 admin a point the database holds for RW 08', async () => {
    vi.mocked(readActivityPointOwner).mockResolvedValue(8);
    expect(await updateActivityPointAction(INPUT)).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(await removeActivityPointAction({ id: POINT_ID })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(updateActivityPoint).not.toHaveBeenCalled();
    expect(removeActivityPoint).not.toHaveBeenCalled();
  });

  it('answers NOT_FOUND for a point RLS hides', async () => {
    vi.mocked(readActivityPointOwner).mockResolvedValue(undefined);
    expect(await updateActivityPointAction(INPUT)).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('lets the superadmin change a point of any RW, under its own RW', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: SUPERADMIN });
    vi.mocked(readActivityPointOwner).mockResolvedValue(8);
    await removeActivityPointAction({ id: POINT_ID });
    expect(removeActivityPoint).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'superadmin' }),
      8,
      POINT_ID,
    );
    expect(revalidateTag).toHaveBeenCalledWith('activity-points:all');
  });
});

describe('archiveActivityPointAction', () => {
  it('archives a point of their own RW by status', async () => {
    const result = await archiveActivityPointAction({ id: POINT_ID });
    expect(result.ok).toBe(true);
    expect(archiveActivityPoint).toHaveBeenCalledWith(5, POINT_ID);
    expect(revalidateTag).toHaveBeenCalledWith('activity-points:all');
  });

  it("refuses an RW 05 admin another RW's point", async () => {
    vi.mocked(readActivityPointOwner).mockResolvedValue(8);
    const result = await archiveActivityPointAction({ id: POINT_ID });
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(archiveActivityPoint).not.toHaveBeenCalled();
  });
});
