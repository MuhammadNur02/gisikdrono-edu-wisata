-- Task P3.8.02–P3.8.04 (docs/Security.md §3.3 steps 5–10, §3.4; WH-01, WH-05, WH-06, WH-08, WH-14, WH-15): what
-- needs a person instead of being applied. An amount, currency or order that does not match ours, and a settlement the
-- Status API does not confirm, put the payment under review and never pay the booking; a hold under review keeps its
-- seats; a refund seen at Midtrans leaves the payment settled with a high alert (decision of 2026-10-24, Q1); a
-- chargeback disputes it; an unknown order alerts only in our own grammar; refused notifications keep metadata only.
begin;
select plan(34);
-- The kid the server signs tickets with, which svc_apply_payment_event passes and these direct calls do not
-- (20261024100100).
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000b1001', 5, 'regular', 'uji-tinjau-bayar', 'Paket Uji Tinjau Bayar', 'per_pax',
   30000, 'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000b2001', 5, public.today_jkt() + 5, '09:05', '10:05', 'Uji tinjau bayar', 200);

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

-- A hold with one attempt and its Snap page; returns the attempt's order id.
create function pg_temp.held_order(p_phone text) returns text
  language plpgsql
as $$
declare
  booking_id uuid := (internal.create_booking('00000000-0000-4000-8000-0000000b1001',
    array['00000000-0000-4000-8000-0000000b2001']::uuid[], 20,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Tinjau Bayar', 'pic_name', 'Ani Tinjau',
                       'pic_phone', p_phone, 'pic_email', 'tinjau-bayar@contoh.test', 'notes', null),
    '[]', '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000b1001', 20, '[]',
                                                       array[5]::smallint[]))) ->> 'booking_id')::uuid;
  reply jsonb := internal.create_payment_attempt(booking_id, null, null);
