-- RLS matrix for content: galleries, articles, booklets, hero_banners, activity_points, performance_schedules,
-- reviews and v_public_reviews (docs/PRD.md §8.5.2, Task P1.4.02, P1.4.03, P1.4.06, P1.9.02). Every check runs as
-- an API role.
begin;
select plan(48);
\ir helpers/rls_personas.psql

insert into public.galleries (id, rw_id, category, storage_path, alt_text, caption, status) values
  ('00000000-0000-4000-8000-00000000ca51', 5, 'activity', 'rw-05/gallery/g1.webp', 'Kompos', 'g5', 'published'),
  ('00000000-0000-4000-8000-00000000ca52', 5, 'activity', 'rw-05/gallery/g2.webp', 'Draf', 'g5d', 'draft'),
  ('00000000-0000-4000-8000-00000000ca81', 8, 'activity', 'rw-08/gallery/g1.webp', 'Tari', 'g8', 'published');
insert into public.articles (id, rw_id, slug, title, status) values
  ('00000000-0000-4000-8000-00000000cb51', 5, 'a5', 'Artikel RW 05', 'published'),
  ('00000000-0000-4000-8000-00000000cb52', 5, 'a5d', 'Draf RW 05', 'draft'),
  ('00000000-0000-4000-8000-00000000cb81', 8, 'a8', 'Artikel RW 08', 'published');
insert into public.booklets (id, rw_id, slug, title, pdf_path, status) values
  ('00000000-0000-4000-8000-00000000cc51', 5, 'bk5', 'Booklet RW 05', 'rw-05/booklets/00000000-0000-4000-8000-00000000cc51/booklet.pdf', 'published'),
  ('00000000-0000-4000-8000-00000000cc52', 5, 'bk5d', 'Draf RW 05', 'rw-05/booklets/00000000-0000-4000-8000-00000000cc52/booklet.pdf', 'draft'),
  ('00000000-0000-4000-8000-00000000cc81', 8, 'bk8', 'Booklet RW 08', 'rw-08/booklets/00000000-0000-4000-8000-00000000cc81/booklet.pdf', 'published');
insert into public.hero_banners (title, image_path, is_active, starts_at, ends_at) values
  ('On', 'kelurahan/hero/on.webp', true, null, null),
  ('Off', 'kelurahan/hero/off.webp', false, null, null),
  ('Past', 'kelurahan/hero/past.webp', true, now() - interval '10 days', now() - interval '1 day'),
  ('Future', 'kelurahan/hero/future.webp', true, now() + interval '1 day', null);
insert into public.activity_points (id, rw_id, slug, name, point_type, status) values
  ('00000000-0000-4000-8000-00000000cd51', 5, 'ap5', 'Komposter', 'composter', 'published'),
  ('00000000-0000-4000-8000-00000000cd81', 8, 'ap8', 'Sanggar', 'sanggar', 'published');
insert into public.performance_schedules (rw_id, title, schedule_type, starts_at, ends_at, status) values
  (5, 'Lokakarya RW 05', 'workshop', now() + interval '3 days', now() + interval '3 days 2 hours', 'published'),
  (8, 'Tari RW 08', 'dance_performance', now() + interval '3 days', now() + interval '3 days 2 hours', 'published');
insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax) values
  ('00000000-0000-4000-8000-00000000c501', 5, 'regular', 'p5', 'Paket RW 05', 25000),
  ('00000000-0000-4000-8000-00000000c801', 8, 'regular', 'p8', 'Paket RW 08', 25000);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
  consented_at)
select id::uuid, code, 'quoted', package_id::uuid, '{}', rw_ids::smallint[], 'school', 'Budi Santoso', phone,
  lower(code) || '@example.test', 4, public.today_jkt() - 20, public.today_jkt() - 20, 100000, 100000, 'v1', now()
from (values
  ('00000000-0000-4000-8000-0000b5000001', 'GSK-R5000001', '00000000-0000-4000-8000-00000000c501', '{5}', '+6281200005301'),
  ('00000000-0000-4000-8000-0000b5000002', 'GSK-R5000002', '00000000-0000-4000-8000-00000000c501', '{5}', '+6281200005302'),
  ('00000000-0000-4000-8000-0000b8000001', 'GSK-R8000001', '00000000-0000-4000-8000-00000000c801', '{8}', '+6281200008301')
) as fixture(id, code, package_id, rw_ids, phone);
insert into public.reviews (id, booking_id, rw_ids, rating, body, reviewer_name, institution_name, is_anonymous, status) values
  ('00000000-0000-4000-8000-00000000ce51', '00000000-0000-4000-8000-0000b5000001', '{5}', 5, 'Kunjungan yang seru sekali',
   'Budi Santoso', 'SD Negeri 1', false, 'published'),
  ('00000000-0000-4000-8000-00000000ce52', '00000000-0000-4000-8000-0000b5000002', '{5}', 4, 'Menunggu moderasi dulu',
   'Siti Aminah', 'SMP 2', false, 'pending'),
  ('00000000-0000-4000-8000-00000000ce81', '00000000-0000-4000-8000-0000b8000001', '{8}', 5, 'Tarinya bagus sekali',
   'Cici Lestari', 'SMA 3', true, 'published');
