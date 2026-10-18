import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { listActivityPoints } from '@/lib/queries/activity-points';
import { listArticles, getArticleBySlug } from '@/lib/queries/articles';
import { listHeroBanners } from '@/lib/queries/banners';
import { getBookletBySlug, listBooklets } from '@/lib/queries/booklets';
import { listGalleryPage, listGalleryPages } from '@/lib/queries/galleries';
import { getPackageBySlug, listPackages } from '@/lib/queries/packages';
import { getProductBySlug, listProducts } from '@/lib/queries/products';
import { listPublicReviews } from '@/lib/queries/reviews';
import { getRwUnitBySlug, listRwUnits } from '@/lib/queries/rw-units';
import { listSchedules } from '@/lib/queries/schedules';
import { listAvailableSessions } from '@/lib/queries/sessions';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import { getVendorBySlug, listVendors } from '@/lib/queries/vendors';

import { localStack, runSql } from '../../scripts/local-stack';

// Every public query of src/lib/queries against the seeded local stack, as a visitor: the real anon key, the
// real column grants and RLS policies of 0005. A query that selects a column anon may not read, or embeds a
// table it cannot reach, fails here rather than on the first visitor. The cache is not under test.
vi.mock('next/cache', () => ({ unstable_cache: <Read>(read: Read) => read }));
vi.mock('@/lib/supabase/anon', () => ({
  createSupabaseAnonClient: () =>
    createClient(localStack().apiUrl, localStack().anonKey, { auth: { persistSession: false } }),
}));

const PUBLISHED_PHOTO_ID = '00000000-0000-4000-9000-0000000005a1';
const DRAFT_PHOTO_ID = '00000000-0000-4000-9000-0000000005a2';
const VIDEO_ID = '00000000-0000-4000-9000-0000000005a3';
const VIDEO_WITHOUT_ID = '00000000-0000-4000-9000-0000000005a4';
const YOUTUBE_ID = 'aqz-KE-bpKQ';
const BLURHASH = 'LEHV6nWB2yk8pyo0adR*.7kCMdnj';
// The first call asks the Supabase CLI for the stack's keys, which takes a while on Windows.
const SLOW_HOOK_MS = 60_000;
const idRowsSchema = z.array(z.object({ id: z.coerce.number() }));

