-- RLS matrix for the session tables: session_templates, visit_sessions and v_session_availability
-- (docs/PRD.md §8.5.2, Task P1.4.02, P1.4.03, P1.4.06, P1.9.02). Every check runs as an API role.
begin;
select plan(25);
\ir helpers/rls_personas.psql

insert into public.session_templates (id, rw_id, weekday, label, start_time, end_time, capacity) values
  ('00000000-0000-4000-8000-00000000a510', 5, 1, 'Senin Pagi', '08:00', '10:00', 40),
  ('00000000-0000-4000-8000-00000000a810', 8, 1, 'Senin Pagi', '08:00', '10:00', 40);
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity, status) values
  ('00000000-0000-4000-8000-00000000a501', 5, public.today_jkt() + 10, '08:00', '10:00', 'Buka', 40, 'open'),
  ('00000000-0000-4000-8000-00000000a502', 5, public.today_jkt() + 11, '08:00', '10:00', 'Tutup', 40, 'closed'),
  ('00000000-0000-4000-8000-00000000a503', 5, public.today_jkt() - 3, '08:00', '10:00', 'Lewat', 40, 'open'),
  ('00000000-0000-4000-8000-00000000a801', 8, public.today_jkt() + 10, '08:00', '10:00', 'Buka', 40, 'open');
create function pg_temp.is_fixture_session(p_id uuid) returns boolean
  language sql immutable
as $$
  select p_id in ('00000000-0000-4000-8000-00000000a501', '00000000-0000-4000-8000-00000000a502',
                  '00000000-0000-4000-8000-00000000a503', '00000000-0000-4000-8000-00000000a801');
$$;
grant execute on function pg_temp.is_fixture_session(uuid) to anon, authenticated;

-- ===== anon =====
select pg_temp.act_as('anon');
select is(
  (select string_agg(right(id::text, 4), ',' order by id) from public.v_session_availability
   where pg_temp.is_fixture_session(id)),
  'a501,a801',
  'the public calendar shows open sessions from today on, in every RW'
);
select is((select count(*)::int from public.visit_sessions where pg_temp.is_fixture_session(id)), 2,
  'and so does the table itself');
select throws_ok($$select notes from public.visit_sessions$$, '42501', null, 'staff notes stay hidden');
select throws_ok($$select id from public.session_templates$$, '42501', null, 'templates are staff-only');
select throws_ok($$insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity)
  values (5, public.today_jkt() + 20, '08:00', '10:00', 'Palsu', 40)$$, '42501', null, 'anon writes no session');

-- ===== a signed-in user without a role =====
reset role;
select pg_temp.act_as('none');
select is(
  (select count(*)::int from public.visit_sessions where pg_temp.is_fixture_session(id))
  + (select count(*)::int from public.session_templates
     where id in ('00000000-0000-4000-8000-00000000a510', '00000000-0000-4000-8000-00000000a810')),
  0,
  'a user without a role sees no session and no template'
);

-- ===== admin_rw 05 =====
reset role;
select pg_temp.act_as('admin_rw_05');
select is(
  (select string_agg(rw_id::text, ',') from public.session_templates
   where id in ('00000000-0000-4000-8000-00000000a510', '00000000-0000-4000-8000-00000000a810')),
  '5',
  'an RW admin sees their own templates only'
);
select lives_ok($$insert into public.session_templates (rw_id, weekday, label, start_time, end_time, capacity)
  values (5, 2, 'Selasa Pagi', '08:00', '10:00', 30)$$, 'and adds one for their RW');
select throws_ok($$insert into public.session_templates (rw_id, weekday, label, start_time, end_time, capacity)
  values (8, 2, 'Selasa Pagi', '08:00', '10:00', 30)$$, '42501', null, 'but none for RW 08');
