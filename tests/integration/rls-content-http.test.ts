import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ownerFor } from '@/lib/uploads/paths';

import {
  lastAuditId,
  removeSignInTraces,
  signInDevAccount,
  userIdOf,
  type ApiClient,
} from './helpers/staff-session';
import { runSql, sqlText } from '../../scripts/local-stack';

// The RLS half of the CMS's cross-RW proof (Task P2.9.06, docs/Security.md AZ-03) over HTTP: the real AAL2 token of
// the RW 05 development admin, writing through PostgREST exactly as the session client of the CMS services does,
// changes none of RW 08's content, creates none for RW 08 or the kelurahan, and cannot move or publish its own.
// It cannot take its own published article off the site or move its address either, nor point its own content at
// a file outside its own folders (independent review of PR #18, findings 1 and 2).
// The guard half is in src/server/actions/*.test.ts; supabase/tests/{rls_content_writes,articles_published_guard,
// content_media_paths}.sql repeat this in SQL.

const SLOW_TEST_MS = 60_000;
const ROW_08 = {
  gallery: '00000000-0000-4000-9000-0000000c0081',
  article: '00000000-0000-4000-9000-0000000c0082',
  booklet: '00000000-0000-4000-9000-0000000c0083',
  point: '00000000-0000-4000-9000-0000000c0084',
  schedule: '00000000-0000-4000-9000-0000000c0085',
};
const OWN = {
  article: '00000000-0000-4000-9000-0000000c0051',
  published: '00000000-0000-4000-9000-0000000c0052',
  booklet: '00000000-0000-4000-9000-0000000c0053',
  gallery: '00000000-0000-4000-9000-0000000c0054',
  point: '00000000-0000-4000-9000-0000000c0055',
};
const OWN_ARTICLE = OWN.article;
const OTHER_BOOKLET = '00000000-0000-4000-9000-0000000c0059';
const RW08_PHOTO = 'rw-08/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp';
const CHECK_VIOLATION = '23514';
const SLUG_PREFIX = 'uji-cms-http';
const UNTOUCHED = 'asli';

async function seedContent(): Promise<void> {
  await runSql(`
    insert into public.galleries (id, rw_id, category, storage_path, alt_text, caption, status)
      values ('${ROW_08.gallery}', 8, 'activity', '${RW08_PHOTO}', 'Tari anak', '${UNTOUCHED}', 'published'),
             ('${OWN.gallery}', 5, 'activity', 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp',
              'Warga memilah sampah', 'milik RW 05', 'published');
    insert into public.articles (id, rw_id, slug, title, status, published_at) values
      ('${ROW_08.article}', 8, '${SLUG_PREFIX}-a8', '${UNTOUCHED}', 'draft', null),
      ('${OWN.article}', 5, '${SLUG_PREFIX}-a5', 'Artikel RW 05', 'draft', null),
      ('${OWN.published}', 5, '${SLUG_PREFIX}-a5-tayang', 'Artikel tayang RW 05', 'published', now());
    insert into public.booklets (id, rw_id, slug, title, pdf_path, status) values
      ('${ROW_08.booklet}', 8, '${SLUG_PREFIX}-b8', '${UNTOUCHED}',
       'rw-08/booklets/${ROW_08.booklet}/booklet.pdf', 'draft'),
      ('${OWN.booklet}', 5, '${SLUG_PREFIX}-b5', 'Booklet RW 05', 'rw-05/booklets/${OWN.booklet}/booklet.pdf', 'draft');
    insert into public.activity_points (id, rw_id, slug, name, point_type, status) values
      ('${ROW_08.point}', 8, '${SLUG_PREFIX}-p8', '${UNTOUCHED}', 'sanggar', 'published'),
      ('${OWN.point}', 5, '${SLUG_PREFIX}-p5', 'Komposter', 'composter', 'published');
    insert into public.performance_schedules (id, rw_id, title, schedule_type, starts_at, ends_at, status)
      values ('${ROW_08.schedule}', 8, '${UNTOUCHED}', 'dance_performance', now() + interval '3 days',
              now() + interval '3 days 2 hours', 'published');`);
}

// The RW 05 page keeps its own photo through the suite, whatever a write that should fail did.
async function readRw05Hero(): Promise<string | null> {
  const rows = z
    .array(z.object({ hero_image_path: z.string().nullable() }))
    .parse(await runSql('select hero_image_path from public.rw_units where id = 5'));
  return rows[0]?.hero_image_path ?? null;
}

async function restoreRw05Hero(path: string | null): Promise<void> {
  await runSql(
    `update public.rw_units set hero_image_path = ${path === null ? 'null' : sqlText(path)} where id = 5`,
  );
}

async function removeContent(): Promise<void> {
  const ids = [...Object.values(ROW_08), ...Object.values(OWN)].map((id) => `'${id}'`).join(', ');
  await runSql(`
    delete from public.galleries where id in (${ids});
    delete from public.articles where id in (${ids}) or slug like '${SLUG_PREFIX}%';
    delete from public.booklets where id in (${ids}) or slug like '${SLUG_PREFIX}%';
    delete from public.activity_points where id in (${ids}) or slug like '${SLUG_PREFIX}%';
    delete from public.performance_schedules where id in (${ids});`);
}

// What the database holds for RW 08's rows, read as postgres: every value still the seeded one.
async function rw08Values(): Promise<string[]> {
  const rows = await runSql(`
    select caption as value from public.galleries where id = '${ROW_08.gallery}'
    union all select title from public.articles where id = '${ROW_08.article}'
    union all select title from public.booklets where id = '${ROW_08.booklet}'
    union all select name from public.activity_points where id = '${ROW_08.point}'
    union all select title from public.performance_schedules where id = '${ROW_08.schedule}'
    union all select coalesce(tagline, '') from public.rw_units where id = 8`);
  return z
    .array(z.object({ value: z.string() }))
    .parse(rows)
    .map((row) => row.value);
}

