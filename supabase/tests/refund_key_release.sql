-- Delta review of PR #80 (20261104190200; docs/Security.md "Refunds"): an applied manual refund A that Midtrans lists
-- under A's key with another amount blocks record_refund (L6) until the superadmin releases it (L-1). N-1 (owner
-- decision): once released, the sum Midtrans lists under A's key counts as recorded and is never booked again, and the
-- gap between what A booked and that sum is a reconciliation issue of its own, not a booking. L-a: the release holds
-- only for the figure it accepted. L-b: the alert must have been delivered, and neither A's proposer nor its approver
-- releases it; a plainly acknowledged alert is released through as well.
begin;
select plan(21);
\ir helpers/rls_personas.psql

-- ===== Fixtures: an RW 05 package, three superadmins, a booking paid Rp 300.000 =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000f9001', 5, 'student', 'uji-lepas-blokir', 'Paket Uji Lepas Blokir', 'per_pax', 30000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000f9002', 5, public.today_jkt() + 6, '09:00', '10:00', 'Uji lepas blokir', 200);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000f002', 'rls-super-b@example.test'),
  ('00000000-0000-4000-8000-00000000f003', 'rls-super-c@example.test');
insert into public.profiles (id, email, full_name, role, rw_id) values
  ('00000000-0000-4000-8000-00000000f002', 'rls-super-b@example.test', 'Super B', 'superadmin', null),
  ('00000000-0000-4000-8000-00000000f003', 'rls-super-c@example.test', 'Super C', 'superadmin', null);
update public.profiles set created_at = now() - interval '40 days'
where id in ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000f002',
             '00000000-0000-4000-8000-00000000f003');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000f001', 'uji-a', 'totp', 'verified', now() - interval '39 days', now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000f002', 'uji-b', 'totp', 'verified', now() - interval '39 days', now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000f003', 'uji-c', 'totp', 'verified', now() - interval '39 days', now());

-- Another superadmin, signed in at AAL2 with a fresh code, as GoTrue would send it.
create function pg_temp.act_as_super(p_user uuid) returns void
  language plpgsql
as $$
declare
  verified_at bigint := extract(epoch from now())::bigint - 60;
begin
  perform set_config('request.jwt.claims', (jsonb_build_object(
      'iss', 'supabase', 'aud', 'authenticated', 'sub', p_user, 'role', 'authenticated',
      'email', 'rls-super@example.test', 'session_id', gen_random_uuid(), 'is_anonymous', false, 'aal', 'aal2',
      'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', verified_at),
                               jsonb_build_object('method', 'password', 'timestamp', verified_at - 60)))
    || internal.staff_token_claims(p_user))::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.hint_of(p_sql text) returns text
  language plpgsql
as $$
declare
  raised_hint text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics raised_hint = pg_exception_hint;
  return raised_hint;
end;
$$;
grant execute on function pg_temp.hint_of(text) to authenticated;

create function pg_temp.doc(p_path text) returns text
  language plpgsql security definer
as $$
begin
  insert into storage.objects (bucket_id, name) values ('documents', p_path) on conflict do nothing;
  return p_path;
end;
$$;
grant execute on function pg_temp.doc(text) to authenticated;

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

-- A booking of 10 at Rp 30.000, paid through Midtrans.
create function pg_temp.paid_booking(p_phone text) returns uuid
  language plpgsql