select is(
  (select string_agg(right(id::text, 4), ',' order by id) from public.visit_sessions where pg_temp.is_fixture_session(id)),
  'a501,a502,a503',
  'sees every session of their own RW, closed and past ones included, and none of RW 08'
);
select lives_ok($$insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity, status,
  template_id, created_by) values (5, public.today_jkt() + 30, '13:00', '15:00', 'Tambahan', 20, 'closed',
  '00000000-0000-4000-8000-00000000a510', '00000000-0000-4000-8000-00000000f005')$$,
  'creates a session from their own template, signed with their own id');
select throws_ok($$insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity,
  template_id, created_by) values (5, public.today_jkt() + 33, '13:00', '15:00', 'Pinjam', 20,
  '00000000-0000-4000-8000-00000000a810', '00000000-0000-4000-8000-00000000f005')$$, '42501',
  'a session follows a template of its own RW', 'never from RW 08''s template');
select throws_ok($$insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity,
  template_id, created_by) values (5, public.today_jkt() + 34, '13:00', '15:00', 'Tebak', 20,
  '00000000-0000-4000-8000-00000000a999', '00000000-0000-4000-8000-00000000f005')$$, '42501',
  'a session follows a template of its own RW',
  'and a template that does not exist gets the same answer, so the check reveals nothing');
select throws_ok($$insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity,
  created_by) values (5, public.today_jkt() + 31, '13:00', '15:00', 'Tambahan', 20,
  '00000000-0000-4000-8000-00000000f008')$$, '42501', null, 'never in someone else''s name');
select throws_ok($$insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity,
  reserved_pax, created_by) values (5, public.today_jkt() + 32, '13:00', '15:00', 'Penuh', 20, 20,
  '00000000-0000-4000-8000-00000000f005')$$, '42501', null, 'and never with a counter filled in (review M4)');
select throws_ok($$update public.visit_sessions set reserved_pax = 40 where id = '00000000-0000-4000-8000-00000000a501'$$,
  '42501', null, 'nor moves a counter');
select is(pg_temp.row_count($$update public.visit_sessions set capacity = 50
  where id = '00000000-0000-4000-8000-00000000a501'$$), 1, 'changes the capacity of their own session');
select is(pg_temp.row_count($$update public.visit_sessions set capacity = 50
  where id = '00000000-0000-4000-8000-00000000a801'$$), 0, 'but not of RW 08''s');
select is(pg_temp.row_count($$delete from public.visit_sessions where id = '00000000-0000-4000-8000-00000000a502'$$), 1,
  'and removes a session of their own without bookings');
select is(
  (select string_agg(right(id::text, 4), ',' order by id) from public.v_session_availability
   where pg_temp.is_fixture_session(id)),
  'a501',
  'through the calendar view they too see their own RW only'
);

-- ===== admin_rw 08 =====
reset role;
select pg_temp.act_as('admin_rw_08');
select is((select count(*)::int from public.visit_sessions where pg_temp.is_fixture_session(id) and rw_id = 5), 0,
  'RW 08''s admin sees no RW 05 session');

-- ===== superadmin =====
reset role;
select pg_temp.act_as('superadmin_aal1');
select is((select count(*)::int from public.visit_sessions where pg_temp.is_fixture_session(id)), 0,
  'without AAL2 the superadmin sees no session of any RW');
select throws_ok($$insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity,
  created_by) values (8, public.today_jkt() + 35, '13:00', '15:00', 'Tanpa TOTP', 20,
  '00000000-0000-4000-8000-00000000f001')$$, '42501', null, 'and creates none');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.row_count($$update public.visit_sessions set capacity = 60
  where id = '00000000-0000-4000-8000-00000000a801'$$), 1, 'at AAL2 they edit any RW''s session');
select is(
  (select count(*)::int from public.session_templates
   where id in ('00000000-0000-4000-8000-00000000a510', '00000000-0000-4000-8000-00000000a810')
      or (rw_id = 5 and weekday = 2 and label = 'Selasa Pagi')),
  3,
  'and see every template'
);

select * from finish();
rollback;