describe(
  'CMS writes across RWs through PostgREST with a real RW 05 token',
  () => {
    let auditIdBefore = 0;
    let admin05: ApiClient;
    let admin05Id = '';
    let rw08Before: string[] = [];
    let rw05Hero: string | null = null;

    beforeAll(async () => {
      auditIdBefore = await lastAuditId();
      rw05Hero = await readRw05Hero();
      await removeContent();
      await seedContent();
      rw08Before = await rw08Values();
      admin05 = await signInDevAccount('admin-rw05@dev.gisikdrono.test');
      admin05Id = await userIdOf(admin05);
    }, SLOW_TEST_MS);

    afterAll(async () => {
      await restoreRw05Hero(rw05Hero);
      await removeContent();
      await removeSignInTraces(auditIdBefore);
    }, SLOW_TEST_MS);

    it("changes and removes none of RW 08's content or its RW page", async () => {
      const changed = 'diubah RW 05';
      const updates = await Promise.all([
        admin05
          .from('galleries')
          .update({ caption: changed })
          .eq('id', ROW_08.gallery)
          .select('id'),
        admin05.from('articles').update({ title: changed }).eq('id', ROW_08.article).select('id'),
        admin05.from('booklets').update({ title: changed }).eq('id', ROW_08.booklet).select('id'),
        admin05
          .from('activity_points')
          .update({ name: changed })
          .eq('id', ROW_08.point)
          .select('id'),
        admin05
          .from('performance_schedules')
          .update({ title: changed })
          .eq('id', ROW_08.schedule)
          .select('id'),
        admin05.from('rw_units').update({ tagline: changed }).eq('id', 8).select('id'),
        admin05.from('galleries').delete().eq('id', ROW_08.gallery).select('id'),
        admin05.from('activity_points').delete().eq('id', ROW_08.point).select('id'),
      ]);
      for (const result of updates) expect(result.data ?? []).toEqual([]);
      expect(await rw08Values()).toEqual(rw08Before);
    });

    it('creates no content for RW 08 or for the kelurahan', async () => {
      for (const rwId of [8, null]) {
        const tag = rwId === null ? 'kel' : String(rwId);
        const owner = ownerFor(rwId);
        const bookletId =
          rwId === null ? OTHER_BOOKLET.replace('59', '5a') : OTHER_BOOKLET.replace('59', '5b');
        const inserts = await Promise.all([
          admin05.from('galleries').insert({
            rw_id: rwId,
            category: 'activity',
            storage_path: `${owner}/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp`,
            alt_text: 'Masuk RW lain',
            uploaded_by: admin05Id,
          }),
          admin05.from('articles').insert({
            rw_id: rwId,
            slug: `${SLUG_PREFIX}-masuk-${tag}`,
            title: 'Masuk RW lain',
            author_id: admin05Id,
          }),
          admin05.from('booklets').insert({
            id: bookletId,
            rw_id: rwId,
            slug: `${SLUG_PREFIX}-masuk-${tag}`,
            title: 'Masuk RW lain',
            pdf_path: `${owner}/booklets/${bookletId}/booklet.pdf`,
            created_by: admin05Id,
          }),
        ]);
        for (const result of inserts) expect(result.error?.code).toBe('42501');
      }
    });

    it('cannot move its own article to RW 08 or publish it', async () => {
      const moved = await admin05.from('articles').update({ rw_id: 8 }).eq('id', OWN_ARTICLE);
      expect(moved.error?.code).toBe('42501');
      const published = await admin05
        .from('articles')
        .update({ status: 'published' })
        .eq('id', OWN_ARTICLE);
      expect(published.error?.code).toBe('42501');
      const removed = await admin05.from('articles').delete().eq('id', OWN_ARTICLE).select('id');
      expect(removed.data ?? []).toEqual([]);
    });

    // Finding 1: only the superadmin unpublishes a live article or moves its address.
    it('cannot take its own published article off the site or move it to another address', async () => {
      for (const change of [{ status: 'draft' as const }, { slug: `${SLUG_PREFIX}-alamat-baru` }]) {
        const result = await admin05.from('articles').update(change).eq('id', OWN.published);
        expect(result.error?.code).toBe('42501');
      }
    });

    // Finding 2: every file path of its own content stays inside its own folders.
    it('cannot point its own content at a file outside its own folders', async () => {
      const climbing = `rw-05/booklets/${OWN.booklet}/pages/../../../../${RW08_PHOTO}`;
      const body = {
        type: 'doc',
        content: [{ type: 'image', attrs: { src: RW08_PHOTO, alt: 'Tari anak', title: 'Tari' } }],
      };
      const writes = await Promise.all([
        admin05
          .from('booklets')
          .update({ pdf_path: `rw-05/booklets/${OTHER_BOOKLET}/booklet.pdf` })
          .eq('id', OWN.booklet),
        admin05.from('booklets').update({ cover_path: climbing }).eq('id', OWN.booklet),
        admin05.from('articles').update({ cover_path: RW08_PHOTO }).eq('id', OWN.article),
        admin05.from('articles').update({ body_json: body }).eq('id', OWN.article),
        admin05.from('galleries').update({ storage_path: RW08_PHOTO }).eq('id', OWN.gallery),
        admin05.from('activity_points').update({ image_path: RW08_PHOTO }).eq('id', OWN.point),
        admin05.from('rw_units').update({ hero_image_path: RW08_PHOTO }).eq('id', 5),
      ]);
      for (const result of writes) expect(result.error?.code).toBe(CHECK_VIOLATION);
    });
  },
  SLOW_TEST_MS,
);
