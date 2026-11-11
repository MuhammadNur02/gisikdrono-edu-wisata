-- The public-media files the hourly purge removes (Task P2.9.11, docs/Security.md R34): only names finalize writes,
-- only after 24 hours, and never while a row shows them, a thumbnail's photo is shown, or a booklet row owns the
-- folder. Every fixture name carries `cd7` so the assertions ignore whatever else the database holds.
begin;
select plan(8);

insert into storage.objects (bucket_id, name, created_at) values
  -- an unsaved form's photo and its thumbnail
  ('public-media', 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-0000000cd701.webp', now() - interval '25 hours'),
  ('public-media', 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-0000000cd701-thumb.webp', now() - interval '25 hours'),
  -- a shown photo, and its thumbnail although the row keeps no thumbnail_path
  ('public-media', 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-0000000cd702.webp', now() - interval '25 hours'),
  ('public-media', 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-0000000cd702-thumb.webp', now() - interval '25 hours'),
  -- a photo uploaded an hour ago, whose form may still be open
  ('public-media', 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-0000000cd703.webp', now() - interval '1 hour'),
  -- a name finalize never writes
  ('public-media', 'rw-05/gallery/foto-cd7-lama.webp', now() - interval '25 hours'),
  -- an article that was never saved, and one whose body shows its photo
  ('public-media', 'rw-05/articles/00000000-0000-4000-8000-0000000cd711/0192f3a4-5b6c-7d8e-9f01-0000000cd704.webp',
   now() - interval '25 hours'),
  ('public-media', 'rw-05/articles/00000000-0000-4000-8000-0000000cd712/0192f3a4-5b6c-7d8e-9f01-0000000cd705.webp',
   now() - interval '25 hours'),
  -- a booklet row's page, and a broken-off attempt with no row (R20)
  ('public-media', 'rw-05/booklets/00000000-0000-4000-8000-0000000cd721/pages/0003.webp', now() - interval '25 hours'),
  ('public-media', 'rw-05/booklets/00000000-0000-4000-8000-0000000cd722/booklet.pdf', now() - interval '25 hours'),
  -- a kelurahan hero photo a banner shows
  ('public-media', 'kelurahan/hero/0192f3a4-5b6c-7d8e-9f01-0000000cd706.webp', now() - interval '25 hours'),
  -- another bucket is never this job's
  ('documents', 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-0000000cd707.webp', now() - interval '25 hours');

insert into public.galleries (id, rw_id, category, media_type, storage_path, caption, alt_text, status) values
  ('00000000-0000-4000-8000-0000000cd731', 5, 'activity', 'image',
   'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-0000000cd702.webp', 'Uji', 'Uji', 'published');
insert into public.articles (id, rw_id, slug, title, body_json) values (
  '00000000-0000-4000-8000-0000000cd712', 5, 'cd7-artikel', 'Artikel uji yatim',
  '{"type":"doc","content":[{"type":"image","attrs":{
    "src":"rw-05/articles/00000000-0000-4000-8000-0000000cd712/0192f3a4-5b6c-7d8e-9f01-0000000cd705.webp",
    "alt":"Uji"}}]}');
insert into public.booklets (id, rw_id, slug, title, pdf_path, page_images_prefix) values (
  '00000000-0000-4000-8000-0000000cd721', 5, 'cd7-booklet', 'Booklet uji yatim',
  'rw-05/booklets/00000000-0000-4000-8000-0000000cd721/booklet.pdf',
  'rw-05/booklets/00000000-0000-4000-8000-0000000cd721/pages');
insert into public.hero_banners (id, title, image_path, sort_order) values (
  '00000000-0000-4000-8000-0000000cd741', 'Banner uji', 'kelurahan/hero/0192f3a4-5b6c-7d8e-9f01-0000000cd706.webp', 0);

select results_eq(
  $$select path from internal.orphan_public_media(10000) where path like '%cd7%' order by path$$,
  $$values
    ('rw-05/articles/00000000-0000-4000-8000-0000000cd711/0192f3a4-5b6c-7d8e-9f01-0000000cd704.webp'),
    ('rw-05/booklets/00000000-0000-4000-8000-0000000cd722/booklet.pdf'),
    ('rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-0000000cd701-thumb.webp'),
    ('rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-0000000cd701.webp')$$,
  'only the day-old files finalize named that no row, photo or booklet keeps'
);

select is(
  (select count(*)::int from internal.orphan_public_media(1)),
  1,
  'a run takes at most its batch'
);

update public.galleries set storage_path = 'rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-0000000cd701.webp'
where id = '00000000-0000-4000-8000-0000000cd731';
select results_eq(
  $$select path from internal.orphan_public_media(10000) where path like '%/gallery/%cd70%' order by path$$,
  $$values
    ('rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-0000000cd702-thumb.webp'),
    ('rw-05/gallery/0192f3a4-5b6c-7d8e-9f01-0000000cd702.webp')$$,
  'a photo a row starts showing is kept with its thumbnail, and the one it stopped showing goes'
);

delete from public.booklets where id = '00000000-0000-4000-8000-0000000cd721';
select ok(
  exists (select 1 from internal.orphan_public_media(10000)
          where path = 'rw-05/booklets/00000000-0000-4000-8000-0000000cd721/pages/0003.webp'),
  'a removed booklet''s pages go'
);

select ok(
  has_function_privilege('service_role', 'public.svc_orphan_public_media(integer)', 'execute'),
  'the job reaches it through its svc_ wrapper'
);
select ok(
  not has_function_privilege('anon', 'public.svc_orphan_public_media(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.svc_orphan_public_media(integer)', 'execute'),
  'no API role may ask which files are unused'
);
select ok(
  not has_function_privilege('service_role', 'internal.orphan_public_media(integer)', 'execute')
  and not has_function_privilege('authenticated', 'internal.referenced_public_media()', 'execute'),
  'and nobody calls the internal functions directly'
);
select is(
  (select count(*)::int from internal.orphan_public_media(-1)),
  0,
  'a negative batch asks for nothing'
);

select * from finish();
rollback;