describe('public queries as a visitor', () => {
  let auditIdBefore = 0;

  beforeAll(async () => {
    auditIdBefore =
      idRowsSchema.parse(
        await runSql('select coalesce(max(id), 0) as id from public.audit_logs'),
      )[0]?.id ?? 0;
    await runSql(`insert into public.galleries (id, rw_id, category, storage_path, width, height, blurhash,
        alt_text, caption, status, sort_order) values
      ('${PUBLISHED_PHOTO_ID}', 8, 'event', 'rw-08/gallery/fixture.webp', 1600, 1200, '${BLURHASH}',
       'Foto uji', 'Uji', 'published', -1),
      ('${DRAFT_PHOTO_ID}', 8, 'event', 'rw-08/gallery/draft.webp', 1600, 1200, null,
       'Foto draf', 'Draf', 'draft', -1)`);
    await runSql(`insert into public.galleries (id, rw_id, category, media_type, storage_path, video_url,
        alt_text, status) values
      ('${VIDEO_ID}', 8, 'activity', 'video', 'rw-08/gallery/video.webp',
       'https://www.youtube.com/watch?v=${YOUTUBE_ID}', 'Video uji', 'published'),
      ('${VIDEO_WITHOUT_ID}', 8, 'activity', 'video', 'rw-08/gallery/channel.webp',
       'https://www.youtube.com/channel/UCabcdefghijk', 'Video tanpa id', 'published')`);
  }, SLOW_HOOK_MS);

  afterAll(async () => {
    await runSql(`select set_config('app.purge', 'on', true);
      delete from public.galleries where id in ('${PUBLISHED_PHOTO_ID}', '${DRAFT_PHOTO_ID}', '${VIDEO_ID}',
        '${VIDEO_WITHOUT_ID}');
      delete from public.audit_logs where id > ${String(auditIdBefore)};`);
  }, SLOW_HOOK_MS);

  it('reads the two RW profiles, never their treasury', async () => {
    const units = await listRwUnits();

    expect(units.map((unit) => unit.slug)).toEqual([
      'rw-05-ecowastreme',
      'rw-08-kampung-seni-budaya',
    ]);
    expect(Object.keys(units[0] ?? {})).not.toContain('treasuryAccountNumber');
    expect((await getRwUnitBySlug('rw-08-kampung-seni-budaya'))?.id).toBe(8);
    expect(await getRwUnitBySlug('rw-99')).toBeNull();
  });

  it('reads published packages with their legs, the combo visiting both RWs', async () => {
    const packages = await listPackages();
    const combo = packages.find((item) => item.category === 'combo');

    expect(packages.length).toBeGreaterThanOrEqual(3);
    expect(combo?.rwIds).toEqual([5, 8]);
    const detail = await getPackageBySlug('paket-eduwisata-ecowastreme');
    expect(detail).toMatchObject({ rwIds: [5], pricePerPax: 35000, itinerary: [], priceTiers: [] });
    expect(await getPackageBySlug('paket-tidak-ada')).toBeNull();
  });

  it('reads products with their vendor, and vendors without owner or bank details', async () => {
    const products = await listProducts();
    const compost = await getProductBySlug('pupuk-kompos-1kg');
    const vendor = await getVendorBySlug('bank-sampah-lestari');

    expect(products.every((product) => product.vendor !== null)).toBe(true);
    expect(compost).toMatchObject({
      rwId: 5,
      price: 15000,
      vendor: { name: 'Bank Sampah Lestari' },
    });
    expect((await listVendors()).length).toBeGreaterThanOrEqual(2);
    expect(vendor && Object.keys(vendor).sort()).toEqual(
      ['descriptionMd', 'id', 'logo', 'name', 'rwId', 'slug'].sort(),
    );
  });

  it('reads articles and booklets', async () => {
    expect((await listArticles()).length).toBeGreaterThanOrEqual(2);
    expect((await getArticleBySlug('mengenal-bank-sampah-rw-05'))?.body).toMatchObject({
      type: 'doc',
    });
    expect((await listBooklets()).length).toBeGreaterThanOrEqual(2);
    expect(await getBookletBySlug('booklet-ecowastreme')).toMatchObject({
      pdfPath: 'rw-05/booklets/demo/booklet.pdf',
    });
  });

  it('pages the gallery with published items only, each with its placeholder colour', async () => {
    const page = await listGalleryPage({ owner: 8, category: 'event' });

    expect(page.items.map((item) => item.id)).toEqual([PUBLISHED_PHOTO_ID]);
    expect(page.items[0]?.image?.placeholderColour).toMatch(/^#[0-9a-f]{6}$/);
    expect(page.hasMore).toBe(false);
    expect((await listGalleryPage({ owner: 'kelurahan' })).items).toEqual([]);
  });

  it('passes a video on as its YouTube id alone and leaves out one without a usable id', async () => {
    const page = await listGalleryPage({ owner: 8, category: 'activity' });

    expect(page.items).toEqual([
      expect.objectContaining({
        id: VIDEO_ID,
        youtubeId: YOUTUBE_ID,
        image: null,
        alt: 'Video uji',
      }),
    ]);
    expect(JSON.stringify(page)).not.toContain('youtube.com');
  });

  it('reads pages up to the one asked for and stops where the gallery ends', async () => {
    await expect(listGalleryPages({ owner: 8, category: 'event' }, 5)).resolves.toMatchObject({
      pageCount: 1,
      hasMore: false,
    });
  });

  it('reads the remaining public tables without a grant error', async () => {
    await expect(listHeroBanners()).resolves.toBeInstanceOf(Array);
    await expect(listSchedules()).resolves.toBeInstanceOf(Array);
    await expect(listActivityPoints()).resolves.toBeInstanceOf(Array);
    await expect(listPublicReviews()).resolves.toBeInstanceOf(Array);
  });

  it('reads the public settings and hides the seeded sample contacts', async () => {
    const settings = await getPublicSiteSettings();

    expect(settings).toMatchObject({ bookingEnabled: true, maxPax: 500, contactEmail: null });
    expect(settings.kelurahanAddress).toContain('Gisikdrono');
  });

  it('reads the open sessions the seed planned, with the seats left', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const inSixtyDays = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

    const sessions = await listAvailableSessions({ rwId: 5, from: today, to: inSixtyDays });

    expect(sessions.length).toBeGreaterThan(0);
    expect(
      sessions.every((session) => session.rwId === 5 && session.remaining <= session.capacity),
    ).toBe(true);
  });
});
