-- A published article as an RW admin finds it (independent review of PR #18, finding 1, decision of 2026-10-21):
-- only the superadmin takes it off the site or moves it to another address. An RW admin's change to its content
-- goes back to review (articles_moderation_guard), whatever status the request asked for; a status change
-- without one, or any change of its slug, is refused.
begin;
select plan(9);
\ir helpers/rls_personas.psql

insert into public.articles (id, rw_id, slug, title, status, published_at) values
  ('00000000-0000-4000-8000-0000000ca501', 5, 'pg-tayang-rw-05', 'Artikel tayang RW 05', 'published', now());

select pg_temp.act_as('admin_rw_05');
select throws_ok(
  $$update public.articles set status = 'draft' where id = '00000000-0000-4000-8000-0000000ca501'$$,
  '42501', null, 'an RW admin cannot take their published article off the site'
);
select throws_ok(
  $$update public.articles set status = 'pending_review' where id = '00000000-0000-4000-8000-0000000ca501'$$,
  '42501', null, 'nor send it back to review without changing it'
);
select throws_ok(
  $$update public.articles set status = 'archived' where id = '00000000-0000-4000-8000-0000000ca501'$$,
  '42501', null, 'nor archive it'
);
select throws_ok(
  $$update public.articles set slug = 'pg-alamat-baru' where id = '00000000-0000-4000-8000-0000000ca501'$$,
  '42501', null, 'nor move it to another address'
);
select throws_ok(
  $$update public.articles set slug = 'pg-alamat-baru', title = 'Judul baru'
    where id = '00000000-0000-4000-8000-0000000ca501'$$,
  '42501', null, 'not even together with a change to its content'
);
select lives_ok(
  $$update public.articles set title = 'Artikel tayang RW 05 (disunting)', status = 'draft'
    where id = '00000000-0000-4000-8000-0000000ca501'$$,
  'a change to its content is saved'
);
select is(
  (select status::text from public.articles where id = '00000000-0000-4000-8000-0000000ca501'),
  'pending_review',
  'and takes the article back to review, although the request asked for a draft'
);

reset role;
select pg_temp.act_as('superadmin_aal2');
select lives_ok(
  $$update public.articles set status = 'published' where id = '00000000-0000-4000-8000-0000000ca501'$$,
  'the superadmin publishes the reviewed change'
);
select lives_ok(
  $$update public.articles set status = 'draft', slug = 'pg-alamat-super'
    where id = '00000000-0000-4000-8000-0000000ca501'$$,
  'and may take it off the site and move it'
);

select * from finish();
rollback;
