-- Policy and grant hygiene over the whole schema (Task P1.4.06, P1.4.08, docs/Security.md §6.1–§6.6): policies read
-- the JWT only through the helpers, always wrapped in (select ...); no authenticated policy opens a table with
-- using (true); the restrictive AAL2 policies sit on exactly the tables of docs/PRD.md §8.5.2; and the columns no API
-- role may read or write are granted to nobody.
begin;
select plan(9);

select is(
  array(
    select tablename || '.' || policyname from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ 'auth\.jwt\(' or coalesce(with_check, '') ~ 'auth\.jwt\(')
    order by 1
  ),
  array[]::text[],
  'no policy reads auth.jwt() itself, so is_active and claims_version apply everywhere'
);
select is(
  array(
    select tablename || '.' || policyname from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
          ~ '(?<!SELECT )((public\.)?(app_role|app_rw_id|is_superadmin|is_admin_rw|is_staff|owns_rw|owns_any_rw|aal2|today_jkt)|auth\.uid)\('
    order by 1
  ),
  array[]::text[],
  'every helper and auth.uid() call in a policy is wrapped in (select ...), so it runs once per statement'
);
select is(
  array(
    select tablename || '.' || policyname from pg_policies
    where schemaname = 'public' and 'authenticated' = any (roles)
      and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true')
    order by 1
  ),
  array[]::text[],
  'no policy opens a table to every signed-in user with using (true)'
);
select is(
  array(
    select tablename::text from pg_policies
    where schemaname = 'public' and permissive = 'RESTRICTIVE' and coalesce(qual, '') ~ 'aal2\('
    order by 1
  ),
  array['audit_logs', 'booking_participants', 'dsr_requests', 'exports', 'login_attempts', 'payment_adjustments',
        'payment_events', 'payments', 'payout_batches', 'profiles', 'reconciliation_issues', 'reconciliation_runs',
        'revenue_share_entries', 'revenue_share_rule_lines', 'revenue_share_rules', 'security_alerts', 'security_events',
        'site_settings', 'staff_invites', 'webhook_rejections'],
  'the restrictive AAL2 policy sits on exactly the finance, PII and security tables of the PRD matrix'
);
select is(
  array(
    select tablename::text from pg_tables t
    where schemaname = 'public'
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)
    order by 1
  ),
  array['document_sequences', 'guest_otps', 'rate_limit_buckets'],
  'only the three tables no API role touches go without a policy'
);
select is(
  array(
    select distinct table_name::text from information_schema.role_column_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
      and table_name in ('document_sequences', 'guest_otps', 'rate_limit_buckets', 'booking_participants')
    order by 1
  ),
  array[]::text[],
  'and they, with booking_participants, hold no grant at all'
);

-- Withheld columns (decisions of 2026-10-16): contacts, bank and treasury accounts, pay links, the stored Midtrans
-- reply, participant names on certificates and outbox recipients are granted to no API role.
select is(
  array(
    select c.table_name || '.' || c.column_name from (values
      ('bookings', 'pic_name'), ('bookings', 'pic_phone'), ('bookings', 'pic_email'), ('bookings', 'source_ip'),
      ('bookings', 'user_agent'), ('bookings', 'idempotency_key'),
      ('umkm_vendors', 'bank_name'), ('umkm_vendors', 'bank_account_number'), ('umkm_vendors', 'bank_account_holder'),
      ('rw_units', 'treasury_bank_name'), ('rw_units', 'treasury_account_number'), ('rw_units', 'treasury_account_holder'),
      ('payments', 'snap_token'), ('payments', 'snap_redirect_url'), ('payments', 'va_number'), ('payments', 'last_payload'),
      ('certificates', 'recipient_name'),
      ('notifications', 'recipient'), ('notifications', 'recipient_name'), ('notifications', 'params'),
      ('notifications', 'last_error')
    ) as c(table_name, column_name)
    cross join (values ('anon'), ('authenticated')) as api(role_name)
    where has_column_privilege(api.role_name, 'public.' || c.table_name, c.column_name, 'SELECT')
       or has_column_privilege(api.role_name, 'public.' || c.table_name, c.column_name, 'INSERT')
       or has_column_privilege(api.role_name, 'public.' || c.table_name, c.column_name, 'UPDATE')
    order by 1
  ),
  array[]::text[],
  'no API role may read or write a withheld column'
);
-- Review M4: statuses and counters move only inside the transition functions.
select is(
  array(
    select c.table_name || '.' || c.column_name from (values
      ('bookings', 'status'), ('payments', 'status'), ('tickets_qr', 'status'), ('certificates', 'status'),
      ('booking_legs', 'status'), ('visit_sessions', 'reserved_pax'), ('visit_sessions', 'checked_in_pax')
    ) as c(table_name, column_name)
    cross join (values ('anon'), ('authenticated')) as api(role_name)
    where has_column_privilege(api.role_name, 'public.' || c.table_name, c.column_name, 'INSERT')
       or has_column_privilege(api.role_name, 'public.' || c.table_name, c.column_name, 'UPDATE')
    order by 1
  ),
  array[]::text[],
  'no API role may insert or update a status or a quota counter (review M4)'
);
select is(
  array(
    select distinct table_name::text from information_schema.role_column_grants
    where table_schema = 'public' and grantee = 'anon' and privilege_type <> 'SELECT'
    order by 1
  ),
  array[]::text[],
  'anon writes nothing anywhere'
);

select * from finish();
rollback;
