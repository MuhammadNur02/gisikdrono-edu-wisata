-- Task P4.10.01 (20261029080100, 20261029080200, 20261103081000; docs/Security.md §11.2): each rule of the anomaly
-- scan raises its alert from a seeded case, one open alert per rule and subject however many runs see it, an order
-- named by its short hash only, the actors kept in the alert, the chains checked by a call of their own, and only the
-- server runs either.
begin;
select plan(27);
\ir helpers/rls_personas.psql
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000d9001', 5, 'regular', 'uji-anomali', 'Paket Uji Anomali', 'per_pax', 250000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000d9101', 5, public.today_jkt() + 11, '07:47', '08:47', 'Uji anomali', 200),
  ('00000000-0000-4000-8000-0000000d9102', 5, public.today_jkt() + 11, '09:47', '10:47', 'Uji anomali kecil', 10);

create function pg_temp.hold(p_session uuid, p_pax integer, p_phone text) returns uuid
  language plpgsql
as $$
declare
  otp_id uuid;
begin
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id into otp_id;
  return (internal.create_booking('00000000-0000-4000-8000-0000000d9001', array[p_session], p_pax,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Anomali', 'pic_name', 'Ani Anomali',
                       'pic_phone', p_phone, 'pic_email', 'anomali' || right(p_phone, 4) || '@contoh.test',
                       'notes', null),
    '[]', '[]', 'pay', 'web', null, otp_id, '{"version": "2026-10-18"}', null, '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000d9001', p_pax, '[]',
                                                       array[5]::smallint[]))) ->> 'booking_id')::uuid;
end;
$$;

create function pg_temp.pay(p_booking uuid) returns text
  language plpgsql
as $$
declare
  attempt jsonb := internal.create_payment_attempt(p_booking, null, null);
  answer jsonb;
