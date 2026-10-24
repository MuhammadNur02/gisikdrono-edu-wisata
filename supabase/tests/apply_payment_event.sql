-- Task P3.8.02 (docs/PRD.md §9.2, docs/Security.md §3.4–§3.5; WH-07, WH-12, WH-14, WH-16, REC-11, PAY-13):
-- internal.apply_payment_event settles a confirmed payment once, numbers its invoice and receipt, queues the ticket
-- and staff messages, never applies an event twice, records a second settlement as a duplicate, revives a late
-- settlement's seats or puts it under review, and closes a denied attempt without moving the booking.
begin;
select plan(49);
-- The kid the server signs tickets with, which svc_apply_payment_event passes and these direct calls do not
-- (20261024100100).
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures =====
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000c0001', 'bayar-super@example.test'),
  ('00000000-0000-4000-8000-0000000c0005', 'bayar-rw05@example.test'),
  ('00000000-0000-4000-8000-0000000c0008', 'bayar-rw08@example.test');
insert into public.profiles (id, email, full_name, role, rw_id, is_active) values
  ('00000000-0000-4000-8000-0000000c0001', 'bayar-super@example.test', 'Super Bayar', 'superadmin', null, true),
  ('00000000-0000-4000-8000-0000000c0005', 'bayar-rw05@example.test', 'Admin Lima', 'admin_rw', 5, true),
  ('00000000-0000-4000-8000-0000000c0008', 'bayar-rw08@example.test', 'Admin Delapan', 'admin_rw', 8, true);
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000c1001', 5, 'regular', 'uji-terapkan-bayar', 'Paket Uji Terapkan', 'per_pax', 30000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000c2001', 5, public.today_jkt() + 5, '09:05', '10:05', 'Uji terapkan', 200),
  ('00000000-0000-4000-8000-0000000c2002', 5, public.today_jkt() + 5, '13:05', '14:05', 'Uji terapkan penuh', 40);

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

create function pg_temp.hold(p_phone text, p_session uuid) returns uuid
  language sql
as $$
  select (internal.create_booking('00000000-0000-4000-8000-0000000c1001', array[p_session]::uuid[], 20,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Terapkan', 'pic_name', 'Ani Terapkan',
                       'pic_phone', p_phone, 'pic_email', 'terapkan@contoh.test', 'notes', null),
    '[]', '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000c1001', 20, '[]',
                                                       array[5]::smallint[]))) ->> 'booking_id')::uuid;
$$;

-- An attempt with its Snap page, as payment-service.ts leaves it.
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

-- A notification or Status API body for an order, as Midtrans writes one.
create function pg_temp.answer(p_order text, p_status text, p_amount text default '600000.00') returns jsonb
  language sql
as $$
  select jsonb_build_object('order_id', p_order, 'status_code', '200', 'gross_amount', p_amount,
    'signature_key', repeat('a', 128), 'transaction_status', p_status, 'transaction_id', 'txn-' || p_order,
    'payment_type', 'bank_transfer', 'currency', 'IDR', 'fraud_status', 'accept',
    'va_numbers', jsonb_build_array(jsonb_build_object('bank', 'bca', 'va_number', '12345678901')),
    'transaction_time', to_char(now() at time zone 'Asia/Jakarta' - interval '5 minutes', 'YYYY-MM-DD HH24:MI:SS'),
    'settlement_time', to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
    'customer_details', jsonb_build_object('email', 'terapkan@contoh.test'));
$$;

create function pg_temp.event(p_answer jsonb) returns bigint
  language sql
as $$
  select (internal.record_payment_event('webhook', encode(extensions.digest(p_answer::text || clock_timestamp()::text,
          'sha256'), 'hex'), p_answer) ->> 'event_id')::bigint;
$$;

-- A notification applied with the Status API's confirmation of the same status.
create function pg_temp.confirmed(p_order text, p_status text) returns jsonb
  language sql
as $$
  select internal.apply_payment_event(pg_temp.event(pg_temp.answer(p_order, p_status)), 'webhook',
                                      pg_temp.answer(p_order, p_status));
