-- Task P3.9.02 (docs/Security.md §3.7; WH-13, MON-04, EP-02): what the payments poll asks Midtrans about, and its
-- housekeeping: tickets left issued on a booking no longer paid are suspended with a critical alert, and an
-- institution's hold six hours from its deadline gets one payment reminder per channel.
begin;
select plan(10);
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000f1001', 5, 'regular', 'uji-poll-paket', 'Paket Uji Poll', 'per_pax', 30000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000f2001', 5, public.today_jkt() + 5, '09:05', '10:05', 'Uji poll', 200);

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

create function pg_temp.hold(p_phone text, p_booker text) returns uuid
  language sql
as $$
  select (internal.create_booking('00000000-0000-4000-8000-0000000f1001',
    array['00000000-0000-4000-8000-0000000f2001']::uuid[], 20,
    jsonb_build_object('booker_type', p_booker, 'institution_name', 'SD Negeri Poll', 'pic_name', 'Ani Poll',
                       'pic_phone', p_phone, 'pic_email', 'poll@contoh.test', 'notes', null),
    '[]', '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000f1001', 20, '[]',
                                                       array[5]::smallint[]))) ->> 'booking_id')::uuid;
$$;

create function pg_temp.attempt(p_booking uuid) returns text
  language plpgsql
as $$
declare
  reply jsonb := internal.create_payment_attempt(p_booking, null, null);
begin
  perform internal.attach_snap_token((reply ->> 'payment_id')::uuid, 'token-' || (reply ->> 'order_id'),
                                     'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (reply ->> 'order_id'));
  return reply ->> 'order_id';
end;
$$;

-- ===== What the poll asks about =====
create temporary table waiting on commit drop as select pg_temp.hold('+6281300001101', 'school') as id;
create temporary table waiting_order on commit drop as select pg_temp.attempt((select id from waiting)) as order_id;
select ok(not exists (select 1 from internal.payments_to_poll(50) where order_id = (select order_id from waiting_order)),
  'an attempt minutes old is still being paid, so it is not asked about yet');
update public.payments set created_at = now() - interval '10 minutes'
where order_id = (select order_id from waiting_order);
select is((select reason from internal.payments_to_poll(50) where order_id = (select order_id from waiting_order)), 'open',
  'an attempt ten minutes old is asked about');

-- A paid booking whose ticket went missing is asked about too, so the poll completes it (Task P3.10.04).
create temporary table paid_order on commit drop as
  select pg_temp.attempt(pg_temp.hold('+6281300001102', 'school')) as order_id;
-- Settled ten minutes ago, as Midtrans writes its times (a settled payment's own columns are frozen, L7 of PR #39).
create temporary table paid_answer on commit drop as
  select jsonb_build_object('order_id', (select order_id from paid_order), 'status_code', '200',
    'gross_amount', '600000.00', 'signature_key', repeat('a', 128), 'transaction_status', 'settlement',
    'transaction_id', 'txn-poll', 'payment_type', 'qris', 'currency', 'IDR', 'fraud_status', 'accept',
    'settlement_time', to_char((now() - interval '10 minutes') at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'))
    as answer;
select internal.apply_payment_event((internal.record_payment_event('webhook', repeat('e', 64),
  (select answer from paid_answer)) ->> 'event_id')::bigint, 'webhook', (select answer from paid_answer));
select ok(not exists (select 1 from internal.payments_to_poll(50) where order_id = (select order_id from paid_order)),
  'a paid booking with its tickets and ledger is left alone');
delete from public.tickets_qr where booking_id = (select booking_id from public.payments
                                                    where order_id = (select order_id from paid_order));
select is((select reason from internal.payments_to_poll(50) where order_id = (select order_id from paid_order)),
  'paid_incomplete', 'one that lost a ticket is asked about');

-- ===== Housekeeping =====
-- A payment reminder for an institution's hold within six hours of its deadline, once.
select set_config('app.hold_extension', '1', true);
update public.bookings set expires_at = now() + interval '5 hours' where id = (select id from waiting);
select set_config('app.hold_extension', '', true);
create temporary table family on commit drop as select pg_temp.hold('+6281300001103', 'individual') as id;
select is((internal.payments_housekeeping() ->> 'reminded')::int >= 1, true, 'the housekeeping reminds a hold');
select is((select array_agg(channel::text order by channel) from public.notifications
           where booking_id = (select id from waiting) and template = 'payment_reminder'),
  array['whatsapp', 'email'], 'once on each channel');
select is((internal.payments_housekeeping() ->> 'reminded')::int, 0, 'and not again on the next run');
select is((select count(*)::int from public.notifications
           where booking_id = (select id from family) and template = 'payment_reminder'), 0,
  'a family''s two-hour hold gets no reminder');

-- Tickets still issued on a booking that is no longer paid are suspended, with a critical alert.
create temporary table cancelled_booking on commit drop as
  select booking_id as id from public.payments where order_id = (select order_id from paid_order);
select internal.issue_booking_tickets((select id from cancelled_booking));
select set_config('app.in_rpc', '1', true);
update public.bookings set status = 'cancelled', cancelled_at = now() where id = (select id from cancelled_booking);
select set_config('app.in_rpc', '', true);
select is((internal.payments_housekeeping() ->> 'suspended')::int, 1,
  'a ticket left on a cancelled booking is suspended');
select ok(exists (select 1 from public.security_alerts
                  where fingerprint = 'tickets_without_payment:' || (select id from cancelled_booking)
                    and severity = 'critical'),
  'with a critical alert');

select * from finish();
rollback;