create function pg_temp.is_fixture_content(p_id uuid) returns boolean
  language sql immutable
as $$
  select p_id in ('00000000-0000-4000-8000-00000000ca51', '00000000-0000-4000-8000-00000000ca52',
                  '00000000-0000-4000-8000-00000000ca81', '00000000-0000-4000-8000-00000000cb51',
                  '00000000-0000-4000-8000-00000000cb52', '00000000-0000-4000-8000-00000000cb81',
                  '00000000-0000-4000-8000-00000000cc51', '00000000-0000-4000-8000-00000000cc52',
                  '00000000-0000-4000-8000-00000000cc81', '00000000-0000-4000-8000-00000000cd51',
                  '00000000-0000-4000-8000-00000000cd81', '00000000-0000-4000-8000-00000000ce51',
                  '00000000-0000-4000-8000-00000000ce52', '00000000-0000-4000-8000-00000000ce81');
$$;
grant execute on function pg_temp.is_fixture_content(uuid) to anon, authenticated;

-- ===== anon =====
select pg_temp.act_as('anon');
select is((select string_agg(caption, ',' order by caption) from public.galleries where pg_temp.is_fixture_content(id)),
  'g5,g8', 'anon sees published gallery items');
select throws_ok($$select booking_id, uploaded_by from public.galleries$$, '42501', null,
  'without their link to a booking or who uploaded them');
select is((select string_agg(slug, ',' order by slug) from public.articles where pg_temp.is_fixture_content(id)),
  'a5,a8', 'published articles');
select throws_ok($$select author_id from public.articles$$, '42501', null, 'without the author''s staff id');
select is((select string_agg(slug, ',' order by slug) from public.booklets where pg_temp.is_fixture_content(id)),
  'bk5,bk8', 'published booklets');
select is((select string_agg(title, ',') from public.hero_banners where title in ('On', 'Off', 'Past', 'Future')), 'On',
  'only the hero banner that is active and inside its window');
select is((select string_agg(slug, ',' order by slug) from public.activity_points where pg_temp.is_fixture_content(id)),
  'ap5,ap8', 'published activity points');
select is((select count(*)::int from public.performance_schedules where title in ('Lokakarya RW 05', 'Tari RW 08')), 2,
  'published schedules');
select is(
  (select string_agg(reviewer_name || ':' || institution_name, ',' order by reviewer_name) from public.v_public_reviews
   where pg_temp.is_fixture_content(id)),
  'Budi:SD Negeri 1,Pengunjung:SMA 3',
  'published reviews, under a first name or Pengunjung'
);
select throws_ok($$select reviewer_name from public.reviews$$, '42501', null, 'never the reviewer''s full name');
select throws_ok($$select booking_id from public.reviews$$, '42501', null, 'nor the booking behind a review');
select throws_ok($$insert into public.galleries (rw_id, category, storage_path, alt_text)
  values (5, 'activity', 'rw-05/gallery/x.webp', 'Palsu')$$, '42501', null, 'and writes no content');

-- ===== a signed-in user without a role =====
reset role;
select pg_temp.act_as('none');
select is(
  (select count(*)::int from public.galleries where pg_temp.is_fixture_content(id))
  + (select count(*)::int from public.articles where pg_temp.is_fixture_content(id))
  + (select count(*)::int from public.booklets where pg_temp.is_fixture_content(id))
  + (select count(*)::int from public.hero_banners where title in ('On', 'Off', 'Past', 'Future'))
  + (select count(*)::int from public.reviews where pg_temp.is_fixture_content(id)),
  0,
  'a user without a role sees no content row'
);

-- ===== admin_rw 05 =====
reset role;
select pg_temp.act_as('admin_rw_05');
select is((select string_agg(caption, ',' order by caption) from public.galleries where pg_temp.is_fixture_content(id)),
  'g5,g5d', 'an RW admin sees their own RW''s gallery, drafts included');