$$;

-- Holds past their deadline, expired by the sweeper as at expires_at + 5 minutes.
create function pg_temp.lapse(p_booking uuid) returns void
  language plpgsql
as $$
begin
  perform set_config('app.hold_extension', '1', true);
  update public.bookings set expires_at = now() - interval '10 minutes' where id = p_booking;
  perform set_config('app.hold_extension', '', true);
  perform internal.expire_stale_bookings();
end;
$$;

-- ===== A settlement, confirmed =====
create temporary table paid on commit drop as select pg_temp.hold('+6281300000701', '00000000-0000-4000-8000-0000000c2001') as id;
create temporary table orders (name text, order_id text) on commit drop;
insert into orders select 'first', pg_temp.attempt((select id from paid));
select internal.record_payment_failure(p.id, 'expired', null) from public.payments p
where p.order_id = (select order_id from orders where name = 'first');
insert into orders select 'second', pg_temp.attempt((select id from paid));
create temporary table settle_event on commit drop as
  select pg_temp.event(pg_temp.answer((select order_id from orders where name = 'second'), 'settlement')) as id;

select is(internal.apply_payment_event((select id from settle_event), 'webhook', null) ->> 'result',
  'needs_confirmation', 'a settlement from the webhook waits for the Status API');
select is((select processed_at from public.payment_events where id = (select id from settle_event)), null,
  'and its event stays unprocessed');
select is(internal.apply_payment_event((select id from settle_event), 'webhook',
            pg_temp.answer((select order_id from orders where name = 'second'), 'settlement')) ->> 'result',
  'applied', 'once confirmed, it is applied');
select is((select (status::text, provider_txn_id, method::text, va_number) from public.payments
           where order_id = (select order_id from orders where name = 'second'))::text,
  ('settled', 'txn-' || (select order_id from orders where name = 'second'), 'virtual_account', '12345678901')::text,
  'the payment is settled with how it was paid');
select is((select (status::text, amount_paid, paid_at is not null) from public.bookings where id = (select id from paid))::text,
  ('paid', 600000, true)::text, 'the booking is paid, with the amount paid');
