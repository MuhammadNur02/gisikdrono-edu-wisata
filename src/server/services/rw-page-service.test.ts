import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import { updateRwPageSchema } from '@/lib/validations/rw-page';
import type { StaffContext } from '@/server/auth/guards';
import { removeGalleryFiles } from '@/server/services/upload-service';

import { updateRwPage } from './rw-page-service';
import { fakeSessionClient } from '../../../tests/fixtures/fake-session-client';

const session = vi.hoisted(() => ({ client: null as SupabaseClient<Database> | null }));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve(session.client),
}));
vi.mock('@/server/services/upload-service', () => ({ removeGalleryFiles: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const ADMIN_05: StaffContext = {
  userId: '00000000-0000-4000-8000-00000000f005',
  role: 'admin_rw',
  rwId: 5,
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
};
const OLD_PHOTO = 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp';
const NEW_PHOTO = 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abce.webp';
const STORED = {
  id: 5,
  name: 'RW 05 Ecowastreme',
  tagline: 'Kampung bebas sampah',
  description_md: null,
  vision_md: null,
  hero_image_path: OLD_PHOTO,
  contact_phone: null,
  contact_email: null,
  map_lat: null,
  map_lng: null,
};

function pageWith(heroImagePath: string | null) {
  return updateRwPageSchema.parse({
    tagline: STORED.tagline,
    descriptionMd: '',
    visionMd: '',
    heroImagePath,
    contactPhone: '',
    contactEmail: '',
    mapLat: null,
    mapLng: null,
  });
}

beforeEach(() => {
  session.client = fakeSessionClient(STORED).client;
  vi.mocked(removeGalleryFiles).mockReset().mockResolvedValue([]);
});

// docs/Security.md R34 (decision of 2026-10-21): the photo the page stops showing leaves public-media, unless a
// gallery item still shows it (removeGalleryFiles counts every row that does).
describe('RW page photo', () => {
  it('removes the photo the page no longer shows', async () => {
    const result = await updateRwPage(ADMIN_05, 5, pageWith(NEW_PHOTO));
    expect(removeGalleryFiles).toHaveBeenCalledWith(ADMIN_05, 5, [OLD_PHOTO]);
    expect(result.filesRemoved).toBe(true);
  });

  it('removes it too when the page shows no photo any more', async () => {
    await updateRwPage(ADMIN_05, 5, pageWith(null));
    expect(removeGalleryFiles).toHaveBeenCalledWith(ADMIN_05, 5, [OLD_PHOTO]);
  });

  it('removes nothing when the photo stays', async () => {
    await updateRwPage(ADMIN_05, 5, pageWith(OLD_PHOTO));
    expect(removeGalleryFiles).not.toHaveBeenCalled();
  });
});
