-- Every public-media path a content row keeps lies in its owner's own folder (independent review of PR #18,
-- finding 2, decision of 2026-10-21). The CMS checks the same before it writes; these rules hold for a direct
-- PostgREST call too, and for every writer, postgres included. A path is `<owner>/<folder>/...` with safe
-- segments only: no `..`, no scheme, no empty segment. The owner is `rw-05`, `rw-08` or `kelurahan` (rw_id NULL).
begin;
select plan(28);
\ir helpers/rls_personas.psql

-- Fixtures the personas then change: a package, a vendor and a product of RW 05.
insert into public.tour_packages (id, rw_id, category, slug, name, duration_minutes, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000cd5a1', 5, 'student', 'mp-paket-05', 'Paket uji path', 60, 25000, 'draft');
insert into public.umkm_vendors (id, rw_id, slug, name) values
  ('00000000-0000-4000-8000-0000000cd5a2', 5, 'mp-vendor-05', 'Vendor uji path');
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price) values
  ('00000000-0000-4000-8000-0000000cd5a3', 5, '00000000-0000-4000-8000-0000000cd5a2', 'mp-produk-05',
   'Produk uji path', 'compost', 10000);

-- ===== As postgres: the rule belongs to the table, not to a role =====
select throws_ok(
  $$insert into public.booklets (id, rw_id, slug, title, pdf_path)
    values ('00000000-0000-4000-8000-0000000cd501', 5, 'mp-booklet-sistem', 'Booklet', 'rw-05/booklets/x/booklet.pdf')$$,
  '23514', null, 'even postgres cannot point a booklet at a PDF outside its own folder'
);

-- ===== admin_rw_05: articles =====
select pg_temp.act_as('admin_rw_05');
select lives_ok(
  $$insert into public.articles (id, rw_id, slug, title, author_id, cover_path, body_json) values (
      '00000000-0000-4000-8000-0000000cd511', 5, 'mp-artikel-05', 'Artikel uji path',
      '00000000-0000-4000-8000-00000000f005',
      'rw-05/articles/00000000-0000-4000-8000-0000000cd511/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp',
      '{"type":"doc","content":[{"type":"blockquote","content":[{"type":"image","attrs":{
        "src":"rw-05/articles/00000000-0000-4000-8000-0000000cd511/0192f3a4-5b6c-7d8e-9f01-23456789abce.webp",
        "alt":"Warga memilah sampah","title":"Bank sampah"}}]}]}')$$,
  'an article keeps a cover and body photos in its own folder'
);
select throws_ok(
  $$update public.articles
    set cover_path = 'rw-08/articles/00000000-0000-4000-8000-0000000cd511/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp'
    where id = '00000000-0000-4000-8000-0000000cd511'$$,
  '23514', null, 'but not a cover in RW 08''s folders'
);
select throws_ok(
  $$update public.articles
    set cover_path = 'rw-05/articles/00000000-0000-4000-8000-0000000cd599/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp'
    where id = '00000000-0000-4000-8000-0000000cd511'$$,
  '23514', null, 'nor one in another article''s folder'
);
select throws_ok(
  $$update public.articles
    set cover_path = 'rw-05/articles/00000000-0000-4000-8000-0000000cd511/../../../rw-08/gallery/a.webp'
    where id = '00000000-0000-4000-8000-0000000cd511'$$,
  '23514', null, 'nor a path that climbs out of it with ..'
);
select throws_ok(
  $$update public.articles set cover_path = 'https://evil.example/a.webp'
    where id = '00000000-0000-4000-8000-0000000cd511'$$,
  '23514', null, 'nor an address on another host'
);
select throws_ok(
  $$update public.articles set body_json = '{"type":"doc","content":[{"type":"image","attrs":{
      "src":"rw-08/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp","alt":"Tari anak","title":"Tari"}}]}'
    where id = '00000000-0000-4000-8000-0000000cd511'$$,
  '23514', null, 'nor a body photo of RW 08'
);

-- ===== admin_rw_05: booklets =====
select lives_ok(
  $$insert into public.booklets (id, rw_id, slug, title, created_by, pdf_path, page_images_prefix, cover_path)
    values ('00000000-0000-4000-8000-0000000cd521', 5, 'mp-booklet-05', 'Booklet uji path',
            '00000000-0000-4000-8000-00000000f005',
            'rw-05/booklets/00000000-0000-4000-8000-0000000cd521/booklet.pdf',
            'rw-05/booklets/00000000-0000-4000-8000-0000000cd521/pages',
            'rw-05/booklets/00000000-0000-4000-8000-0000000cd521/pages/0001.webp')$$,
  'a booklet keeps the PDF and pages of its own folder'
);
select throws_ok(
  $$update public.booklets set pdf_path = 'rw-05/booklets/00000000-0000-4000-8000-0000000cd599/booklet.pdf'
    where id = '00000000-0000-4000-8000-0000000cd521'$$,
  '23514', null, 'but not the PDF of another booklet'
);
select throws_ok(
  $$update public.booklets set page_images_prefix = 'rw-08/booklets/00000000-0000-4000-8000-0000000cd521/pages'
    where id = '00000000-0000-4000-8000-0000000cd521'$$,
  '23514', null, 'nor pages in RW 08''s folders'
);
select throws_ok(
  $$update public.booklets set cover_path = 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp'
    where id = '00000000-0000-4000-8000-0000000cd521'$$,
  '23514', null, 'nor a cover outside its own pages'
);

