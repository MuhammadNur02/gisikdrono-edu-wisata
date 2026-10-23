import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import { saveActivityPointSchema } from '@/lib/validations/activity-point';
import type { StaffContext } from '@/server/auth/guards';
import { keepRowPhotos } from '@/server/services/upload-service';

import { createActivityPoint, updateActivityPoint } from './activity-point-service';
import { fakeSessionClient } from '../../../tests/fixtures/fake-session-client';

const session = vi.hoisted(() => ({ client: null as SupabaseClient<Database> | null }));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve(session.client),
}));
vi.mock('@/server/services/upload-service', () => ({
  keepRowPhotos: vi.fn(),
  removeRowPhotos: vi.fn(),
}));
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
const POINT_ID = '0192f3a4-5b6c-7d8e-9f01-000000000a01';
const FOLDER = `rw-05/activity-points/${POINT_ID}`;
const OLD_PHOTO = `${FOLDER}/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp`;
const NEW_PHOTO = `${FOLDER}/0192f3a4-5b6c-7d8e-9f01-23456789abce.webp`;
const STORED = {
  id: POINT_ID,
  rw_id: 5,
  name: 'Komposter',
  slug: 'komposter',
  point_type: 'composter',
  short_description: null,
  body_md: null,
  image_path: OLD_PHOTO,
  map_x: null,
  map_y: null,
  svg_hotspot_id: null,
  lat: null,
  lng: null,
  sort_order: 0,
  status: 'published',
};
const TARGET = { rwId: 5, purpose: 'activity-point', entityId: POINT_ID };

function pointWith(imagePath: string | null) {
  return saveActivityPointSchema.parse({
    id: POINT_ID,
    name: 'Komposter',
    slug: 'komposter',
    pointType: 'composter',
    shortDescription: '',
    bodyMd: '',
    imagePath,
    mapX: null,
    mapY: null,
    svgHotspotId: null,
    lat: null,
    lng: null,
    sortOrder: 0,
    status: 'published',
  });
}

beforeEach(() => {
  session.client = fakeSessionClient(STORED).client;
  vi.mocked(keepRowPhotos).mockReset().mockResolvedValue(0);
});

// docs/Security.md R34 (decision of 2026-10-21): the point's folder keeps only the photo it shows.
describe('activity point photos', () => {
  it('keeps only the new photo when it replaces the old one', async () => {
    const result = await updateActivityPoint(ADMIN_05, 5, pointWith(NEW_PHOTO));
    expect(keepRowPhotos).toHaveBeenCalledWith(ADMIN_05, TARGET, [NEW_PHOTO]);
    expect(result.filesRemoved).toBe(true);
  });

  it('keeps none when the photo is taken off', async () => {
    await updateActivityPoint(ADMIN_05, 5, pointWith(null));
    expect(keepRowPhotos).toHaveBeenCalledWith(ADMIN_05, TARGET, []);
  });

  it('clears what a new point uploaded but did not keep', async () => {
    session.client = fakeSessionClient(null).client;
    await createActivityPoint(ADMIN_05, 5, pointWith(NEW_PHOTO));
    expect(keepRowPhotos).toHaveBeenCalledWith(ADMIN_05, TARGET, [NEW_PHOTO]);
  });

  it('says so when the folder could not be cleared', async () => {
    vi.mocked(keepRowPhotos).mockRejectedValue(new Error('storage down'));
    expect((await updateActivityPoint(ADMIN_05, 5, pointWith(NEW_PHOTO))).filesRemoved).toBe(false);
  });
});