as $$
declare
  booking_id uuid := (internal.create_booking('00000000-0000-4000-8000-0000000f9001',
    array['00000000-0000-4000-8000-0000000f9002']::uuid[], 10,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Uji Lepas', 'pic_name', 'Ani Lepas',
                       'pic_phone', p_phone, 'pic_email', 'lepas@contoh.test', 'notes', null),
    '[]', '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000f9001', 10, '[]',
                                                       array[5]::smallint[]))) ->> 'booking_id')::uuid;
  total bigint := (select b.total_amount from public.bookings b where b.id = booking_id);
  attempt jsonb := internal.create_payment_attempt(booking_id, null, null);
  answer jsonb := jsonb_build_object('order_id', attempt ->> 'order_id', 'status_code', '200',
    'gross_amount', total || '.00', 'signature_key', repeat('a', 128), 'transaction_status', 'settlement',
    'transaction_id', 'txn-' || (attempt ->> 'order_id'), 'payment_type', 'qris', 'currency', 'IDR',
    'fraud_status', 'accept', 'settlement_time', to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'));
begin
  perform internal.attach_snap_token((attempt ->> 'payment_id')::uuid, 'token-' || (attempt ->> 'order_id'),
    'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (attempt ->> 'order_id'));
  perform internal.apply_payment_event((internal.record_payment_event('webhook',
    encode(extensions.digest(answer::text || clock_timestamp()::text, 'sha256'), 'hex'), answer) ->> 'event_id')::bigint,
    'webhook', answer, 'k1');
  return booking_id;
end;
$$;

-- A Status API answer listing p_refunds ([{refund_key, refund_amount}]) for the booking's payment, newest of all.
create function pg_temp.listed(p_booking uuid, p_refunds jsonb) returns void
  language sql
as $$
  insert into public.payment_events (payment_id, order_id, source, event_hash, transaction_status, status_code,
    gross_amount_raw, payload, processed_at)
  select p.id, p.order_id, 'status_api', md5(p.id::text || p_refunds::text || clock_timestamp()::text), 'partial_refund',
         '200', p.gross_amount || '.00',
         jsonb_build_object('order_id', p.order_id, 'currency', 'IDR', 'refunds', p_refunds,
                            'refund_amount', (select sum((r ->> 'refund_amount')::numeric) from jsonb_array_elements(p_refunds) r)::bigint || '.00'),
         now()
  from public.payments p where p.booking_id = p_booking and p.status in ('settled', 'partially_refunded');
$$;

-- The booking's payment, read as the test's owner: the superadmin's session sees no amount column of payments.
create function pg_temp.payment_row(p_booking uuid) returns public.payments
  language sql security definer
as $$ select p.* from public.payments p where p.booking_id = p_booking and p.status <> 'initiated' order by p.attempt_no limit 1; $$;
grant execute on function pg_temp.payment_row(uuid) to authenticated;

create temporary table booking on commit drop as select pg_temp.paid_booking('+6281300009101') as id;
grant select on booking to authenticated;
select is((select total_amount from public.bookings where id = (select id from booking)), 300000::bigint,
  'the booking was paid Rp 300.000');

-- ===== A: a manual refund of Rp 100.000, proposed by A, approved by B, applied by A =====
create temporary table a on commit drop as select null::uuid as id;
grant select, update on a to authenticated;
select pg_temp.act_as('superadmin_aal2');
update a set id = (public.propose_adjustment('manual_refund', (select id from booking), 100000, 'Transfer bank uji lepas',
  pg_temp.doc('bookings/' || (select id from booking) || '/adjustment-' || gen_random_uuid() || '.pdf'), '{}',
  (pg_temp.payment_row((select id from booking))).id) ->> 'id')::uuid;
reset role;
select pg_temp.act_as_super('00000000-0000-4000-8000-00000000f002');
select is(public.approve_adjustment((select id from a)) ->> 'status', 'approved', 'B approves A');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is(public.apply_adjustment((select id from a)) ->> 'status', 'applied', 'and A is applied, Rp 100.000 booked');
reset role;

-- ===== Midtrans lists Rp 80.000 under A's key =====
select pg_temp.listed((select id from booking),
  jsonb_build_array(jsonb_build_object('refund_key', (select id from a)::text, 'refund_amount', '80000.00')));
select internal.note_refund_seen(pg_temp.payment_row((select id from booking)), 'partially_refunded', null);
select is((select severity::text from public.security_alerts
           where fingerprint = 'refund_key_mismatch:' || (select id from a) and acknowledged_at is null), 'high',
  'the mismatch raises its alert');
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.record_refund((select id from booking), 80000, 'MT-A', 'Refund Midtrans dicatat',
  null, pg_temp.doc('bookings/' || (select id from booking) || '/refund-' || md5('mt-a-1')::uuid || '.pdf'))$$),
  'REFUND_KEY_MISMATCH', 'and blocks record_refund');

-- ===== L-b: who may release, and when =====
select is(pg_temp.hint_of($$select public.release_refund_key_mismatch((select id from a), 'Angka Midtrans sudah dicek')$$),
  'RELEASE_INELIGIBLE', 'A''s proposer does not release it');
