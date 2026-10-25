-- Task P4.8.01, (9) of the security review of the onboarding design (docs/Security.md §5.1, §6.9): an invited account
-- half-way through /onboarding (the none_aal2_factor persona of helpers/rls_personas.psql: no role, its invite claimed,
-- its own TOTP factor verified, a real AAL2 session) is refused by every permissive policy and every staff RPC exactly
-- as an account without a role is. Each check walks the catalogue, so a table, policy or RPC added later is covered;
-- every statement runs in a subtransaction that is rolled back, so nothing it changes stays.
begin;
select plan(11);
\ir helpers/rls_personas.psql

-- What a statement does for a persona: how many rows it returns or touches, or the error it raises.
create function pg_temp.outcome(p_persona text, p_statement text, p_counts boolean) returns text
  language plpgsql
as $$
declare
  answer bigint;
begin
  begin
    perform pg_temp.act_as(p_persona);
    if p_counts then
      execute p_statement into answer;
    else
      execute p_statement;
      get diagnostics answer = row_count;
    end if;
    raise exception using errcode = 'P0099', message = 'rows:' || answer;
  exception
    when sqlstate 'P0099' then return sqlerrm;
    when others then return 'error:' || sqlstate;
  end;
end;
$$;

-- The statements that read, change and remove every table and view the signed-in role may touch, and that call every
-- function it may execute but the RLS helpers and onboarding_state() itself, with NULL arguments.
create function pg_temp.probes() returns table (probe text, statement text, counts boolean, is_definer boolean)
  language sql stable
as $$
  select 'select ' || c.relname, format('select count(*) from public.%I', c.relname), true, false
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v')
    and has_any_column_privilege('authenticated', c.oid, 'select')
  union all
  select 'update ' || c.relname,
         format('update public.%I set %I = %I', c.relname, col.attname, col.attname), false, false
  from pg_class c
  cross join lateral (
    select a.attname from pg_attribute a
    where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', c.oid, a.attname, 'update')
    order by a.attnum limit 1
  ) col
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  union all
  select 'delete ' || c.relname, format('delete from public.%I', c.relname), false, false
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
    and has_table_privilege('authenticated', c.oid, 'delete')
  union all
  select 'call ' || p.proname,
         format('select public.%I(%s)', p.proname,
                coalesce((select string_agg('null::' || format_type(t.type_oid, null), ', ' order by t.ordinality)
                          from unnest(p.proargtypes::oid[]) with ordinality as t(type_oid, ordinality)), '')),
         false, p.prosecdef
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
    and has_function_privilege('authenticated', p.oid, 'execute')
    and p.proname not in ('app_role', 'app_rw_id', 'is_superadmin', 'is_admin_rw', 'is_staff', 'owns_rw',
                          'owns_any_rw', 'aal2', 'fresh_totp', 'today_jkt', 'onboarding_state');
$$;

create temporary table outcomes as
select probe, is_definer, pg_temp.outcome('none', statement, counts) as without_factor,
       pg_temp.outcome('none_aal2_factor', statement, counts) as with_factor
from pg_temp.probes();

-- ===== The persona is what it claims to be =====
select is(internal.staff_token_claims('00000000-0000-4000-8000-00000000f00f') ->> 'app_role', 'none',
  'an invited account half-way through onboarding carries no role');
select ok(internal.has_exactly_one_factor('00000000-0000-4000-8000-00000000f00f')
          and internal.held_claim('00000000-0000-4000-8000-00000000f00f') is not null,
  'with its own verified authenticator and its invite claimed');
select pg_temp.act_as('none_aal2_factor');
select is((public.aal2(), public.is_staff(), public.app_role()::text)::text, '(t,f,none)',
  'at AAL2, and still no staff member');
reset role;
select set_config('request.jwt.claims', '', true);

-- ===== Refused like an account without a role =====
select ok((select count(*) from outcomes where probe like 'select %') > 0
          and (select count(*) from outcomes where probe like 'call %') > 0, 'the walk found tables and RPCs');
select is(array(select probe from outcomes where probe like 'select %' and with_factor is distinct from without_factor
                order by 1),
  array[]::text[], 'it reads no row of any table or view that an account without a role cannot');
select is(array(select probe from outcomes where probe like 'update %' and with_factor is distinct from without_factor
                order by 1),
  array[]::text[], 'it changes no row that an account without a role cannot');
select is(array(select probe from outcomes where probe like 'delete %' and with_factor is distinct from without_factor
                order by 1),
  array[]::text[], 'it removes no row that an account without a role cannot');
select is(array(select probe from outcomes where probe like 'update %' and with_factor not in ('rows:0')
                  and with_factor not like 'error:%' order by 1),
  array[]::text[], 'and changes nothing at all');
select is(array(select probe from outcomes where probe like 'call %' and with_factor is distinct from without_factor
                order by 1),
  array[]::text[], 'every staff RPC answers it as it answers an account without a role');
-- A security invoker RPC (save_package_legs, save_package_tiers) does nothing with NULL arguments, and what it would
-- write is decided by the grants and policies the probes above walk; every security definer one refuses outright.
select is(array(select probe || ' ' || with_factor from outcomes where probe like 'call %' and is_definer
                  and with_factor not like 'error:%' order by 1),
  array[]::text[], 'and every security definer one refuses it');
select is((select count(*)::int from auth.mfa_factors f
           where f.user_id = '00000000-0000-4000-8000-00000000f00f' and f.status = 'verified'), 1,
  'the walk left the persona as it was');

select * from finish();
rollback;
