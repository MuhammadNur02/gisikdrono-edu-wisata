import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';
import { requireAal2, type StaffContext } from '@/server/auth/guards';
import {
  applyBannerOrder,
  createHeroBanner,
  deactivateHeroBanner,
  readBannerOrder,
  removeHeroBanner,
  updateHeroBanner,
} from '@/server/services/hero-banner-service';

import {
  createHeroBannerAction,
  deactivateHeroBannerAction,
  moveHeroBannerAction,
  removeHeroBannerAction,
  updateHeroBannerAction,
} from './hero-banners';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireAal2: vi.fn() }));
vi.mock('@/server/services/hero-banner-service', () => ({
  applyBannerOrder: vi.fn(),
  createHeroBanner: vi.fn(),
  deactivateHeroBanner: vi.fn(),
  readBannerOrder: vi.fn(),
  removeHeroBanner: vi.fn(),
  updateHeroBanner: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));

const BASE = { userId: 'user-1', isAal2: true, totpVerifiedAt: null, claimsVersion: 1 };
const ADMIN_05: StaffContext = { ...BASE, role: 'admin_rw', rwId: 5 };
const SUPERADMIN: StaffContext = { ...BASE, role: 'superadmin', rwId: null };
const BANNER_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const OTHER_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abce';
const BANNER = {
  title: 'Kunjungi Bank Sampah Sumber Rejeki',
  subtitle: '',
  ctaLabel: '',
  ctaHref: '',
  imagePath: 'kelurahan/hero/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp',
  mobileImagePath: null,
  productId: null,
  sortOrder: 0,
  isActive: true,
  startsAt: '',
  endsAt: '',
};

const SAVED_BANNER = {
  id: BANNER_ID,
  title: BANNER.title,
  subtitle: null,
  ctaLabel: null,
  ctaHref: null,
  imagePath: BANNER.imagePath,
  mobileImagePath: null,
  productId: null,
  sortOrder: 0,
  isActive: true,
  startsAt: null,
  endsAt: null,
};

beforeEach(() => {
  vi.mocked(requireAal2).mockReset().mockResolvedValue({ ok: true, ctx: SUPERADMIN });
  for (const mock of [createHeroBanner, updateHeroBanner, removeHeroBanner])
    vi.mocked(mock).mockReset();
  for (const mock of [applyBannerOrder, deactivateHeroBanner]) {
    vi.mocked(mock).mockReset().mockResolvedValue(undefined);
  }
  vi.mocked(readBannerOrder)
    .mockReset()
    .mockResolvedValue([
      { id: OTHER_ID, sortOrder: 0 },
      { id: BANNER_ID, sortOrder: 1 },
    ]);
  vi.mocked(revalidateTag).mockReset();
});

describe('hero banner actions', () => {
  it('saves the superadmin as the creator and refreshes the home page banners', async () => {
    await createHeroBannerAction(BANNER);
    expect(createHeroBanner).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ title: BANNER.title, imagePath: BANNER.imagePath }),
    );
    expect(revalidateTag).toHaveBeenCalledWith('banners');
  });

  it('refuses an RW admin every change, before the service', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: ADMIN_05 });
    for (const result of [
      await createHeroBannerAction(BANNER),
      await updateHeroBannerAction({ ...BANNER, id: BANNER_ID }),
      await removeHeroBannerAction({ id: BANNER_ID }),
    ]) {
      expect(result).toMatchObject({ error: { code: 'FORBIDDEN' } });
    }
    expect(createHeroBanner).not.toHaveBeenCalled();
    expect(updateHeroBanner).not.toHaveBeenCalled();
    expect(removeHeroBanner).not.toHaveBeenCalled();
  });

  it('refuses a form that names its creator', async () => {
    expect(await createHeroBannerAction({ ...BANNER, createdBy: 'user-2' })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(createHeroBanner).not.toHaveBeenCalled();
  });
});

// docs/Security.md R34 (decision of 2026-10-21): the officer hears when a photo could not be taken out of
// public-media, once the site has been refreshed.
describe('hero banner photos left behind', () => {
  it('says so after a removal that left a photo', async () => {
    vi.mocked(removeHeroBanner).mockResolvedValue(false);
    expect(await removeHeroBannerAction({ id: BANNER_ID })).toMatchObject({
      error: { code: 'INTERNAL', message: copy.cms.common.filesLeft },
    });
    expect(revalidateTag).toHaveBeenCalledWith('banners');
  });

  it('says so after a change that left the replaced photo', async () => {
    vi.mocked(updateHeroBanner).mockResolvedValue({ value: SAVED_BANNER, filesRemoved: false });
    expect(await updateHeroBannerAction({ ...BANNER, id: BANNER_ID })).toMatchObject({
      error: { code: 'INTERNAL', message: copy.cms.common.filesLeft },
    });
    expect(updateHeroBanner).toHaveBeenCalledWith(SUPERADMIN, expect.anything());
  });
});

describe('banner order and activity', () => {
  it('moves a banner up by renumbering it and the one above it', async () => {
    const result = await moveHeroBannerAction({ id: BANNER_ID, direction: 'up' });
    expect(result.ok).toBe(true);
    expect(applyBannerOrder).toHaveBeenCalledWith([
      { id: BANNER_ID, sortOrder: 0 },
      { id: OTHER_ID, sortOrder: 1 },
    ]);
    expect(revalidateTag).toHaveBeenCalledWith('banners');
  });

  it('answers false and writes nothing when the banner is already at that end', async () => {
    const result = await moveHeroBannerAction({ id: OTHER_ID, direction: 'up' });
    expect(result).toEqual({ ok: true, data: false });
    expect(applyBannerOrder).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('answers NOT_FOUND for a banner the order does not hold', async () => {
    vi.mocked(readBannerOrder).mockResolvedValue([]);
    const result = await moveHeroBannerAction({ id: BANNER_ID, direction: 'down' });
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(applyBannerOrder).not.toHaveBeenCalled();
  });

  it('switches a banner off for the superadmin only', async () => {
    expect((await deactivateHeroBannerAction({ id: BANNER_ID })).ok).toBe(true);
    expect(deactivateHeroBanner).toHaveBeenCalledWith(BANNER_ID);
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: ADMIN_05 });
    const refused = await deactivateHeroBannerAction({ id: BANNER_ID });
    expect(refused).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(deactivateHeroBanner).toHaveBeenCalledTimes(1);
  });
});

describe('removeHeroBannerAction on a row that is not archived (review of PR #40)', () => {
  it('answers STATE_INVALID with the archive-first copy and revalidates nothing', async () => {
    vi.mocked(removeHeroBanner).mockRejectedValueOnce(
      new AppError('STATE_INVALID', 'Nonaktifkan dulu sebelum menghapus permanen.'),
    );
    const result = await removeHeroBannerAction({ id: BANNER_ID });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'STATE_INVALID', message: 'Nonaktifkan dulu sebelum menghapus permanen.' },
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
