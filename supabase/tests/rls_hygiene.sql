-- Policy and grant hygiene over the whole schema (Task P1.4.06, P1.4.08, docs/Security.md §6.1–§6.6): policies read
-- the JWT only through the helpers, always wrapped in (select ...); no authenticated policy opens a table with
-- using (true); a restrictive AAL2 policy sits on every table authenticated may touch (docs/PRD.md §8.5.2, review
-- of 0005 H1); and the columns no API role may read or write are granted to nobody.
begin;
select plan(14);

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
          ~ '(?<!SELECT )((public\.)?(app_role|app_rw_id|is_superadmin|is_admin_rw|is_admin_kopdes|manages_umkm|is_staff|owns_rw|owns_any_rw|aal2|fresh_totp|today_jkt)|auth\.uid)\('
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
    select c.relname::text from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and (has_any_column_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE')
           or has_table_privilege('authenticated', c.oid, 'DELETE'))
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname and p.permissive = 'RESTRICTIVE' and p.cmd = 'ALL'
          and p.roles = array['authenticated']::name[] and p.qual ~ '^\( SELECT aal2\(\) AS aal2\)$')
    order by 1
  ),
  array[]::text[],
  'every table authenticated holds a right on asks AAL2 of every command through a restrictive policy'
);
select is(
  array(
    select tablename::text from pg_tables t
    where schemaname = 'public'
      and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = t.tablename and p.permissive = 'RESTRICTIVE'
                        and coalesce(p.qual, '') ~ 'aal2\(')
    order by 1
  ),
  array['booklet_page_claims', 'document_sequences', 'guest_otps', 'rate_limit_buckets', 'reconciliation_turns'],
  'only the five tables no API role touches go without it; booking_participants carries it, ready for a grant'
);
-- docs/Security.md §5.3: the superadmin's own writes need a TOTP code from the last five minutes, not only AAL2.
select is(
  array(
    select tablename || ':' || cmd from pg_policies
    where schemaname = 'public' and permissive = 'RESTRICTIVE' and roles = array['authenticated']::name[]
      and coalesce(qual, with_check) ~ '^\( SELECT fresh_totp\(\) AS fresh_totp\)$'
    order by tablename::text || ':' || cmd collate "C"
  ),
  array['revenue_share_rule_lines:DELETE', 'revenue_share_rule_lines:INSERT', 'revenue_share_rule_lines:UPDATE',
        'revenue_share_rules:DELETE', 'revenue_share_rules:INSERT', 'revenue_share_rules:UPDATE',
        'rw_units:INSERT', 'security_alerts:UPDATE', 'site_settings:DELETE', 'site_settings:INSERT', 'site_settings:UPDATE',
        'staff_invites:DELETE', 'staff_invites:INSERT', 'staff_invites:UPDATE'],
  'invites, settings, revenue-share rules and their lines, a new RW and alert acknowledgements ask for a fresh TOTP code'
);
select is(
  array(
    select tablename::text from pg_tables t
    where schemaname = 'public'
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)
    order by 1
  ),
  array['booklet_page_claims', 'document_sequences', 'guest_otps', 'rate_limit_buckets', 'reconciliation_turns'],
  'only the five tables no API role touches go without a policy'
);
select is(
  array(
    select distinct table_name::text from information_schema.role_column_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
      and table_name in ('booklet_page_claims', 'document_sequences', 'guest_otps', 'rate_limit_buckets',
                         'reconciliation_turns', 'booking_participants')
    order by 1
  ),
  array[]::text[],
  'and they, with booking_participants, hold no grant at all'
);

-- Withheld columns (decisions of 2026-10-16 and the review of 0005): contacts, bank and treasury accounts, pay
-- links, the stored Midtrans reply and event payloads, a booking event's payload (20261103130600: it may carry a
-- refund's or a write-off's amount), the whole-booking amounts of payments, invoices and
-- quotations, a booking's add-on subtotal and discount, add-on notes, scanned payloads and the officer's IP and
-- device, a reviewer's full name, participant names and verify codes on certificates and outbox recipients are
-- granted to no API role.
select is(
  array(
    select c.table_name || '.' || c.column_name from (values
      ('bookings', 'pic_name'), ('bookings', 'pic_phone'), ('bookings', 'pic_email'), ('bookings', 'source_ip'),
      ('bookings', 'user_agent'), ('bookings', 'idempotency_key'),
      ('umkm_vendors', 'bank_name'), ('umkm_vendors', 'bank_account_number'), ('umkm_vendors', 'bank_account_holder'),
      ('rw_units', 'treasury_bank_name'), ('rw_units', 'treasury_account_number'), ('rw_units', 'treasury_account_holder'),
      ('payments', 'snap_token'), ('payments', 'snap_redirect_url'), ('payments', 'va_number'), ('payments', 'last_payload'),
      ('payments', 'gross_amount'), ('payments', 'refunded_amount'), ('payment_events', 'payload'),
      ('invoices', 'amount_due'), ('invoices', 'amount_paid'), ('invoices', 'snapshot'), ('quotations', 'snapshot'),
      ('ticket_scans', 'raw_payload'), ('ticket_scans', 'ip'), ('ticket_scans', 'device_info'),
      ('reviews', 'reviewer_name'),
      ('bookings', 'subtotal_addons'), ('bookings', 'discount_amount'), ('bookings', 'discount_note'),
      ('booking_addons', 'notes'), ('booking_events', 'payload'),
      ('certificates', 'recipient_name'), ('certificates', 'verify_code'),
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
select is(
  array(
    select api.role_name from (values ('anon'), ('authenticated')) as api(role_name)
    where has_column_privilege(api.role_name, 'public.staff_invites', 'invite_code_hash', 'SELECT')
  ),
  array[]::text[],
  'an invite code''s hash is written with the invite and read back by no API role'
);
select is(
  array(
    select api.role_name from (values ('anon'), ('authenticated')) as api(role_name)
    where has_column_privilege(api.role_name, 'public.security_alerts', 'acknowledged_at', 'INSERT')
       or has_column_privilege(api.role_name, 'public.security_alerts', 'acknowledged_at', 'UPDATE')
  ),
  array[]::text[],
  'an alert''s acknowledgement time is the database''s to write, never the client''s'
);
select is(
  array(
    select v.view_name || ':' || api.role_name
    from (values ('v_booking_export'), ('v_finance_daily')) as v(view_name)
    cross join (values ('anon'), ('authenticated')) as api(role_name)
    where has_table_privilege(api.role_name, 'public.' || v.view_name, 'SELECT')
    order by 1
  ),
  array[]::text[],
  'the export rows and the payment totals reach no API role; rpc_create_export and the finance RPC read them'
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