begin
  perform internal.attach_snap_token((attempt ->> 'payment_id')::uuid, 'token-' || (attempt ->> 'order_id'),
    'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (attempt ->> 'order_id'));
  answer := jsonb_build_object('order_id', attempt ->> 'order_id', 'status_code', '200',
    'gross_amount', (select b.total_amount from public.bookings b where b.id = p_booking) || '.00',
    'signature_key', repeat('a', 128), 'transaction_status', 'settlement',
    'transaction_id', 'txn-' || (attempt ->> 'order_id'), 'payment_type', 'qris', 'currency', 'IDR',
    'fraud_status', 'accept', 'settlement_time', to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'));
  perform internal.apply_payment_event((internal.record_payment_event('webhook',
    encode(sha256(convert_to(answer::text, 'UTF8')), 'hex'), answer) ->> 'event_id')::bigint, 'webhook', answer, 'k1');
  return attempt ->> 'order_id';
end;
$$;

create temporary table cases on commit drop as select
  pg_temp.hold('00000000-0000-4000-8000-0000000d9101', 80, '+6281300009001') as large,
  pg_temp.hold('00000000-0000-4000-8000-0000000d9101', 2, '+6281300009002') as refunded,
  pg_temp.hold('00000000-0000-4000-8000-0000000d9101', 2, '+6281300009003') as early,
  pg_temp.hold('00000000-0000-4000-8000-0000000d9102', 4, '+6281300009004') as crowding;
-- Unpaid holds take half a session at most when they are made; a session made smaller afterwards is what the rule
-- watches for.
update public.visit_sessions set capacity = 5 where id = '00000000-0000-4000-8000-0000000d9102';
create temporary table orders on commit drop as select
  pg_temp.pay((select large from cases)) as large, pg_temp.pay((select refunded from cases)) as refunded,
  pg_temp.pay((select early from cases)) as early;

select set_config('app.in_rpc', '1', true);
-- A refund of the large booking's payment, past the volume: its ticket now has no settled payment behind it.
update public.payments set status = 'refunded', refunded_amount = total.amount
from (select b.total_amount as amount from public.bookings b where b.id = (select large from cases)) as total
where booking_id = (select large from cases);
-- A check-in on the day before the visit.
update public.tickets_qr set status = 'used', checked_in_at = now(), checked_in_pax = 2
where booking_id = (select early from cases);
-- A paid booking whose tickets never came.
update public.bookings set paid_at = now() - interval '1 hour' where id = (select refunded from cases);
delete from public.tickets_qr where booking_id = (select refunded from cases);
select set_config('app.in_rpc', '', true);

insert into public.webhook_rejections (provider, reason, order_id)
select 'midtrans', 'signature_invalid', (select early from orders) from generate_series(1, 3);
insert into public.security_events (event_type, severity, entity_type, entity_id, details) values
  ('webhook_amount_mismatch', 'high', 'payments', 'uji-selisih', '{}'),
  ('manual_checkin', 'medium', 'tickets_qr', 'uji-manual', '{}'),
  ('role_changed', 'high', 'profiles', 'uji-superadmin', '{"to_role": "superadmin"}'),
  ('login_locked', 'medium', 'profiles', 'uji-kunci-1', '{}'),
  ('login_locked', 'medium', 'profiles', 'uji-kunci-2', '{}'),
  ('mfa_locked', 'medium', 'profiles', 'uji-kunci-3', '{}');
insert into public.security_events (event_type, severity, actor_id, entity_type, entity_id, details) values
  ('manual_checkin', 'medium', '00000000-0000-4000-8000-00000000f005', 'tickets_qr', 'uji-manual-petugas', '{}');

create function pg_temp.alerted(p_rule text, p_subject text default null) returns integer
  language sql stable
as $$
  select count(*)::int from public.security_alerts a
  where a.rule = p_rule and (p_subject is null or a.fingerprint = p_rule || ':' || p_subject)
    and a.created_at = now();
$$;

-- Task P4.8.04 (AUTH-12): RW 08's officer has two verified authenticators, RW 13's exactly one; RW 05's has none, and the
-- account without a role is not staff, so it is not watched (the onboarding rule comes with /onboarding).
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000d9f01', '00000000-0000-4000-8000-00000000f008', 'HP 1', 'totp', 'verified', now(), now()),
  ('00000000-0000-4000-8000-0000000d9f02', '00000000-0000-4000-8000-00000000f008', 'HP 2', 'totp', 'verified', now(), now()),
  ('00000000-0000-4000-8000-0000000d9f03', '00000000-0000-4000-8000-00000000f013', 'HP', 'totp', 'verified', now(), now()),
  ('00000000-0000-4000-8000-0000000d9f04', '00000000-0000-4000-8000-00000000f013', 'HP lama', 'totp', 'unverified', now(), now());

-- F-72-1 (20261103081000): two RW 05 officers waiting for their re-enrolment code with no factor, one reset three
-- days ago and one eight days ago.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000d9e01', 'tunggu-baru@example.test'),
  ('00000000-0000-4000-8000-0000000d9e02', 'tunggu-lama@example.test');
insert into public.profiles (id, email, full_name, role, rw_id, reenrolment_required) values
  ('00000000-0000-4000-8000-0000000d9e01', 'tunggu-baru@example.test', 'Tunggu Baru', 'admin_rw', 5, true),
  ('00000000-0000-4000-8000-0000000d9e02', 'tunggu-lama@example.test', 'Tunggu Lama', 'admin_rw', 5, true);
insert into public.security_events (event_type, severity, entity_type, entity_id, details, occurred_at) values
  ('mfa_reset', 'critical', 'profiles', '00000000-0000-4000-8000-0000000d9e01', '{"stage": "completed"}',
   now() - interval '3 days'),
  ('mfa_reset', 'critical', 'profiles', '00000000-0000-4000-8000-0000000d9e02', '{"stage": "completed"}',
   now() - interval '8 days');

-- ===== One run =====
select ok((internal.run_anomaly_scan() ->> 'raised')::int >= 10, 'a run raises the seeded alerts');
select is(pg_temp.alerted('signature_burst', internal.order_ref((select early from orders))), 1,
  'bad signatures for an order that exists');
select is((select count(*)::int from public.security_alerts a
           where a.rule = 'signature_burst' and a.created_at = now()
             and (a.details::text like '%GSK-%' or a.fingerprint like '%GSK-%')),
  0, 'named by a short hash of the order, never its order id or booking code');
select is(pg_temp.alerted('webhook_amount_mismatch', 'uji-selisih'), 1, 'an amount mismatch');
select is(pg_temp.alerted('manual_checkin', 'uji-manual'), 1, 'a manual check-in');
select ok((select a.details -> 'involved' ? '00000000-0000-4000-8000-00000000f005' from public.security_alerts a
           where a.fingerprint = 'manual_checkin:uji-manual-petugas'),
  'the alert keeps who acted, so they cannot acknowledge it');
select is(pg_temp.alerted('paid_without_tickets', (select refunded from cases)::text), 1,
  'a paid booking without tickets');
select is(pg_temp.alerted('ticket_without_payment', (select t.id::text from public.tickets_qr t
                                               where t.booking_id = (select large from cases))), 1,
  'a ticket whose payment was refunded');
select is(pg_temp.alerted('refund_volume'), 1, 'refunds in volume');
select is(pg_temp.alerted('large_booking', (select large from cases)::text), 1, 'a large booking');
select is(pg_temp.alerted('session_held_unpaid', '00000000-0000-4000-8000-0000000d9102'), 1,
  'a session held mostly by an unpaid booking');
select is(pg_temp.alerted('early_checkin'), 1, 'a check-in before the visit''s day');
select is(pg_temp.alerted('new_superadmin', 'uji-superadmin'), 1, 'a new superadmin');
select is(pg_temp.alerted('lockout_spike'), 1, 'a spike of lockouts');
select is(pg_temp.alerted('staff_factor_count', '00000000-0000-4000-8000-00000000f005'), 1,
  'a staff member without exactly one authenticator');
select is(pg_temp.alerted('staff_factor_count', '00000000-0000-4000-8000-00000000f008'), 1,
  'and one with two verified authenticators');
select is(pg_temp.alerted('staff_factor_count', '00000000-0000-4000-8000-00000000f013'), 0,
  'but not one with exactly one, whatever unverified factor lies beside it');
select is(pg_temp.alerted('staff_factor_count', '00000000-0000-4000-8000-00000000f000'), 0,
  'nor an account without a role');
select is(pg_temp.alerted('staff_factor_count', '00000000-0000-4000-8000-0000000d9e01')
          + pg_temp.alerted('staff_factor_count', '00000000-0000-4000-8000-0000000d9e02'), 0,
  'an officer waiting for their re-enrolment code without a factor is not a staff member without one');
select is(pg_temp.alerted('staff_reenrolment_overdue', '00000000-0000-4000-8000-0000000d9e01'), 0,
  'within seven days of the reset the wait raises nothing');
select is(pg_temp.alerted('staff_reenrolment_overdue', '00000000-0000-4000-8000-0000000d9e02'), 1,
  'past seven days it is followed up');
select is((select a.severity::text from public.security_alerts a
           where a.fingerprint = 'staff_reenrolment_overdue:00000000-0000-4000-8000-0000000d9e02'),
  'medium', 'as a medium alert');
select is((select a.severity::text from public.security_alerts a
           where a.rule = 'paid_without_tickets' and a.created_at = now()),
  'critical', 'money without tickets is critical');

-- ===== Again =====
select internal.run_anomaly_scan();
select is((select (count(*), max(a.occurrences))::text from public.security_alerts a
           where a.rule = 'large_booking' and a.created_at = now()),
  '(1,2)', 'a second run counts an occurrence on the open alert, not a second alert');
-- The fingerprint names no hour, so an alert left open for days still gathers its sightings; once acknowledged, the
-- next sighting opens a new one.
update public.security_alerts set acknowledged_at = now(), acknowledged_by = '00000000-0000-4000-8000-00000000f001'
where rule = 'large_booking';
select internal.run_anomaly_scan();
select is((select count(*)::int from public.security_alerts a
           where a.fingerprint = 'large_booking:' || (select large from cases) and a.acknowledged_at is null),
  1, 'an acknowledged alert seen again opens a new one');
select ok((public.svc_run_chain_check() ->> 'raised')::int >= 0, 'the chains are checked by a call of their own');
select ok(not has_function_privilege('authenticated', 'public.svc_run_anomaly_scan()', 'execute')
          and has_function_privilege('service_role', 'public.svc_run_anomaly_scan()', 'execute')
          and not has_function_privilege('authenticated', 'public.svc_run_chain_check()', 'execute')
          and has_function_privilege('service_role', 'public.svc_run_chain_check()', 'execute'),
  'only the server runs the scan and the chain check');

select * from finish();
rollback;