reset role;
select pg_temp.act_as_super('00000000-0000-4000-8000-00000000f002');
select is(pg_temp.hint_of($$select public.release_refund_key_mismatch((select id from a), 'Angka Midtrans sudah dicek')$$),
  'RELEASE_INELIGIBLE', 'nor its approver');
reset role;
select pg_temp.act_as_super('00000000-0000-4000-8000-00000000f003');
select is(pg_temp.hint_of($$select public.release_refund_key_mismatch((select id from a), 'Angka Midtrans sudah dicek')$$),
  'ALERT_NOT_NOTIFIED', 'and nobody before the alert was delivered');
reset role;
update public.security_alerts set notified_at = now() where fingerprint = 'refund_key_mismatch:' || (select id from a);
select pg_temp.act_as_super('00000000-0000-4000-8000-00000000f003');
select is((public.release_refund_key_mismatch((select id from a), 'Angka Midtrans sudah dicek') ->> 'released_sum')::bigint,
  80000::bigint, 'C releases it, keeping the figure Midtrans lists');
select is(pg_temp.hint_of($$select public.release_refund_key_mismatch((select id from a), 'Angka Midtrans sudah dicek')$$),
  'STATE_INVALID', 'once for that figure');
reset role;

-- ===== N-1: Midtrans' Rp 80.000 counts as recorded; the gap is an issue =====
select is(internal.midtrans_recorded(pg_temp.payment_row((select id from booking))), 80000::bigint,
  'the sum Midtrans lists under A''s key counts as recorded');
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.record_refund((select id from booking), 80000, 'MT-A', 'Refund Midtrans dicatat',
  null, pg_temp.doc('bookings/' || (select id from booking) || '/refund-' || md5('mt-a-2')::uuid || '.pdf'))$$),
  'REFUND_NOT_AT_MIDTRANS', 'so record_refund(80000, ''MT-A'') cannot book the same money twice');
reset role;
select is((select refunded_amount from public.payments where id = (pg_temp.payment_row((select id from booking))).id),
  100000::bigint, 'the payment still shows only A''s Rp 100.000');
select is((select (details ->> 'gap')::bigint from public.reconciliation_issues
           where details ->> 'adjustment_id' = (select id from a)::text and resolved_at is null), 20000::bigint,
  'the release opens an issue for the gap');
select is((select (details ->> 'booked_amount') || ':' || (details ->> 'midtrans_amount') from public.reconciliation_issues
           where details ->> 'adjustment_id' = (select id from a)::text), '100000:80000', 'naming both figures');
select ok(exists (select 1 from public.audit_logs where action = 'refund.key_mismatch_released'
                  and entity_id = (select id from a)::text and metadata ->> 'released_sum' = '80000'),
  'the release is audited with its figure');

-- ===== L-a: a new figure blocks again =====
select pg_temp.listed((select id from booking),
  jsonb_build_array(jsonb_build_object('refund_key', (select id from a)::text, 'refund_amount', '90000.00')));
select is(internal.refund_key_mismatch(pg_temp.payment_row((select id from booking)), null), (select id from a),
  'a figure other than the one released blocks again');
select internal.note_refund_seen(pg_temp.payment_row((select id from booking)), 'partially_refunded', null);
select is((select count(*)::int from public.security_alerts
           where fingerprint = 'refund_key_mismatch:' || (select id from a) and acknowledged_at is null), 1,
  'with a new alert');
select is(internal.midtrans_recorded(pg_temp.payment_row((select id from booking))), 0::bigint,
  'and the released figure no longer counts');

-- L-b: an alert acknowledged plainly is released through all the same.
update public.security_alerts set acknowledged_by = '00000000-0000-4000-8000-00000000f003', notified_at = now()
where fingerprint = 'refund_key_mismatch:' || (select id from a) and acknowledged_at is null;
select is(internal.refund_key_mismatch(pg_temp.payment_row((select id from booking)), null), (select id from a),
  'a plain acknowledgement releases nothing');
select pg_temp.act_as_super('00000000-0000-4000-8000-00000000f003');
select is((public.release_refund_key_mismatch((select id from a), 'Angka Midtrans baru sudah dicek') ->> 'released_sum')::bigint,
  90000::bigint, 'the release goes through the latest alert, acknowledged or not');
reset role;

select * from finish();
rollback;