-- ===== admin_rw_05: galleries =====
select lives_ok(
  $$insert into public.galleries (rw_id, category, storage_path, thumbnail_path, alt_text, uploaded_by) values (
      5, 'activity', 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp',
      'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd-thumb.webp', 'Warga memilah sampah',
      '00000000-0000-4000-8000-00000000f005')$$,
  'a gallery photo and its thumbnail lie in the RW''s gallery folder'
);
select throws_ok(
  $$insert into public.galleries (rw_id, category, storage_path, alt_text, uploaded_by) values (
      5, 'activity', 'rw-08/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp', 'Tari anak',
      '00000000-0000-4000-8000-00000000f005')$$,
  '23514', null, 'not in RW 08''s'
);
select lives_ok(
  $$insert into public.galleries (rw_id, category, media_type, storage_path, video_url, alt_text, uploaded_by) values (
      5, 'activity', 'video', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Video kegiatan', '00000000-0000-4000-8000-00000000f005')$$,
  'a video without a still of its own keeps its canonical YouTube address'
);
select throws_ok(
  $$insert into public.galleries (rw_id, category, media_type, storage_path, video_url, alt_text, uploaded_by) values (
      5, 'activity', 'video', 'javascript:alert(1)', 'javascript:alert(1)', 'Video kegiatan',
      '00000000-0000-4000-8000-00000000f005')$$,
  '23514', null, 'and nothing else in its place'
);

-- ===== admin_rw_05: activity points, RW page, package, product, vendor, own profile =====
select lives_ok(
  $$insert into public.activity_points (id, rw_id, slug, name, point_type, image_path) values (
      '00000000-0000-4000-8000-0000000cd531', 5, 'mp-titik-05', 'Komposter', 'composter',
      'rw-05/activity-points/00000000-0000-4000-8000-0000000cd531/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp')$$,
  'an activity point keeps a photo in its own folder'
);
select throws_ok(
  $$update public.activity_points set image_path = 'rw-08/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp'
    where id = '00000000-0000-4000-8000-0000000cd531'$$,
  '23514', null, 'not one of RW 08'
);
select is(
  pg_temp.row_count($$update public.rw_units
    set hero_image_path = 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp' where id = 5$$),
  1, 'the RW page shows a photo of its own gallery folder'
);
select throws_ok(
  $$update public.rw_units set hero_image_path = 'rw-08/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp'
    where id = 5$$,
  '23514', null, 'not one of RW 08'
);
select is(
  pg_temp.row_count($$update public.tour_packages
    set image_paths = array['rw-05/packages/00000000-0000-4000-8000-0000000cd5a1/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp'],
        updated_by = '00000000-0000-4000-8000-00000000f005'
    where id = '00000000-0000-4000-8000-0000000cd5a1'$$),
  1, 'a package keeps photos in its own folder'
);
select throws_ok(
  $$update public.tour_packages
    set image_paths = array['rw-05/packages/00000000-0000-4000-8000-0000000cd5a1/a.webp', 'rw-08/gallery/a.webp'],
        updated_by = '00000000-0000-4000-8000-00000000f005'
    where id = '00000000-0000-4000-8000-0000000cd5a1'$$,
  '23514', null, 'and every photo of the list counts'
);
-- Vendors and products are the superadmin's to write since 20261028080100; the path rules hold for them too.
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok(
  $$update public.products_umkm set image_paths = array['rw-05/packages/00000000-0000-4000-8000-0000000cd5a1/a.webp']
    where id = '00000000-0000-4000-8000-0000000cd5a3'$$,
  '23514', null, 'a product cannot show a package''s photo'
);
select throws_ok(
  $$update public.umkm_vendors set logo_path = 'rw-08/a.webp' where id = '00000000-0000-4000-8000-0000000cd5a2'$$,
  '23514', null, 'a vendor of RW 05 cannot show a logo of RW 08'
);
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok(
  $$update public.profiles set avatar_path = 'rw-08/a.webp' where id = '00000000-0000-4000-8000-00000000f005'$$,
  '23514', null, 'nor can an RW 05 officer show an avatar of RW 08'
);

-- ===== admin_rw_08: schedules =====
reset role;
select pg_temp.act_as('admin_rw_08');
select lives_ok(
  $$insert into public.performance_schedules (rw_id, title, schedule_type, starts_at, ends_at, created_by, image_path)
    values (8, 'Tari uji path', 'dance_performance', now() + interval '3 days', now() + interval '3 days 2 hours',
            '00000000-0000-4000-8000-00000000f008', 'rw-08/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp')$$,
  'a schedule shows a photo of its RW''s gallery folder'
);
select throws_ok(
  $$insert into public.performance_schedules (rw_id, title, schedule_type, starts_at, ends_at, created_by, image_path)
    values (8, 'Tari uji path', 'dance_performance', now() + interval '3 days', now() + interval '3 days 2 hours',
            '00000000-0000-4000-8000-00000000f008', 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp')$$,
  '23514', null, 'not one of RW 05'
);

-- ===== superadmin: hero banners =====
reset role;
select pg_temp.act_as('superadmin_aal2');
select lives_ok(
  $$insert into public.hero_banners (title, image_path, created_by)
    values ('Banner uji path', 'kelurahan/hero/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp',
            '00000000-0000-4000-8000-00000000f001')$$,
  'a hero banner shows a kelurahan hero photo'
);
select throws_ok(
  $$insert into public.hero_banners (title, image_path, mobile_image_path, created_by)
    values ('Banner uji path', 'kelurahan/hero/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp',
            'rw-05/hero/0192f3a4-5b6c-7d8e-9f01-23456789abcd.webp', '00000000-0000-4000-8000-00000000f001')$$,
  '23514', null, 'and a phone photo from the same folder only'
);

select * from finish();
rollback;
