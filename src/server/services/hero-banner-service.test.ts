import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import { updateHeroBannerSchema } from '@/lib/validations/hero-banner';
import type { StaffContext } from '@/server/auth/guards';
import { removeUnusedHeroPhotos } from '@/server/services/upload-service';

import { createHeroBanner, removeHeroBanner, updateHeroBanner } from './hero-banner-service';
import { fakeSessionClient } from '../../../tests/fixtures/fake-session-client';

const session = vi.hoisted(() => ({ client: null as SupabaseClient<Database> | null }));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve(session.client),
}));
vi.mock('@/server/services/upload-service', () => ({ removeUnusedHeroPhotos: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const SUPERADMIN: StaffContext = {
  userId: '00000000-0000-4000-8000-00000000f001',
  role: 'superadmin',
  rwId: null,
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
};
const BANNER_ID = '0192f3a4-5b6c-7d8e-9f01-000000000b01';
const OLD_PHOTO = 'kelurahan/hero/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp';
const NEW_PHOTO = 'kelurahan/hero/0192f3a4-5b6c-7d8e-9f01-23456789abce.webp';
const PHONE_PHOTO = 'kelurahan/hero/0192f3a4-5b6c-7d8e-9f01-23456789abcf.webp';
const STORED = {
  id: BANNER_ID,
  title: 'Kunjungi Bank Sampah',
  subtitle: null,
  cta_label: null,
  cta_href: null,
  image_path: OLD_PHOTO,
  mobile_image_path: PHONE_PHOTO,
  product_id: null,
  sort_order: 0,
  is_active: true,
  starts_at: null,
  ends_at: null,
};

function bannerWith(change: Record<string, unknown>) {
  return updateHeroBannerSchema.parse({
    id: BANNER_ID,
    title: STORED.title,
    subtitle: '',
    ctaLabel: '',
    ctaHref: '',
    imagePath: OLD_PHOTO,
    mobileImagePath: PHONE_PHOTO,
    productId: null,
    sortOrder: 0,
    isActive: true,
    startsAt: '',
    endsAt: '',
    ...change,
  });
}

beforeEach(() => {
  session.client = fakeSessionClient(STORED).client;
  vi.mocked(removeUnusedHeroPhotos).mockReset().mockResolvedValue([]);
});

// docs/Security.md R34 (decision of 2026-10-21): a photo taken off a banner leaves public-media in the same action.
describe('hero banner photos', () => {
  it('removes the photo a banner no longer shows, and keeps the one it still does', async () => {
    const result = await updateHeroBanner(SUPERADMIN, bannerWith({ imagePath: NEW_PHOTO }));
    expect(removeUnusedHeroPhotos).toHaveBeenCalledWith(SUPERADMIN, [OLD_PHOTO]);
    expect(result.filesRemoved).toBe(true);
  });

  it('removes nothing when the photos stay', async () => {
    await updateHeroBanner(SUPERADMIN, bannerWith({}));
    expect(removeUnusedHeroPhotos).not.toHaveBeenCalled();
  });

  it('takes both photos along when the banner is removed', async () => {
    expect(await removeHeroBanner(SUPERADMIN, BANNER_ID)).toBe(true);
    expect(removeUnusedHeroPhotos).toHaveBeenCalledWith(SUPERADMIN, [OLD_PHOTO, PHONE_PHOTO]);
  });

  it('says so when a photo could not be removed', async () => {
    vi.mocked(removeUnusedHeroPhotos).mockRejectedValue(new Error('storage down'));
    expect(await removeHeroBanner(SUPERADMIN, BANNER_ID)).toBe(false);
  });

  it('removes only a banner already switched off (review of PR #40)', async () => {
    const fake = fakeSessionClient(STORED);
    session.client = fake.client;
    await removeHeroBanner(SUPERADMIN, BANNER_ID);
    const [write] = fake.writes;
    expect(fake.writes).toHaveLength(1);
    expect(write?.method).toBe('DELETE');
    expect(write?.url).toContain('is_active=eq.false');
  });
});

describe('the featured product', () => {
  it('refuses a product that is not published, before anything is written', async () => {
    const fake = fakeSessionClient(null);
    session.client = fake.client;
    const values = bannerWith({ productId: '0192f3a4-5b6c-7d8e-9f01-000000000c01' });
    await expect(createHeroBanner(SUPERADMIN.userId, values)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(fake.writes).toEqual([]);
  });
});
