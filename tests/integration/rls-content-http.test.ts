import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  lastAuditId,
  removeSignInTraces,
  signInDevAccount,
  userIdOf,
  type ApiClient,
} from './helpers/staff-session';
import { runSql } from '../../scripts/local-stack';

// The RLS half of the CMS's cross-RW proof (Task P2.9.06, docs/Security.md AZ-03) over HTTP: the real AAL2 token of
// the RW 05 development admin, writing through PostgREST exactly as the session client of the CMS services does,
// changes none of RW 08's content, creates none for RW 08 or the kelurahan, and cannot move or publish its own.
// The guard half is in src/server/actions/*.test.ts; supabase/tests/rls_content_writes.sql repeats this in SQL.

const SLOW_TEST_MS = 60_000;
const ROW_08 = {
  gallery: '00000000-0000-4000-9000-0000000c0081',
  article: '00000000-0000-4000-9000-0000000c0082',
  booklet: '00000000-0000-4000-9000-0000000c0083',
  point: '00000000-0000-4000-9000-0000000c0084',
  schedule: '00000000-0000-4000-9000-0000000c0085',
};
const OWN_ARTICLE = '00000000-0000-4000-9000-0000000c0051';
const SLUG_PREFIX = 'uji-cms-http';
const UNTOUCHED = 'asli';

async function seedContent(): Promise<void> {
  await runSql(`
    insert into public.galleries (id, rw_id, category, storage_path, alt_text, caption, status)
      values ('${ROW_08.gallery}', 8, 'activity', 'rw-08/gallery/uji.webp', 'Tari anak', '${UNTOUCHED}', 'published');
    insert into public.articles (id, rw_id, slug, title, status) values
      ('${ROW_08.article}', 8, '${SLUG_PREFIX}-a8', '${UNTOUCHED}', 'draft'),
      ('${OWN_ARTICLE}', 5, '${SLUG_PREFIX}-a5', 'Artikel RW 05', 'draft');
    insert into public.booklets (id, rw_id, slug, title, pdf_path, status)
      values ('${ROW_08.booklet}', 8, '${SLUG_PREFIX}-b8', '${UNTOUCHED}', 'rw-08/booklets/x/booklet.pdf', 'draft');
    insert into public.activity_points (id, rw_id, slug, name, point_type, status)
      values ('${ROW_08.point}', 8, '${SLUG_PREFIX}-p8', '${UNTOUCHED}', 'sanggar', 'published');
    insert into public.performance_schedules (id, rw_id, title, schedule_type, starts_at, ends_at, status)
      values ('${ROW_08.schedule}', 8, '${UNTOUCHED}', 'dance_performance', now() + interval '3 days',
              now() + interval '3 days 2 hours', 'published');`);
}

async function removeContent(): Promise<void> {
  const ids = [...Object.values(ROW_08), OWN_ARTICLE].map((id) => `'${id}'`).join(', ');
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

    beforeAll(async () => {
      auditIdBefore = await lastAuditId();
      await removeContent();
      await seedContent();
      rw08Before = await rw08Values();
      admin05 = await signInDevAccount('admin-rw05@dev.gisikdrono.test');
      admin05Id = await userIdOf(admin05);
    }, SLOW_TEST_MS);

    afterAll(async () => {
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
        const inserts = await Promise.all([
          admin05.from('galleries').insert({
            rw_id: rwId,
            category: 'activity',
            storage_path: `${tag}/gallery/x.webp`,
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
            rw_id: rwId,
            slug: `${SLUG_PREFIX}-masuk-${tag}`,
            title: 'Masuk RW lain',
            pdf_path: 'x/booklet.pdf',
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
  },
  SLOW_TEST_MS,
);