select is((select (status::text, invoice_number ~ '^INV/GSK/\d{4}/\d{2}/\d{4,}$', receipt_number ~ '^KW/GSK/\d{4}/\d{2}/\d{4,}$',
                   amount_paid, snapshot #>> '{payment,order_id}')
           from public.invoices where booking_id = (select id from paid))::text,
  ('paid', true, true, 600000, (select order_id from orders where name = 'second'))::text,
  'one paid invoice with its receipt number, its snapshot naming the order');
select is((select array_agg(channel::text order by channel) from public.notifications
           where booking_id = (select id from paid) and template = 'payment_received_ticket'),
  array['whatsapp', 'email'], 'the ticket message is queued on both channels');
select is((select params ->> 'total' from public.notifications
           where template = 'admin_new_paid_booking' and recipient = 'bayar-super@example.test'
             and params ->> 'booking_code' = (select booking_code from public.bookings where id = (select id from paid))),
  '600000', 'the superadmin''s message carries the total');
select is((select (params ? 'total', params ? 'institution', params ->> 'pax', params ->> 'rw_name' is not null)
           from public.notifications
           where template = 'admin_new_paid_booking' and recipient = 'bayar-rw05@example.test'
             and params ->> 'booking_code' = (select booking_code from public.bookings where id = (select id from paid)))::text,
  (false, false, '20', true)::text, 'the RW admin''s carries their own leg only, never the total (STAFF-02)');
select is((select count(*)::int from public.notifications
           where template = 'admin_new_paid_booking' and recipient = 'bayar-rw08@example.test'), 0,
  'and an RW the booking does not visit hears nothing');
select is((select payload ->> 'customer_details' from public.payment_events where id = (select id from settle_event)), null,
  'the stored event keeps no booker field (midtrans_payload_minimise)');
select is(internal.apply_payment_event((select id from settle_event), 'webhook', null) ->> 'result',
  'already_processed', 'the same event is never applied twice');

-- ===== Later answers for the same booking =====
select is(pg_temp.confirmed((select order_id from orders where name = 'second'), 'expire') ->> 'result', 'ignored',
  'an expire after the settlement is ignored');
select is((select status::text from public.payments where order_id = (select order_id from orders where name = 'second')),
  'settled', 'so the payment stays settled');
select is(pg_temp.confirmed((select order_id from orders where name = 'first'), 'settlement') ->> 'result', 'duplicate',
  'a settlement of the first, replaced order is a duplicate');
select is((select status::text from public.payments where order_id = (select order_id from orders where name = 'first')),
  'duplicate', 'that payment is marked duplicate');
select is((select severity::text from public.security_alerts
           where fingerprint = 'duplicate_settlement:' || (select order_id from orders where name = 'first')),
  'high', 'with a high alert to refund it');
select is((select count(*)::int from public.invoices where booking_id = (select id from paid)), 1,
  'and no second invoice');
-- Its refund at Midtrans returns money the booking's own payment does not cover (review of PR #42, M6).
select internal.apply_payment_event(
  pg_temp.event(pg_temp.answer((select order_id from orders where name = 'first'), 'refund')
                || '{"refund_amount": "600000.00"}'), 'webhook',
  pg_temp.answer((select order_id from orders where name = 'first'), 'refund') || '{"refund_amount": "600000.00"}');
select is((select array_agg(distinct status::text) from public.tickets_qr where booking_id = (select id from paid)),
  array['issued'], 'so refunding the duplicate leaves the booking''s tickets valid');

-- ===== A late settlement with seats left (docs/Security.md §3.4) =====
create temporary table late on commit drop as select pg_temp.hold('+6281300000702', '00000000-0000-4000-8000-0000000c2001') as id;
insert into orders select 'late', pg_temp.attempt((select id from late));
select pg_temp.lapse((select id from late));
select is((select (b.status::text, l.status::text) from public.bookings b join public.booking_legs l on l.booking_id = b.id
           where b.id = (select id from late))::text, ('expired', 'released')::text, 'the hold expired and gave its seats back');
create temporary table seats_before on commit drop as
  select reserved_pax from public.visit_sessions where id = '00000000-0000-4000-8000-0000000c2001';
select is(pg_temp.confirmed((select order_id from orders where name = 'late'), 'settlement') ->> 'booking_status', 'paid',
  'a settlement after the expiry still pays the booking');
select is((select (l.status::text, l.quota_released_at) from public.booking_legs l where l.booking_id = (select id from late))::text,
  ('reserved', null)::text, 'its leg takes its seats again, releasable once more');
select is((select reserved_pax - (select reserved_pax from seats_before) from public.visit_sessions
           where id = '00000000-0000-4000-8000-0000000c2001'), 20, 'and the session counts them');
select is((select (review_reason, needs_review) from public.bookings where id = (select id from late))::text,
  ('LATE_SETTLEMENT_REQUOTA', false)::text, 'noted for information, with nothing to review');

-- ===== A late settlement whose session filled meanwhile =====
create temporary table full_late on commit drop as
  select pg_temp.hold('+6281300000703', '00000000-0000-4000-8000-0000000c2002') as id;
insert into orders select 'full', pg_temp.attempt((select id from full_late));
select pg_temp.lapse((select id from full_late));
select set_config('app.in_rpc', '1', true);
update public.visit_sessions set reserved_pax = capacity where id = '00000000-0000-4000-8000-0000000c2002';
select set_config('app.in_rpc', '', true);
select is(pg_temp.confirmed((select order_id from orders where name = 'full'), 'settlement') ->> 'booking_status', 'paid',
  'the money is never kept silently: the booking is paid');
select is((select (needs_review, review_reason) from public.bookings where id = (select id from full_late))::text,
  (true, 'PAID_AFTER_EXPIRY_NO_QUOTA')::text, 'but waits for the superadmin, with no seats');
select is((select count(*)::int from public.notifications
           where booking_id = (select id from full_late) and template = 'payment_received_ticket'), 0,
  'no ticket message goes out');
select ok(exists (select 1 from public.notifications where template = 'admin_booking_needs_review'
                  and params ->> 'reason' = 'PAID_AFTER_EXPIRY_NO_QUOTA'
                  and params ->> 'booking_code' = (select booking_code from public.bookings where id = (select id from full_late))),
  'and the staff are told why');

-- ===== Pending, then denied =====
-- A pending notification is confirmed too (review of PR #39, L1): its signature covers no Virtual Account, so the pay
-- page shows what the Status API answered, never what the notification carried.
create temporary table denied on commit drop as select pg_temp.hold('+6281300000704', '00000000-0000-4000-8000-0000000c2001') as id;
insert into orders select 'denied', pg_temp.attempt((select id from denied));
create temporary table pending_event on commit drop as
  select pg_temp.event(jsonb_set(pg_temp.answer((select order_id from orders where name = 'denied'), 'pending'),
                                 '{va_numbers,0,va_number}', '"99999999999"')) as id;
select is(internal.apply_payment_event((select id from pending_event), 'webhook', null) ->> 'result',
  'needs_confirmation', 'a pending notification waits for the Status API as well');
select is((select va_number from public.payments where order_id = (select order_id from orders where name = 'denied')),
  null, 'and stores nothing from its own body');
select is(internal.apply_payment_event((select id from pending_event), 'webhook',
            pg_temp.answer((select order_id from orders where name = 'denied'), 'pending')) ->> 'result',
  'applied', 'once confirmed, it is applied');
select is((select va_number from public.payments where order_id = (select order_id from orders where name = 'denied')),
  '12345678901', 'with the Virtual Account Midtrans confirmed, not the one the notification named');
select is(pg_temp.confirmed((select order_id from orders where name = 'denied'), 'deny') ->> 'payment_status', 'denied',
  'a confirmed deny closes the attempt');
select is((select status::text from public.bookings where id = (select id from denied)), 'pending_payment',
  'and the booking still waits, so the visitor may try again');

-- ===== A settlement of another total than the booking's own (review of PR #39, L4) =====
-- A discount given after the attempt was made changes the total but not the order Midtrans holds.
create temporary table discounted on commit drop as select pg_temp.hold('+6281300000706', '00000000-0000-4000-8000-0000000c2001') as id;
insert into orders select 'discounted', pg_temp.attempt((select id from discounted));
update public.bookings set discount_amount = 1000, total_amount = total_amount - 1000
where id = (select id from discounted);
select is(pg_temp.confirmed((select order_id from orders where name = 'discounted'), 'settlement') ->> 'processing_result',
  'amount_mismatch', 'a payment of the total before a discount is never applied');
select is((select (status::text, needs_review, review_reason) from public.bookings where id = (select id from discounted))::text,
  ('pending_payment', true, 'AMOUNT_MISMATCH')::text, 'the booking is not paid and waits under review');

-- ===== Paid while the booking was cancelled (PAID_WHILE_<status>) =====
create temporary table cancelled on commit drop as select pg_temp.hold('+6281300000707', '00000000-0000-4000-8000-0000000c2001') as id;
insert into orders select 'cancelled', pg_temp.attempt((select id from cancelled));
select set_config('app.in_rpc', '1', true);
update public.bookings set status = 'cancelled', cancelled_at = now() where id = (select id from cancelled);
select set_config('app.in_rpc', '', true);
select is(pg_temp.confirmed((select order_id from orders where name = 'cancelled'), 'settlement') ->> 'result', 'needs_review',
  'money for a cancelled booking is never kept silently');
select is((select (b.status::text, b.review_reason, p.status::text) from public.bookings b
           join public.payments p on p.booking_id = b.id where b.id = (select id from cancelled))::text,
  ('cancelled', 'PAID_WHILE_CANCELLED', 'settled')::text, 'the payment is settled and the booking waits under review');
select is((select count(*)::int from public.invoices where booking_id = (select id from cancelled)), 0,
  'with no invoice drawn');

-- ===== A combo's late settlement takes both legs' seats or neither (review of PR #39, M2) =====
insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000c1002', 'combo', 'uji-terapkan-kombo', 'Kombo Uji Terapkan', 'per_pax', 30000,
   'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000c1002', 5, 1), ('00000000-0000-4000-8000-0000000c1002', 13, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000c1002';
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000c2005', 5, public.today_jkt() + 5, '15:05', '16:05', 'Uji kombo 05', 40),
  ('00000000-0000-4000-8000-0000000c2013', 13, public.today_jkt() + 5, '16:15', '17:15', 'Uji kombo 13', 40);
create temporary table combo on commit drop as
  select (internal.create_booking('00000000-0000-4000-8000-0000000c1002',
    array['00000000-0000-4000-8000-0000000c2005', '00000000-0000-4000-8000-0000000c2013']::uuid[], 20,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Kombo', 'pic_name', 'Ani Kombo',
                       'pic_phone', '+6281300000708', 'pic_email', 'kombo@contoh.test', 'notes', null),
    '[]', '[]', 'pay', 'web', null, pg_temp.otp('+6281300000708'), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000c1002', 20, '[]',
                                                       array[5, 13]::smallint[]))) ->> 'booking_id')::uuid as id;
