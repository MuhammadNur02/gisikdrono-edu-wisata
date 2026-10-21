import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy/id';
import { requireAal2, type StaffContext } from '@/server/auth/guards';
import {
  createHeroBanner,
  removeHeroBanner,
  updateHeroBanner,
} from '@/server/services/hero-banner-service';

import {
  createHeroBannerAction,
  removeHeroBannerAction,
  updateHeroBannerAction,
} from './hero-banners';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/server/auth/guards', () => ({ requireAal2: vi.fn() }));
vi.mock('@/server/services/hero-banner-service', () => ({
  createHeroBanner: vi.fn(),
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
