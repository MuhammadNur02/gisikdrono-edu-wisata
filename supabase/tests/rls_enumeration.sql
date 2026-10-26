-- Catalogue-wide enumeration of what the API roles can reach (Task P1.9.01; docs/Security.md AZ-02, AZ-05, AZ-08,
-- AZ-11, SC-04). Each check walks every table, view, function or policy, so an object added by a later migration is
-- covered without anyone remembering to list it. This file holds the one allow-list of functions the API roles may
-- execute; scripts/check-table-tests.mjs makes sure every table has a pgTAP file that names it.
begin;
select plan(12);

-- ===== Tables and views =====

select is(
  array(
    select c.relname::text from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and not (c.relrowsecurity and c.relforcerowsecurity)
    order by 1
  ),
  array[]::text[],
  'every public table has RLS enabled and forced'
);
select is(
  array(
    select c.relname::text from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
      and not coalesce(c.reloptions @> array['security_invoker=true'], false)
    order by 1
  ),
  array[]::text[],
  'every public view runs with the reader''s own rights (security_invoker), and there is no materialized view'
);

-- ===== Functions: definer hygiene =====

select is(
  array(
    select n.nspname || '.' || p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'internal')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
    order by 1
  ),
  array[]::text[],
  'every function in public and internal pins search_path, security definer or not'
);
select is(
  array(
    select n.nspname || '.' || p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'internal') and p.prosecdef
      and pg_get_userbyid(p.proowner) <> 'postgres'
    order by 1
  ),
  array[]::text[],
  'every security definer function is owned by postgres'
);

-- ===== Functions: who may execute what =====

select is(
  array(
    select n.nspname || '.' || p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'internal')
      and has_function_privilege('anon', p.oid, 'execute')
    order by 1
  ),
  array['public.today_jkt'],
  'anon can execute today_jkt() and nothing else'
);
-- The RLS helpers of P1.3.01 and fresh_totp() of 0005, then the staff RPCs granted in 0005 (P1.4.07),
-- set_rw_unit_status of 20261021120000, the gate's and the certificates' of 20261025080000 and 20261025080100, and the
-- scanner's unlock and scan_ticket of 20261026080000 and 20261026090000, which since the latter is the gate's one
-- entry point: validate_ticket, check_in_ticket and the turn are its own (review of PR #54, M1); then the export and
-- the figures of 20261027080100 and 20261027080200; save_package and its two parts of 20261028080100, security
-- invoker, so the grants and policies of a direct write decide; issue_mfa_reenrolment_code of 20261029080000; and
-- acknowledge_alert_as_sole_superadmin of 20261029080400; then the finance RPCs of 20261101130000 to
-- 20261101130200; and onboarding_state of 20261103131200, booleans about the caller's own onboarding only.
select is(
  array(
    select n.nspname || '.' || p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'internal')
      and has_function_privilege('authenticated', p.oid, 'execute')
    order by 1
  ),
  array['public.aal2', 'public.acknowledge_alert_as_sole_superadmin', 'public.app_role', 'public.app_rw_id',
        'public.apply_adjustment', 'public.approve_adjustment', 'public.cancel_staff_mfa_reset',
        'public.cancel_superadmin_promotion', 'public.finance_booking', 'public.finance_overview',
        'public.find_manual_ticket', 'public.fresh_totp', 'public.generate_visit_sessions',
        'public.get_rw_treasury_account', 'public.get_vendor_bank_account', 'public.invite_superadmin', 'public.is_admin_rw', 'public.is_staff', 'public.is_superadmin',
        'public.issue_certificates', 'public.issue_mfa_reenrolment_code', 'public.onboarding_state',
        'public.owns_any_rw', 'public.owns_rw',
        'public.propose_adjustment', 'public.record_refund', 'public.reject_adjustment', 'public.reset_staff_mfa',
        'public.revenue_recap', 'public.revoke_certificate', 'public.revoke_ticket', 'public.rpc_create_export',
        'public.rpc_get_addon_notes', 'public.rpc_get_participants', 'public.rpc_log_ui_event', 'public.rpc_reveal_booking_contact',
        'public.save_package', 'public.save_package_legs', 'public.save_package_tiers', 'public.save_revenue_rule',
        'public.scan_ticket', 'public.set_rw_treasury_account', 'public.set_rw_unit_status', 'public.set_staff_role', 'public.set_staff_status',
        'public.set_vendor_bank_account', 'public.settle_revenue_entries', 'public.today_jkt',
        'public.undo_check_in', 'public.unlock_scanner_officer', 'public.verify_audit_chain', 'public.visit_stats'],
  'authenticated can execute the ten RLS helpers and the staff RPCs, nothing else'
);
select is(
  array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'svc\_%'
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
    order by 1
  ),
  array[]::text[],
  'no svc_ function is executable by anon or authenticated'
);
select is(
  array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'svc\_%'
      and not (has_function_privilege('service_role', p.oid, 'execute') and p.prosecdef)
    order by 1
  ),
  array[]::text[],
  'every svc_ function is security definer and executable by the service role'
);
select is(
  array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and not p.proname like 'svc\_%' and p.prorettype <> 'trigger'::regtype
      and p.proname not in ('app_role', 'app_rw_id', 'is_superadmin', 'is_admin_rw', 'is_staff', 'owns_rw',
                            'owns_any_rw', 'aal2', 'fresh_totp', 'today_jkt')
      and has_function_privilege('service_role', p.oid, 'execute')
    order by 1
  ),
  array[]::text[],
  'the service role can call no staff RPC and neither Auth hook, only its svc_ entry points'
);
select is(
  array(
    select r.role_name from (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
    where has_schema_privilege(r.role_name, 'internal', 'usage')
  ),
  array[]::text[],
  'no API role, the service role included, may use the internal schema itself'
);

-- ===== Nothing trusts what a user may write about themselves =====

select is(
  array(
    select schemaname || '.' || tablename || '.' || policyname from pg_policies
    where concat_ws(' ', qual, with_check) ~* '(user_metadata|raw_user_meta_data|raw_app_meta_data)'
    order by 1
  ),
  array[]::text[],
  'no policy in any schema reads user_metadata, which every user can rewrite'
);
select is(
  array(
    select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'internal')
      and p.prosrc ~* '(user_metadata|raw_user_meta_data|raw_app_meta_data)'
    order by 1
  ),
  array[]::text[],
  'and no function in public or internal reads it either'
);

select * from finish();
rollback;