select lives_ok($$insert into public.galleries (rw_id, category, storage_path, alt_text, booking_id, uploaded_by)
  values (5, 'visit', 'rw-05/gallery/baru.webp', 'Foto baru', '00000000-0000-4000-8000-0000b5000001',
          '00000000-0000-4000-8000-00000000f005')$$,
  'uploads to their own RW in their own name, linked to one of its visits');
select throws_ok($$insert into public.galleries (rw_id, category, storage_path, alt_text, booking_id, uploaded_by)
  values (5, 'visit', 'rw-05/gallery/pinjam.webp', 'Foto pinjam', '00000000-0000-4000-8000-0000b8000001',
          '00000000-0000-4000-8000-00000000f005')$$,
  '42501', 'a gallery item links a booking that visited its own RW', 'never linked to a visit of RW 08');
select throws_ok($$insert into public.galleries (rw_id, category, storage_path, alt_text, uploaded_by)
  values (8, 'activity', 'rw-08/gallery/baru.webp', 'Foto baru', '00000000-0000-4000-8000-00000000f005')$$,
  '42501', null, 'nor uploaded to RW 08');
select is(pg_temp.row_count($$update public.galleries set status = 'archived' where caption = 'g5d'$$), 1,
  'archives their own gallery item');
select is(pg_temp.row_count($$delete from public.galleries where caption = 'g5d'$$), 1,
  'and removes it once archived (20261028080100)');
select is((select string_agg(slug, ',' order by slug) from public.articles where pg_temp.is_fixture_content(id)),
  'a5,a5d', 'their own RW''s articles');
select lives_ok($$insert into public.articles (rw_id, slug, title, status, author_id)
  values (5, 'a5-baru', 'Artikel Baru', 'draft', '00000000-0000-4000-8000-00000000f005')$$, 'writes a draft');
select throws_ok($$insert into public.articles (rw_id, slug, title, status, author_id)
  values (5, 'a5-terbit', 'Langsung Terbit', 'published', '00000000-0000-4000-8000-00000000f005')$$, '42501',
  'only the superadmin publishes an article', 'but publishes nothing');
select is(pg_temp.row_count($$delete from public.articles where slug = 'a5d'$$), 0, 'and deletes no article');
select is((select string_agg(slug, ',' order by slug) from public.booklets where pg_temp.is_fixture_content(id)),
  'bk5,bk5d', 'their own RW''s booklets');
select throws_ok($$update public.booklets set download_count = 9999 where slug = 'bk5'$$, '42501', null,
  'whose download count only the download route moves');
select is(pg_temp.row_count($$delete from public.booklets where slug = 'bk5d'$$), 0, 'and deletes no booklet');
select is((select count(*)::int from public.hero_banners where title in ('On', 'Off', 'Past', 'Future')), 0,
  'sees no hero banner, which is the superadmin''s');
select throws_ok($$insert into public.hero_banners (title, image_path, created_by)
  values ('Milik RW', 'kelurahan/hero/h.webp', '00000000-0000-4000-8000-00000000f005')$$, '42501', null, 'nor adds one');
select is(pg_temp.row_count($$update public.activity_points set status = 'archived' where slug = 'ap5'$$), 1,
  'archives their own activity point');
select is(pg_temp.row_count($$delete from public.activity_points where slug = 'ap5'$$), 1,
  'and removes it once archived (20261028080100)');
select is((select count(*)::int from public.performance_schedules where title in ('Lokakarya RW 05', 'Tari RW 08')), 1,
  'sees their own RW''s schedule only');
select lives_ok($$insert into public.performance_schedules (rw_id, title, schedule_type, starts_at, ends_at, package_id,
  created_by) values (5, 'Kelas Kompos', 'workshop', now() + interval '5 days', now() + interval '5 days 2 hours',
  '00000000-0000-4000-8000-00000000c501', '00000000-0000-4000-8000-00000000f005')$$,
  'adds a schedule that links a package of their RW');
select throws_ok($$insert into public.performance_schedules (rw_id, title, schedule_type, starts_at, ends_at, package_id,
  created_by) values (5, 'Kelas Tari', 'workshop', now() + interval '5 days', now() + interval '5 days 2 hours',
  '00000000-0000-4000-8000-00000000c801', '00000000-0000-4000-8000-00000000f005')$$,
  '42501', 'a schedule links a package of its own RW', 'never one of RW 08''s');
select is((select count(*)::int from public.reviews where pg_temp.is_fixture_content(id) and 8 = any (rw_ids)), 0,
  'no RW 08 review');
