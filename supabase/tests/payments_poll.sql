-- Task P3.9.02 (docs/Security.md §3.7; WH-13, MON-04, EP-02): what the payments poll asks Midtrans about, and its
-- housekeeping: tickets left issued on a booking no longer paid are suspended with a critical alert, and an
-- institution's hold six hours from its deadline gets one payment reminder per channel.
begin;
select plan(23);
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000f1001', 5, 'regular', 'uji-poll-paket', 'Paket Uji Poll', 'per_pax', 30000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000f2001', 5, public.today_jkt() + 5, '09:05', '10:05', 'Uji poll', 1000);

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
                       'pic_phone', p_phone, 'pic_email', 'poll-' || right(p_phone, 4) || '@contoh.test', 'notes', null),
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
-- The poll completes it without asking Midtrans again: the Status API's answer could be the very event that paid it.
select is(internal.complete_paid_order((select order_id from paid_order), 'k1') ->> 'result', 'applied',
  'the self-heal writes the lost ticket back');
select is((select count(*)::int from public.tickets_qr
           where booking_id = (select booking_id from public.payments where order_id = (select order_id from paid_order))),
  1, 'one ticket for the leg again');
select ok(exists (select 1 from public.security_alerts a join public.payments p on p.order_id = (select order_id from paid_order)
                  where a.fingerprint = 'tickets_reissued:' || p.booking_id and a.severity = 'medium'),
  'with a medium alert, since a paid booking should never lose a ticket');
select is(internal.complete_paid_order((select order_id from paid_order), 'k1') ->> 'result', 'ignored',
  'a second run writes nothing');
select ok(not exists (select 1 from internal.payments_to_poll(50) where order_id = (select order_id from paid_order)),
  'and the booking is no longer asked about');

-- Paid bookings that lack a ticket take turns as the open attempts do (re-review of PR #42): of two, the one never
-- asked comes first, then the one asked longest ago, whatever else waits.
create function pg_temp.settled_without_ticket(p_phone text) returns text
  language plpgsql
as $$
declare
  settled_order text := pg_temp.attempt(pg_temp.hold(p_phone, 'school'));
  answer jsonb := jsonb_build_object('order_id', settled_order, 'status_code', '200', 'gross_amount', '600000.00',
    'signature_key', repeat('a', 128), 'transaction_status', 'settlement', 'transaction_id', 'txn-' || settled_order,
    'payment_type', 'qris', 'currency', 'IDR', 'fraud_status', 'accept',
    'settlement_time', to_char((now() - interval '10 minutes') at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'));
begin
  perform internal.apply_payment_event((internal.record_payment_event('webhook',
    encode(extensions.digest(answer::text, 'sha256'), 'hex'), answer) ->> 'event_id')::bigint, 'webhook', answer);
  delete from public.tickets_qr where booking_id = (select p.booking_id from public.payments p where p.order_id = settled_order);
  return settled_order;
end;
$$;
create temporary table paid_never_asked on commit drop as
  select pg_temp.settled_without_ticket('+6281300001109') as order_id;
create temporary table paid_asked_long_ago on commit drop as
  select pg_temp.settled_without_ticket('+6281300001110') as order_id;
update public.payments set last_polled_at = now() where status = 'settled';
update public.payments set last_polled_at = null where order_id = (select order_id from paid_never_asked);
update public.payments set last_polled_at = now() - interval '1 day'
where order_id = (select order_id from paid_asked_long_ago);
select is((select order_id from internal.payments_to_poll(1) where reason = 'paid_incomplete'),
  (select order_id from paid_never_asked), 'a paid booking never asked about comes first');
select is((select order_id from internal.payments_to_poll(1) where reason = 'paid_incomplete'),
  (select order_id from paid_asked_long_ago), 'then the one asked longest ago, though its payment is settled');

-- ===== The order and the window of the open attempts (review of PR #42, M4, M5) =====
-- Every other attempt was just asked; of these two, one never was and one was asked a day ago.
update public.payments set last_polled_at = now() where status = 'pending';
create temporary table never_asked on commit drop as
  select pg_temp.attempt(pg_temp.hold('+6281300001104', 'school')) as order_id;
create temporary table asked_long_ago on commit drop as
  select pg_temp.attempt(pg_temp.hold('+6281300001105', 'school')) as order_id;
update public.payments set created_at = now() - interval '10 minutes'
where order_id in ((select order_id from never_asked), (select order_id from asked_long_ago));
update public.payments set last_polled_at = now() - interval '1 day'
where order_id = (select order_id from asked_long_ago);
create temporary table audit_before on commit drop as
  select count(*) as n from public.audit_logs where entity_type = 'payments';
select is((select order_id from internal.payments_to_poll(1) where reason = 'open'),
  (select order_id from never_asked), 'an attempt never asked comes first');
select is((select order_id from internal.payments_to_poll(1) where reason = 'open'),
  (select order_id from asked_long_ago), 'then the one asked longest ago, so none waits behind the others');
select is((select count(*) from public.audit_logs where entity_type = 'payments'), (select n from audit_before),
  'stamping an attempt as asked writes no audit row');

create temporary table in_review on commit drop as
  select pg_temp.attempt(pg_temp.hold('+6281300001106', 'school')) as order_id;
select set_config('app.in_rpc', '1', true);
update public.payments set status = 'needs_review', created_at = now() - interval '10 minutes'
where order_id = (select order_id from in_review);
select set_config('app.in_rpc', '', true);
select ok(not exists (select 1 from internal.payments_to_poll(50) where order_id = (select order_id from in_review)),
  'an attempt under review waits for its superadmin');

-- A hold extended by staff is asked about for as long as it runs, and a day past its deadline no more.
create temporary table extended on commit drop as
  select pg_temp.attempt(pg_temp.hold('+6281300001107', 'school')) as order_id;
create temporary table lapsed on commit drop as
  select pg_temp.attempt(pg_temp.hold('+6281300001108', 'school')) as order_id;
update public.payments set created_at = now() - interval '3 days'
where order_id in ((select order_id from extended), (select order_id from lapsed));
select set_config('app.hold_extension', '1', true);
update public.bookings set expires_at = now() + interval '5 days'
where id = (select booking_id from public.payments where order_id = (select order_id from extended));
update public.bookings set expires_at = now() - interval '25 hours'
where id = (select booking_id from public.payments where order_id = (select order_id from lapsed));
select set_config('app.hold_extension', '', true);
select is((select reason from internal.payments_to_poll(50) where order_id = (select order_id from extended)), 'open',
  'an attempt three days old on a hold extended to next week is still asked about');
select ok(not exists (select 1 from internal.payments_to_poll(50) where order_id = (select order_id from lapsed)),
  'one whose hold ended more than a day ago is not');

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