begin
  perform internal.attach_snap_token((reply ->> 'payment_id')::uuid, 'token-' || (reply ->> 'order_id'),
                                     'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (reply ->> 'order_id'));
  return reply ->> 'order_id';
end;
$$;

create function pg_temp.answer(p_order text, p_status text, p_amount text default '600000.00',
  p_fraud text default 'accept') returns jsonb
  language sql
as $$
  select jsonb_build_object('order_id', p_order, 'status_code', '200', 'gross_amount', p_amount,
    'signature_key', repeat('a', 128), 'transaction_status', p_status, 'transaction_id', 'txn-' || p_order,
    'payment_type', 'qris', 'currency', 'IDR', 'fraud_status', p_fraud, 'transaction_time', '2026-10-24 09:00:00');
$$;

create function pg_temp.event(p_answer jsonb) returns bigint
  language sql
as $$
  select (internal.record_payment_event('webhook', encode(extensions.digest(p_answer::text || clock_timestamp()::text,
          'sha256'), 'hex'), p_answer) ->> 'event_id')::bigint;
$$;

create function pg_temp.booking_of(p_order text) returns public.bookings
  language sql
as $$
  select b.* from public.bookings b join public.payments p on p.booking_id = b.id where p.order_id = p_order;
$$;

create temporary table orders (name text, order_id text) on commit drop;
insert into orders values
  ('mismatch', pg_temp.held_order('+6281300000801')),
  ('disagree', pg_temp.held_order('+6281300000802')),
  ('refund', pg_temp.held_order('+6281300000803')),
  ('challenge', pg_temp.held_order('+6281300000804'));
create function pg_temp.order_of(p_name text) returns text
  language sql
as $$ select order_id from orders where name = p_name; $$;

-- ===== An amount that is not ours (step 9) =====
select is(internal.apply_payment_event(pg_temp.event(pg_temp.answer(pg_temp.order_of('mismatch'), 'settlement', '1.00')),
            'webhook', null) ->> 'result',
  'needs_review', 'a settlement of another amount is never applied');
select is((select status::text from public.payments where order_id = pg_temp.order_of('mismatch')), 'needs_review',
  'its payment waits under review');
select is(((pg_temp.booking_of(pg_temp.order_of('mismatch'))).status::text,
           (pg_temp.booking_of(pg_temp.order_of('mismatch'))).needs_review,
           (pg_temp.booking_of(pg_temp.order_of('mismatch'))).review_reason)::text,
  ('pending_payment', true, 'AMOUNT_MISMATCH')::text, 'and the booking is not paid, flagged with the reason');
select ok(exists (select 1 from public.security_events where event_type = 'webhook_amount_mismatch' and severity = 'high'
                  and details ->> 'order_id' = pg_temp.order_of('mismatch')),
  'a high security event names the order');
select is((select count(*)::int from public.invoices where booking_id = (pg_temp.booking_of(pg_temp.order_of('mismatch'))).id),
  0, 'no invoice is drawn');
select is(internal.apply_payment_event(pg_temp.event(pg_temp.answer(pg_temp.order_of('mismatch'), 'settlement', '600000.50')),
            'webhook', null) ->> 'processing_result',
  'amount_mismatch', 'rupiah has no cents, so 600000.50 matches nothing');

-- ===== A hold under review keeps its seats (capture + challenge, docs/Security.md §3.4) =====
select set_config('app.hold_extension', '1', true);
update public.bookings set expires_at = now() - interval '10 minutes'
where id = (pg_temp.booking_of(pg_temp.order_of('mismatch'))).id;
select set_config('app.hold_extension', '', true);
select internal.expire_stale_bookings();
select is((pg_temp.booking_of(pg_temp.order_of('mismatch'))).status::text, 'pending_payment',
  'the sweeper skips a hold under review past its deadline');

-- ===== A settlement the Status API does not confirm (step 10, WH-14) =====
select is(internal.apply_payment_event(pg_temp.event(pg_temp.answer(pg_temp.order_of('disagree'), 'settlement')),
            'webhook', pg_temp.answer(pg_temp.order_of('disagree'), 'pending')) ->> 'result',
  'needs_review', 'a settlement Midtrans calls pending is not applied');
select is((select severity::text from public.security_alerts
           where fingerprint = 'payment_review:STATUS_DISAGREEMENT:' || pg_temp.order_of('disagree')),
  'critical', 'it raises a critical alert');
select is(internal.apply_payment_event(pg_temp.event(pg_temp.answer(pg_temp.order_of('challenge'), 'expire')),
            'webhook', pg_temp.answer(pg_temp.order_of('challenge'), 'pending')) ->> 'result',
  'applied', 'an expire Midtrans no longer confirms follows Midtrans: the attempt stays pending');
select is((select status::text from public.payments where order_id = pg_temp.order_of('challenge')), 'pending',
  'so nothing closed it');

-- ===== A card challenge waits for a person =====
select is(internal.apply_payment_event(pg_temp.event(pg_temp.answer(pg_temp.order_of('challenge'), 'capture', '600000.00',
            'challenge')), 'webhook', pg_temp.answer(pg_temp.order_of('challenge'), 'capture', '600000.00', 'challenge'))
            ->> 'payment_status',
  'needs_review', 'capture with challenge puts the payment under review');
select is((pg_temp.booking_of(pg_temp.order_of('challenge'))).review_reason, 'PAYMENT_CHALLENGE',
  'with its reason on the booking');

-- ===== A refund seen before record_refund (decision of 2026-10-24, Q1) =====
select internal.apply_payment_event(pg_temp.event(pg_temp.answer(pg_temp.order_of('refund'), 'settlement')), 'webhook',
  pg_temp.answer(pg_temp.order_of('refund'), 'settlement'));
select is(internal.apply_payment_event(pg_temp.event(pg_temp.answer(pg_temp.order_of('refund'), 'refund')), 'webhook',
            pg_temp.answer(pg_temp.order_of('refund'), 'refund')) ->> 'processing_result',
  'refund_awaiting_record', 'a refund notification waits for the superadmin to record it');
select is((select (status::text, refunded_amount) from public.payments where order_id = pg_temp.order_of('refund'))::text,
  ('settled', 0)::text, 'the payment stays settled with nothing refunded yet');
select is((pg_temp.booking_of(pg_temp.order_of('refund'))).status::text, 'paid', 'and the booking stays paid');
select internal.apply_payment_event(pg_temp.event(pg_temp.answer(pg_temp.order_of('refund'), 'partial_refund')),
  'webhook', pg_temp.answer(pg_temp.order_of('refund'), 'partial_refund'));
select is((select (severity::text, occurrences) from public.security_alerts
           where fingerprint = 'refund_seen:' || pg_temp.order_of('refund'))::text,
  ('high', 2)::text, 'one high alert per order, counting each notification');

-- ===== A chargeback =====
select is(internal.apply_payment_event(pg_temp.event(pg_temp.answer(pg_temp.order_of('refund'), 'chargeback')), 'webhook',
            pg_temp.answer(pg_temp.order_of('refund'), 'chargeback')) ->> 'payment_status',
  'disputed', 'a chargeback disputes the settled payment');
select is((select severity::text from public.security_alerts
           where fingerprint = 'payment_review:CHARGEBACK:' || pg_temp.order_of('refund')),
  'critical', 'with a critical alert');

-- ===== A chargeback on money already given back is never dropped (review of PR #39, M1) =====
create temporary table refunded_order on commit drop as select pg_temp.held_order('+6281300000805') as order_id;
select internal.apply_payment_event(pg_temp.event(pg_temp.answer((select order_id from refunded_order), 'settlement')),
  'webhook', pg_temp.answer((select order_id from refunded_order), 'settlement'));
select set_config('app.in_rpc', '1', true);
update public.payments set status = 'refunded', refunded_amount = gross_amount
where order_id = (select order_id from refunded_order);
update public.payments set status = 'duplicate' where order_id = pg_temp.order_of('mismatch');
select set_config('app.in_rpc', '', true);
select is(internal.apply_payment_event(pg_temp.event(pg_temp.answer((select order_id from refunded_order), 'chargeback')),
            'webhook', pg_temp.answer((select order_id from refunded_order), 'chargeback')) ->> 'processing_result',
  'chargeback_on_refunded', 'a chargeback on a refunded payment goes to review');
select is((select status::text from public.payments where order_id = (select order_id from refunded_order)), 'refunded',
  'which keeps its status');
select is((select severity::text from public.security_alerts
           where fingerprint = 'payment_review:CHARGEBACK:' || (select order_id from refunded_order)),
  'critical', 'with a critical alert, so nobody refunds it twice');
select is(internal.apply_payment_event(pg_temp.event(pg_temp.answer(pg_temp.order_of('mismatch'), 'chargeback')),
            'webhook', pg_temp.answer(pg_temp.order_of('mismatch'), 'chargeback')) ->> 'processing_result',
  'chargeback_on_duplicate', 'and so does a chargeback on a duplicate');
select ok(exists (select 1 from public.security_alerts
                  where fingerprint = 'payment_review:CHARGEBACK:' || pg_temp.order_of('mismatch') and severity = 'critical'),
  'with its own critical alert');

-- ===== What a settled payment recorded stays as recorded (review of PR #39, L7) =====
select set_config('app.in_rpc', '1', true);
select throws_ok($$update public.payments set va_number = '00000000000'
  where order_id = (select order_id from refunded_order)$$, 'P0001', null,
  'a refunded payment keeps its Virtual Account');
select throws_ok($$update public.payments set provider_txn_id = 'txn-rewritten'
  where order_id = pg_temp.order_of('mismatch')$$, 'P0001', null, 'and a duplicate keeps its transaction id');
select lives_ok($$update public.payments set status = 'disputed'
  where order_id = (select order_id from refunded_order)$$, 'while its status may still move');
select set_config('app.in_rpc', '', true);

-- ===== Alerts that notify again (review of PR #39, L5) =====
update public.security_alerts set notified_at = now() where fingerprint = 'refund_seen:' || pg_temp.order_of('refund');
select internal.apply_payment_event(pg_temp.event(pg_temp.answer(pg_temp.order_of('refund'), 'refund')), 'webhook',
  pg_temp.answer(pg_temp.order_of('refund'), 'refund'));
select is((select notified_at from public.security_alerts where fingerprint = 'refund_seen:' || pg_temp.order_of('refund')),
  null, 'a refund seen again notifies again');

-- ===== Orders we never issued (step 8) =====
select is(internal.apply_payment_event(pg_temp.event(pg_temp.answer('GSK-ZZZZZZZZ-01', 'settlement')), 'webhook', null)
            ->> 'result',
  'unknown_order', 'an order id we never issued is recorded, not applied');
select ok(exists (select 1 from public.security_alerts where fingerprint = 'unknown_order:GSK-ZZZZZZZZ-01'),
  'and alerts, since it is in our own grammar');
select internal.apply_payment_event(pg_temp.event(pg_temp.answer('junk-order', 'settlement')), 'webhook', null);
select ok(not exists (select 1 from public.security_alerts where fingerprint = 'unknown_order:junk-order'),
  'junk in another grammar pages nobody');

-- ===== The stored event =====
create temporary table body on commit drop as select pg_temp.answer(pg_temp.order_of('disagree'), 'pending') as answer;
create temporary table intake on commit drop as
  select internal.record_payment_event('webhook', repeat('c', 64), (select answer from body)) as first,
         internal.record_payment_event('webhook', repeat('c', 64), (select answer from body)) as second;
select is((select (first ->> 'event_id') = (second ->> 'event_id') and not (second ->> 'is_processed')::boolean from intake),
  true, 'a body delivered again is the same unprocessed event, taken up again rather than stored twice');

-- ===== Refused notifications: metadata only, alerts for known orders (WH-15) =====
select internal.record_webhook_rejection('signature_invalid', pg_temp.order_of('disagree'), '200', repeat('d', 64),
  '203.0.113.7', 'pgTAP') from generate_series(1, 3);
select ok(exists (select 1 from public.security_alerts
                  where fingerprint = 'webhook_signature_burst:' || pg_temp.order_of('disagree')),
  'three signature failures for an order we have raise an alert');
select internal.record_webhook_rejection('signature_invalid', 'GSK-YYYYYYYY-01', '200', repeat('e', 64), '203.0.113.8',
  'pgTAP') from generate_series(1, 3);
select ok(not exists (select 1 from public.security_alerts where fingerprint = 'webhook_signature_burst:GSK-YYYYYYYY-01'),
  'failures naming no order of ours raise none');

select * from finish();
rollback;