select is(
  (select string_agg(public_reviewer_name, ',' order by public_reviewer_name) from public.reviews
   where pg_temp.is_fixture_content(id)),
  'Budi,Siti',
  'their own RW''s reviews, pending ones included, under the reviewer''s first name'
);
select throws_ok($$select reviewer_name from public.reviews$$, '42501', null,
  'never the full name the reviewer typed (review of 0005)');
select is(pg_temp.row_count($$update public.reviews set status = 'published'
  where id = '00000000-0000-4000-8000-00000000ce52'$$), 0, 'and moderation is the superadmin''s');

-- ===== admin_rw 08 =====
reset role;
select pg_temp.act_as('admin_rw_08');
select is((select string_agg(slug, ',' order by slug) from public.articles where pg_temp.is_fixture_content(id)),
  'a8', 'RW 08''s admin sees RW 08''s articles only');

-- ===== superadmin =====
reset role;
select pg_temp.act_as('superadmin_aal1');
select is(
  (select count(*)::int from public.galleries where pg_temp.is_fixture_content(id))
  + (select count(*)::int from public.articles where pg_temp.is_fixture_content(id))
  + (select count(*)::int from public.reviews where pg_temp.is_fixture_content(id)),
  0,
  'without AAL2 the superadmin sees no content row, published or not'
);
select throws_ok($$insert into public.hero_banners (title, image_path, created_by)
  values ('Tanpa TOTP', 'kelurahan/hero/tanpa-totp.webp', '00000000-0000-4000-8000-00000000f001')$$, '42501', null,
  'and adds no hero banner');
reset role;
select pg_temp.act_as('superadmin_aal2');
select lives_ok($$insert into public.hero_banners (title, image_path, created_by)
  values ('Baru', 'kelurahan/hero/baru.webp', '00000000-0000-4000-8000-00000000f001')$$, 'at AAL2 they add a hero banner');
select lives_ok($$insert into public.galleries (rw_id, category, storage_path, alt_text, booking_id, uploaded_by)
  values (null, 'visit', 'kelurahan/gallery/kunjungan.webp', 'Kunjungan', '00000000-0000-4000-8000-0000b8000001',
          '00000000-0000-4000-8000-00000000f001')$$,
  'link a kelurahan gallery item to any visit');
select is(pg_temp.row_count($$update public.reviews set status = 'published'
  where id = '00000000-0000-4000-8000-00000000ce52'$$), 1, 'and moderate a review');
select throws_ok($$select reviewer_name from public.reviews$$, '42501', null,
  'by its text and first name, without the reviewer''s full name');

-- ===== admin_kopdes =====
-- docs/PRD.md §13.1 A30: RW content and reviews are the RWs' and the kelurahan's; the Kopdes admin reads and writes
-- none of them.
reset role;
select pg_temp.act_as('admin_kopdes');
select is(
  pg_temp.rows_seen($$select 1 from public.galleries where pg_temp.is_fixture_content(id)$$)
  + pg_temp.rows_seen($$select 1 from public.articles where pg_temp.is_fixture_content(id)$$)
  + pg_temp.rows_seen($$select 1 from public.booklets where pg_temp.is_fixture_content(id)$$)
  + pg_temp.rows_seen($$select 1 from public.hero_banners where title in ('On', 'Off', 'Past', 'Future')$$)
  + pg_temp.rows_seen($$select 1 from public.activity_points where pg_temp.is_fixture_content(id)$$)
  + pg_temp.rows_seen($$select 1 from public.performance_schedules where title in ('Lokakarya RW 05', 'Tari RW 08')$$)
  + pg_temp.rows_seen($$select 1 from public.reviews where pg_temp.is_fixture_content(id)$$)
  + pg_temp.rows_seen($$select 1 from public.v_public_reviews$$),
  0,
  'the Kopdes admin sees no gallery item, article, booklet, banner, activity point, schedule or review'
);
select ok(pg_temp.write_refused($$insert into public.galleries (rw_id, category, storage_path, alt_text, uploaded_by)
  values (5, 'umkm', 'rw-05/gallery/kopdes.webp', 'Produk', '00000000-0000-4000-8000-00000000f0c0')$$),
  'and adds no gallery item, not even an UMKM photo');
select ok(pg_temp.write_refused($$insert into public.articles (rw_id, slug, title, status, author_id)
  values (null, 'kopdes-artikel', 'Kopdes', 'draft', '00000000-0000-4000-8000-00000000f0c0')$$), 'nor an article');
select ok(pg_temp.write_refused($$update public.galleries set status = 'archived' where pg_temp.is_fixture_content(id)$$),
  'nor archives any content');

select * from finish();
rollback;
