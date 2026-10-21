-- Writes the CMS (Task P2.9.04–P2.9.06) makes, as an API role. An RW admin writes their own RW's content only: an
-- RW 05 admin trying to create, change or remove RW 08's content, or its RW page, changes nothing, whatever the app
-- sends (docs/Security.md §6.3, AZ-03). A form names the id of a new article, booklet or activity point itself,
-- because its files are uploaded into that row's folder before the row is saved
-- (20261021080000_content_row_ids.sql).
begin;
select plan(24);
\ir helpers/rls_personas.psql

insert into public.galleries (id, rw_id, category, storage_path, alt_text, caption, status) values
  ('00000000-0000-4000-8000-0000000cc581', 8, 'activity', 'rw-08/gallery/a.webp', 'Tari', 'g8', 'published');
insert into public.articles (id, rw_id, slug, title, status) values
  ('00000000-0000-4000-8000-0000000cc582', 8, 'cw-a8', 'Artikel RW 08', 'draft');
insert into public.booklets (id, rw_id, slug, title, pdf_path, status) values
  ('00000000-0000-4000-8000-0000000cc583', 8, 'cw-bk8', 'Booklet RW 08', 'rw-08/booklets/00000000-0000-4000-8000-0000000cc583/booklet.pdf', 'draft');
insert into public.activity_points (id, rw_id, slug, name, point_type, status) values
  ('00000000-0000-4000-8000-0000000cc584', 8, 'cw-ap8', 'Sanggar', 'sanggar', 'published');
insert into public.performance_schedules (id, rw_id, title, schedule_type, starts_at, ends_at, status) values
  ('00000000-0000-4000-8000-0000000cc585', 8, 'Tari RW 08', 'dance_performance', now() + interval '3 days',
   now() + interval '3 days 2 hours', 'published');

-- ===== admin_rw 05 on their own RW: a new row with the id its form chose =====
select pg_temp.act_as('admin_rw_05');
select lives_ok(
  $$insert into public.articles (id, rw_id, slug, title, status, author_id)
    values ('00000000-0000-4000-8000-0000000cc551', 5, 'cw-a5', 'Artikel RW 05', 'draft',
            '00000000-0000-4000-8000-00000000f005')$$,
  'an RW admin saves a new article under the id its cover was uploaded for'
);
select lives_ok(
  $$insert into public.booklets (id, rw_id, slug, title, pdf_path, status, created_by)
    values ('00000000-0000-4000-8000-0000000cc552', 5, 'cw-bk5', 'Booklet RW 05',
            'rw-05/booklets/00000000-0000-4000-8000-0000000cc552/booklet.pdf', 'draft',
            '00000000-0000-4000-8000-00000000f005')$$,
  'a new booklet under the id its PDF and pages were uploaded for'
);
select lives_ok(
  $$insert into public.activity_points (id, rw_id, slug, name, point_type, status)
    values ('00000000-0000-4000-8000-0000000cc553', 5, 'cw-ap5', 'Komposter', 'composter', 'draft')$$,
  'a new activity point under the id its photo was uploaded for'
);
select throws_ok(
  $$update public.articles set id = '00000000-0000-4000-8000-0000000cc559' where slug = 'cw-a5'$$,
  '42501', null, 'but never moves a saved row to another id'
);

-- ===== admin_rw 05 writing to RW 08 =====
select throws_ok(
  $$insert into public.articles (id, rw_id, slug, title, status, author_id)
    values ('00000000-0000-4000-8000-0000000cc561', 8, 'cw-a8-baru', 'Masuk RW 08', 'draft',
            '00000000-0000-4000-8000-00000000f005')$$,
  '42501', null, 'no article for RW 08, with or without an id of its own'
);
select throws_ok(
  $$insert into public.booklets (id, rw_id, slug, title, pdf_path, status, created_by)
    values ('00000000-0000-4000-8000-0000000cc562', 8, 'cw-bk8-baru', 'Masuk RW 08',
            'rw-08/booklets/00000000-0000-4000-8000-0000000cc562/booklet.pdf', 'draft',
            '00000000-0000-4000-8000-00000000f005')$$,
  '42501', null, 'no booklet for RW 08'
);
select throws_ok(
  $$insert into public.activity_points (id, rw_id, slug, name, point_type, status)
    values ('00000000-0000-4000-8000-0000000cc563', 8, 'cw-ap8-baru', 'Masuk RW 08', 'sanggar', 'draft')$$,
  '42501', null, 'no activity point for RW 08'
);
select throws_ok(
  $$insert into public.performance_schedules (rw_id, title, schedule_type, starts_at, ends_at, created_by)
    values (8, 'Masuk RW 08', 'workshop', now() + interval '4 days', now() + interval '4 days 1 hour',
            '00000000-0000-4000-8000-00000000f005')$$,
  '42501', null, 'no schedule for RW 08'
);
select is(pg_temp.row_count($$update public.galleries set caption = 'diubah' where rw_id = 8$$), 0,
  'changes none of RW 08''s gallery');
select is(pg_temp.row_count($$update public.articles set title = 'diubah' where rw_id = 8$$), 0,
  'nor its articles');
select is(pg_temp.row_count($$update public.booklets set title = 'diubah' where rw_id = 8$$), 0,
  'nor its booklets');
select is(pg_temp.row_count($$update public.activity_points set name = 'diubah' where rw_id = 8$$), 0,
  'nor its activity points');
select is(pg_temp.row_count($$update public.performance_schedules set title = 'diubah' where rw_id = 8$$), 0,
  'nor its schedules');
select is(pg_temp.row_count($$update public.rw_units set tagline = 'diubah' where id = 8$$), 0,
  'nor RW 08''s page');
select is(pg_temp.row_count($$delete from public.galleries where rw_id = 8$$), 0, 'removes none of its gallery');
select is(pg_temp.row_count($$delete from public.activity_points where rw_id = 8$$), 0,
  'nor its activity points');
select is(pg_temp.row_count($$delete from public.performance_schedules where rw_id = 8$$), 0,
  'nor its schedules');
select throws_ok($$update public.galleries set rw_id = 8 where caption = 'g8'$$, '42501', null,
  'and moves no row between RWs, which no API role may write');
select is(pg_temp.row_count($$update public.rw_units set tagline = 'RW 05 kami' where id = 5$$), 1,
  'while their own RW page takes the change');

-- ===== the superadmin =====
reset role;
select pg_temp.act_as('superadmin_aal2');
select lives_ok(
  $$insert into public.articles (id, rw_id, slug, title, status, author_id)
    values ('00000000-0000-4000-8000-0000000cc571', null, 'cw-akel', 'Artikel kelurahan', 'draft',
            '00000000-0000-4000-8000-00000000f001')$$,
  'the superadmin saves kelurahan content under the id its form chose'
);
select is(pg_temp.row_count($$update public.articles set title = 'Artikel RW 08 (disunting)' where rw_id = 8$$), 1,
  'and edits RW 08''s content');

reset role;
select is((select title from public.articles where id = '00000000-0000-4000-8000-0000000cc582'),
  'Artikel RW 08 (disunting)', 'which only the superadmin changed');
select is((select caption from public.galleries where id = '00000000-0000-4000-8000-0000000cc581'), 'g8',
  'RW 08''s gallery item is as it was');
select is((select tagline from public.rw_units where id = 8) is distinct from 'diubah', true,
  'and so is RW 08''s page');

select * from finish();
rollback;