insert into orders select 'combo', pg_temp.attempt((select id from combo));
select pg_temp.lapse((select id from combo));
select set_config('app.in_rpc', '1', true);
update public.visit_sessions set reserved_pax = capacity where id = '00000000-0000-4000-8000-0000000c2013';
select set_config('app.in_rpc', '', true);
select is(pg_temp.confirmed((select order_id from orders where name = 'combo'), 'settlement') ->> 'booking_status', 'paid',
  'a combo paid after its expiry is paid');
select is((select (needs_review, review_reason) from public.bookings where id = (select id from combo))::text,
  (true, 'PAID_AFTER_EXPIRY_NO_QUOTA')::text, 'and waits for the superadmin when one of its sessions is full');
select is((select array_agg(l.status::text order by l.leg_order) from public.booking_legs l
           where l.booking_id = (select id from combo)),
  array['released', 'released'], 'neither leg takes its seats back');
select is((select reserved_pax from public.visit_sessions where id = '00000000-0000-4000-8000-0000000c2005'), 0,
  'so the session with room left holds none for it');

-- ===== Who the audit log says applied an event (review of PR #39, M2) =====
select is((select a.actor_role from public.audit_logs a
           where a.action = 'payment.event_applied' and a.entity_id = (select id::text from settle_event)),
  'cron', 'the audit log names machine work cron, with the source in its row');
select is((select a.metadata ->> 'source' from public.audit_logs a
           where a.action = 'payment.event_applied' and a.entity_id = (select id::text from settle_event)),
  'webhook', 'and the source is the webhook');

-- ===== A greeting that names a host (notifications_guest_guard) =====
-- The greeting is the first word of pic_name; a refused one holds the visitor's messages, never the settlement.
create temporary table hosted on commit drop as select pg_temp.hold('+6281300000705', '00000000-0000-4000-8000-0000000c2001') as id;
update public.bookings set pic_name = 'tamu.contoh.com Ani' where id = (select id from hosted);
insert into orders select 'hosted', pg_temp.attempt((select id from hosted));
select is(pg_temp.confirmed((select order_id from orders where name = 'hosted'), 'settlement') ->> 'booking_status', 'paid',
  'a settlement whose greeting names a host still pays the booking');
select is((select array_agg(distinct status::text) from public.notifications
           where booking_id = (select id from hosted) and template = 'payment_received_ticket'),
  array['cancelled'], 'only the visitor''s messages are held');
select ok(exists (select 1 from public.notifications where template = 'admin_new_paid_booking' and status = 'queued'
                  and params ->> 'booking_code' = (select booking_code from public.bookings where id = (select id from hosted))),
  'and the staff still hear of it');

-- ===== Callers =====
set local role authenticated;
select throws_ok($$select internal.apply_payment_event(1, 'webhook', null)$$, '42501', null,
  'a signed-in session cannot apply a payment event');
reset role;

select * from finish();
rollback;
