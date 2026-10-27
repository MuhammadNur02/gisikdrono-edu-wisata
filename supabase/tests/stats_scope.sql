-- Review of PR #93, L-4 (20261104180100_stats_scope_needs_an_rw.sql; docs/Security.md REC-07, AZ-13): an RW admin's
-- session without an RW claim reads no figures from visit_stats or revenue_recap, neither under today's role helpers
-- nor once is_admin_rw() would stop asking for the claim, where internal.stats_scope's own check is the one left.
begin;
select plan(6);
\ir helpers/rls_personas.psql

-- The RW admin of RW 05 as the access-token hook makes them, then without their app_rw_id claim.
create function pg_temp.act_as_rw_admin_without_rw() returns void
  language plpgsql
as $$
begin
  perform pg_temp.act_as('admin_rw_05');
  perform set_config('request.jwt.claims',
    (current_setting('request.jwt.claims')::jsonb - 'app_rw_id')::text, true);
end;
$$;

select pg_temp.act_as('admin_rw_05');
select lives_ok($$select public.visit_stats(public.today_jkt(), public.today_jkt(), null, 'month')$$,
  'an RW admin with their RW reads its figures');
reset role;

select pg_temp.act_as_rw_admin_without_rw();
select throws_ok($$select public.visit_stats(public.today_jkt(), public.today_jkt(), null, 'month')$$, '42501', null,
  'without an RW claim, visit_stats counts nothing');
select throws_ok($$select public.revenue_recap(public.today_jkt(), public.today_jkt())$$, '42501', null,
  'and revenue_recap neither');
reset role;

-- A drift of the role helpers, rolled back with the suite: is_admin_rw() no longer asks for the RW claim.
create or replace function public.is_admin_rw() returns boolean
  language sql stable
  set search_path = ''
as $$ select public.app_role() = 'admin_rw'; $$;

select pg_temp.act_as_rw_admin_without_rw();
select ok(public.is_staff(), 'with the drift, an RW admin without an RW passes as staff');
select throws_ok($$select public.visit_stats(public.today_jkt(), public.today_jkt(), null, 'month')$$, '42501',
  'an RW admin reads the figures of their own RW only',
  'and stats_scope still refuses them visit_stats, never the whole kelurahan');
select throws_ok($$select public.revenue_recap(public.today_jkt(), public.today_jkt())$$, '42501',
  'an RW admin reads the figures of their own RW only', 'and revenue_recap');
reset role;

select * from finish();
rollback;
