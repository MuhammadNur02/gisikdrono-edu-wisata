-- Task P4.10.01 (20261029080100; docs/Security.md §11.2): each rule of the anomaly scan raises its alert from a
-- seeded case, a second run within the hour counts an occurrence instead of a second alert, and only the server runs it.
begin;
select plan(17);
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

create function pg_temp.alerted(p_rule text, p_subject text default null) returns integer
  language sql stable
as $$
  select count(*)::int from public.security_alerts a
  where a.rule = p_rule and (p_subject is null or a.fingerprint like p_rule || ':' || p_subject || ':%')
    and a.created_at = now();
$$;

-- ===== One run =====
select ok((internal.run_anomaly_scan(true) ->> 'raised')::int >= 10, 'a run raises the seeded alerts');
select is(pg_temp.alerted('signature_burst', (select early from orders)), 1,
  'bad signatures for an order that exists');
select is(pg_temp.alerted('webhook_amount_mismatch', 'uji-selisih'), 1, 'an amount mismatch');
select is(pg_temp.alerted('manual_checkin', 'uji-manual'), 1, 'a manual check-in');
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
select is((select a.severity::text from public.security_alerts a
           where a.rule = 'paid_without_tickets' and a.created_at = now()),
  'critical', 'money without tickets is critical');

-- ===== Again within the hour =====
select internal.run_anomaly_scan();
select is((select (count(*), max(a.occurrences))::text from public.security_alerts a
           where a.rule = 'large_booking' and a.created_at = now()),
  '(1,2)', 'a second run within the hour counts an occurrence, not a second alert');
select is(internal.run_anomaly_scan() ->> 'chains_checked', 'false', 'the chains are checked only when asked');
select ok(not has_function_privilege('authenticated', 'public.svc_run_anomaly_scan(boolean)', 'execute')
          and has_function_privilege('service_role', 'public.svc_run_anomaly_scan(boolean)', 'execute'),
  'only the server runs the scan');

select * from finish();
rollback;
