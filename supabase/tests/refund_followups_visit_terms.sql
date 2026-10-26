-- PR #80 on top of PR #69 (Task P4.7.03, P3.12.02; docs/Security.md "Refunds" and "Visit-terms refunds"):
-- 20261104190200 makes record_refund_core and note_refund_seen again. This suite proves that the visit-terms refund
-- requests still decide in the rebuilt record_refund_core (REFUND_PENDING_AT_MIDTRANS, REFUND_REQUEST_MISMATCH, the
-- request booked through book_refund_request, also from apply_adjustment), that the guards #69 put in apply_adjustment
-- and recap_invariant are still in force, and that #80's own L6, L7, I1 and I2 hold on a payment whose refund came
-- from a visit-terms request.
begin;
select plan(32);
\ir helpers/rls_personas.psql
\ir helpers/visit_terms.psql
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: an RW 05 package at Rp 30.000 a head, a session three weeks out and one for the weather =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000e7001', 5, 'student', 'uji-refund-lanjutan', 'Paket Uji Refund Lanjutan', 'per_pax',
   30000, 'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000e7301', 5, public.today_jkt() + 20, '09:00', '11:00', 'Uji refund H-20', 200),
  ('00000000-0000-4000-8000-0000000e7302', 5, public.today_jkt() + 8, '09:00', '11:00', 'Uji refund cuaca', 200);

-- The hint a statement is refused with, or null when it runs.
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

create function pg_temp.request_of(p_booking uuid) returns public.refund_requests
  language sql
as $$ select r.* from public.refund_requests r where r.booking_id = p_booking order by r.requested_at desc limit 1; $$;

create function pg_temp.payment_row(p_booking uuid) returns public.payments
  language sql
as $$
  select p.* from public.payments p
  where p.booking_id = p_booking and p.status in ('settled', 'partially_refunded', 'refunded')
  order by p.attempt_no desc limit 1;
$$;

-- A paid booking cancelled under the terms, with the refund the hub previewed.
create function pg_temp.cancelled(p_phone text) returns uuid
  language plpgsql
as $$
declare
  booking_id uuid := pg_temp.paid('00000000-0000-4000-8000-0000000e7001', '00000000-0000-4000-8000-0000000e7301', 2,
                                  p_phone, false);
  preview jsonb := internal.refund_preview(booking_id, 'cancellation');
begin
  perform internal.cancel_booking(booking_id, null, 'Batal', 'cancellation', (preview ->> 'amount')::bigint,
                                  (preview ->> 'refund_pct')::smallint);
  return booking_id;
end;
$$;

-- A proof file in the documents bucket for a booking, as finance-documents.ts stores it.
create function pg_temp.proof(p_booking uuid, p_seed text) returns text
  language sql
as $$
  insert into storage.objects (bucket_id, name)
  values ('documents', 'bookings/' || p_booking || '/refund-' || md5(p_seed)::uuid || '.pdf')
  returning name;
$$;

-- A Status API answer about the booking's payment, newest of all; p_body is merged into it.
create function pg_temp.status_answer(p_booking uuid, p_body jsonb) returns void
  language sql
as $$
  insert into public.payment_events (payment_id, order_id, source, event_hash, transaction_status, status_code,
    gross_amount_raw, payload, processed_at)
  select p.id, p.order_id, 'status_api', md5(p.order_id || p_body::text || clock_timestamp()::text), 'partial_refund',
         '200', p.gross_amount || '.00',
         jsonb_build_object('order_id', p.order_id, 'transaction_status', 'partial_refund', 'status_code', '200',
                            'currency', 'IDR') || p_body,
         now()
  from public.payments p where p.id = (pg_temp.payment_row(p_booking)).id;
$$;

-- ===== #69 in the rebuilt record_refund_core: the open request decides =====
create temporary table qris_open on commit drop as select pg_temp.cancelled('+6281300007101') as id;
create temporary table qris_proof on commit drop as select pg_temp.proof((select id from qris_open), 'a1') as path;

select is(pg_temp.hint_of($$select internal.record_refund_core((select id from qris_open), null,
  (pg_temp.request_of((select id from qris_open))).amount, 'transfer-a1', 'Transfer bank uji lanjutan',
  (select path from qris_proof), '00000000-0000-4000-8000-00000000f001', false)$$), 'REFUND_PENDING_AT_MIDTRANS',
  'a bank transfer against a QRIS request still requested at Midtrans is refused (#69 M-1, D-1)');
select internal.mark_refund_request((pg_temp.request_of((select id from qris_open))).id, 'failed', '412', 'refused');
select is(pg_temp.hint_of($$select internal.record_refund_core((select id from qris_open), null,
  (pg_temp.request_of((select id from qris_open))).amount - 1, 'transfer-a2', 'Transfer bank uji lanjutan',
  (select path from qris_proof), '00000000-0000-4000-8000-00000000f001', false)$$), 'REFUND_REQUEST_MISMATCH',
  'a refused request is finished only by a transfer of exactly its amount (#69 D-1)');
select is(internal.record_refund_core((select id from qris_open), null,
  (pg_temp.request_of((select id from qris_open))).amount, 'transfer-a3', 'Transfer bank uji lanjutan',
  (select path from qris_proof), '00000000-0000-4000-8000-00000000f001', false) ->> 'result', 'recorded',
  'its exact amount books the request');
select is((pg_temp.request_of((select id from qris_open))).status::text, 'recorded',
  'through book_refund_request: the request is recorded (#69 H1)');
select is((select status::text from public.bookings where id = (select id from qris_open)), 'cancelled',
  'and the booking stays cancelled');
select is((select e.payload ->> 'refund_key' from public.booking_events e
           where e.booking_id = (select id from qris_open) and e.reason = 'refund_recorded'
             and e.payload ->> 'refund_reference' = 'transfer-a3'),
  (pg_temp.request_of((select id from qris_open))).refund_key, 'the refund event names the request''s key');
select is(internal.record_refund_core((select id from qris_open), null,
  (pg_temp.request_of((select id from qris_open))).amount, 'transfer-a3', 'Transfer bank uji lanjutan',
  (select path from qris_proof), '00000000-0000-4000-8000-00000000f001', false) ->> 'result', 'already_recorded',
  'and recording the same transfer again changes nothing');

-- Review of PR #80, L-3: a disputed (or duplicate) payment is not refunded through its request, which would drop its
-- flag (final review of PR #69, L-1).
create temporary table disputed on commit drop as select pg_temp.cancelled('+6281300007104') as id;
select internal.mark_refund_request((pg_temp.request_of((select id from disputed))).id, 'failed', '412', 'refused');
create temporary table disputed_payment on commit drop as select (pg_temp.payment_row((select id from disputed))).id as id;
select set_config('app.in_rpc', '1', true);
update public.payments set status = 'disputed' where id = (select id from disputed_payment);
select set_config('app.in_rpc', '', true);
create temporary table disputed_proof on commit drop as select pg_temp.proof((select id from disputed), 'd1') as path;
select is(pg_temp.hint_of($$select internal.record_refund_core((select id from disputed), (select id from disputed_payment),
  (pg_temp.request_of((select id from disputed))).amount, 'transfer-d1', 'Transfer bank uji sengketa',
  (select path from disputed_proof), '00000000-0000-4000-8000-00000000f001', false)$$), 'STATE_INVALID',
  'a disputed payment''s request is not booked by a transfer (#69 L-1)');

-- ===== #69 through apply_adjustment: a manual_refund books the refused request =====
create temporary table adjusted on commit drop as select pg_temp.cancelled('+6281300007102') as id;
select internal.mark_refund_request((pg_temp.request_of((select id from adjusted))).id, 'failed', '412', 'refused');
insert into storage.objects (bucket_id, name)
values ('documents', 'bookings/' || (select id from adjusted) || '/adjustment-' || md5('adjusted')::uuid || '.pdf');
-- The superadmin persona old enough, with a factor, to approve their own adjustment after the 24 h wait.
update public.profiles set created_at = now() - interval '40 days' where id = '00000000-0000-4000-8000-00000000f001';
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-4000-8000-00000000f001', 'uji-refund-lanjutan', 'totp', 'verified',
        now() - interval '39 days', now());
create temporary table transfer on commit drop as select gen_random_uuid() as id;
grant select on transfer to authenticated;
select set_config('app.in_rpc', '1', true);
insert into public.payment_adjustments (id, booking_id, payment_id, type, amount, reason, evidence_path, proposed_by)
select (select id from transfer), b.id, (pg_temp.payment_row(b.id)).id, 'manual_refund', (pg_temp.request_of(b.id)).amount,
       'Transfer bank uji lanjutan', 'bookings/' || b.id || '/adjustment-' || md5('adjusted')::uuid || '.pdf',
       '00000000-0000-4000-8000-00000000f001'
from public.bookings b where b.id = (select id from adjusted);
update public.payment_adjustments
set status = 'approved', approved_by = '00000000-0000-4000-8000-00000000f001', approved_at = now() - interval '25 hours',
    apply_not_before = now() - interval '1 hour'
where id = (select id from transfer);
select set_config('app.in_rpc', '', true);

select pg_temp.act_as('superadmin_stale_totp');
select throws_ok($$select public.apply_adjustment((select id from transfer))$$, '42501', null,
  'apply_adjustment still needs a fresh authenticator code');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is(public.apply_adjustment((select id from transfer)) ->> 'status', 'applied',
  'with one, the approved transfer applies');
reset role;
select is((pg_temp.request_of((select id from adjusted))).status::text, 'recorded', 'and books the refused request');
select is((pg_temp.payment_row((select id from adjusted))).refunded_amount,
  (pg_temp.request_of((select id from adjusted))).amount, 'the payment shows the transfer');
select is((select status::text from public.bookings where id = (select id from adjusted)), 'cancelled',
  'the booking stays cancelled');

-- ===== #80 on that payment: I2, L6, I1 and L7 =====
select pg_temp.status_answer((select id from adjusted), jsonb_build_object('refund_amount',
  ((pg_temp.request_of((select id from adjusted))).amount + 1000) || '.00'));
create temporary table extra_proof on commit drop as select pg_temp.proof((select id from adjusted), 'b-extra') as path;
select is(pg_temp.hint_of($$select internal.record_refund_core((select id from adjusted), null, 1000, 'midtrans-b-extra',
  'Refund QRIS tambahan dari dasbor', (select path from extra_proof), '00000000-0000-4000-8000-00000000f001', true)$$),
  'REFUND_LIST_MISSING', 'I2: an answer with no refunds[] while the transfer is not counted as Midtrans'' is refused');

create temporary table mismatched_answer on commit drop as
select jsonb_build_object('refund_amount', (r.amount + 999) || '.00', 'refunds', jsonb_build_array(
         jsonb_build_object('refund_key', (select id from transfer)::text, 'refund_amount', (r.amount - 1) || '.00'),
         jsonb_build_object('refund_key', 'midtrans-b-extra', 'refund_amount', '1000.00'))) as body
from pg_temp.request_of((select id from adjusted)) as r;
select pg_temp.status_answer((select id from adjusted), (select body from mismatched_answer));
select is(pg_temp.hint_of($$select internal.record_refund_core((select id from adjusted), null, 1000, 'midtrans-b-extra',
  'Refund QRIS tambahan dari dasbor', (select path from extra_proof), '00000000-0000-4000-8000-00000000f001', true)$$),
  'REFUND_KEY_MISMATCH', 'L6: Midtrans listing the transfer''s key with another amount stops record_refund');
select is(internal.note_refund_seen(pg_temp.payment_row((select id from adjusted)), 'partially_refunded',
  (select body from mismatched_answer)) ->> 'processing_result', 'refund_awaiting_record',
  'note_refund_seen keeps that refund awaiting its record');
select is((select severity::text from public.security_alerts
           where fingerprint = 'refund_key_mismatch:' || (select id from transfer) and acknowledged_at is null),
  'high', 'and raises the high refund_key_mismatch alert');

create temporary table agreed_answer on commit drop as
select jsonb_build_object('refund_amount', (r.amount + 1000) || '.00', 'refunds', jsonb_build_array(
         jsonb_build_object('refund_key', (select id from transfer)::text, 'refund_amount', r.amount || '.00'),
         jsonb_build_object('refund_key', 'midtrans-b-extra', 'refund_amount', '1000.00'))) as body
from pg_temp.request_of((select id from adjusted)) as r;
select pg_temp.status_answer((select id from adjusted), (select body from agreed_answer));
select is(internal.record_refund_core((select id from adjusted), null, 1000, 'midtrans-b-extra',
  'Refund QRIS tambahan dari dasbor', (select path from extra_proof), '00000000-0000-4000-8000-00000000f001', true)
    ->> 'result', 'recorded', 'once Midtrans lists the key with its amount, its other refund is recorded');
select is((pg_temp.payment_row((select id from adjusted))).refunded_amount,
  (pg_temp.request_of((select id from adjusted))).amount + 1000, 'the payment shows both refunds');
select is(internal.note_refund_seen(pg_temp.payment_row((select id from adjusted)), 'partially_refunded',
  (select body from agreed_answer)) ->> 'processing_result', 'refund_already_recorded',
  'I1: a notice of what is already recorded raises nothing');
select is((select count(*)::int from public.security_alerts
           where fingerprint = 'refund_seen:' || (pg_temp.payment_row((select id from adjusted))).order_id
             and acknowledged_at is null), 0, 'and leaves no refund_seen alert open');

create temporary table l7_proof on commit drop as select pg_temp.proof((select id from adjusted), 'l7') as path;
select is(internal.adjustment_id_of(' Adjustment : {' || upper((select id from transfer)::text) || '} '),
  (select id from transfer), 'L7: an adjustment''s id is read however the reference writes it');
select is(internal.adjustment_id_of('TRF-001'), null, 'and a transfer reference names none');
select is(pg_temp.hint_of($$select internal.record_refund_core((select id from adjusted), null, 500,
  ' ADJUSTMENT:' || upper((select id from transfer)::text), 'Refund QRIS dicatat lagi', (select path from l7_proof),
  '00000000-0000-4000-8000-00000000f001', true)$$), 'STATE_INVALID',
  'so a Midtrans refund under the applied transfer''s key is not recorded twice');

-- ===== #69's apply_adjustment and recap_invariant are the ones in force =====
select ok(pg_get_functiondef('public.apply_adjustment(uuid)'::regprocedure) like '%reject_overtaken_refund%',
  'apply_adjustment still rejects a transfer Midtrans overtook (refund_paid_twice_detected)');
select ok(pg_get_functiondef('internal.record_refund_core(uuid, uuid, bigint, text, text, text, uuid, boolean)'::regprocedure)
            like '%check_refund_against_requests%book_refund_request%',
  'record_refund_core keeps the visit-terms request branch');

-- A weather refund of a QRIS payment: the ledger gives back the whole share, the payment the share less the fee.
update public.site_settings set value = '7.5' where key = 'midtrans.fee_qris_permille';
create temporary table weather on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e7001', '00000000-0000-4000-8000-0000000e7302', 2,
                    '+6281300007103', false) as id;
select pg_temp.act_as('admin_rw_05');
select public.declare_weather_disruption('00000000-0000-4000-8000-0000000e7302', 'Hujan deras');
reset role;
select internal.cancel_booking((select id from weather), null, 'Hujan', 'weather',
  (internal.refund_preview((select id from weather), 'weather') ->> 'amount')::bigint, null);
select is(pg_temp.event(pg_temp.order_of((select id from weather)), 'partial_refund',
                        (select total_amount from public.bookings where id = (select id from weather)),
                        (pg_temp.request_of((select id from weather))).amount) ->> 'processing_result',
  'refund_recorded', 'Midtrans'' weather refund is booked');
select cmp_ok(internal.weather_refund_fees((select id from weather)), '>', 0::bigint,
  'the booking carries the Midtrans fee of its weather refund');

create temporary table overview on commit drop as select null::jsonb as value;
grant select, update on overview to authenticated;
select pg_temp.act_as('superadmin_aal2');
update overview set value = public.finance_overview(public.today_jkt(), public.today_jkt());
reset role;
select is((select (value #>> '{invariant,weather_refund_fees}')::bigint from overview),
  (internal.recap_invariant(public.today_jkt(), public.today_jkt()) ->> 'weather_refund_fees')::bigint,
  'finance_overview hands the recap its weather_refund_fees line ("Biaya Midtrans refund cuaca")');
select cmp_ok((select (value #>> '{invariant,weather_refund_fees}')::bigint from overview), '>=',
  internal.weather_refund_fees((select id from weather)), 'which counts this booking''s fee');

-- ===== PR #90's key: a manual_refund keeps details.weather_link_id, a uuid, and nothing else =====
insert into storage.objects (bucket_id, name)
values ('documents', 'bookings/' || (select id from weather) || '/adjustment-' || md5('weather-link')::uuid || '.pdf');
create temporary table weather_link on commit drop as
select w.id from public.weather_notice_bookings w where w.booking_id = (select id from weather) limit 1;
create temporary table weather_payment on commit drop as select (pg_temp.payment_row((select id from weather))).id as id;
grant select on weather, weather_link, weather_payment to authenticated;
select pg_temp.act_as('superadmin_aal2');
select is(public.propose_adjustment('manual_refund', (select id from weather), 100, 'Refund cuaca manual uji',
  'bookings/' || (select id from weather) || '/adjustment-' || md5('weather-link')::uuid || '.pdf',
  jsonb_build_object('weather_link_id', (select id from weather_link), 'line_ref', 'package'),
  (select id from weather_payment)) -> 'details',
  jsonb_build_object('weather_link_id', (select id from weather_link)::text),
  'a manual refund keeps the weather link it answers, and no other detail');
select throws_ok($$select public.propose_adjustment('manual_refund', (select id from weather), 100,
  'Refund cuaca manual uji', 'bookings/x', '{"weather_link_id": "bukan-uuid"}', (select id from weather_payment))$$,
  '22023', null, 'and only as a uuid');
reset role;

select * from finish();
rollback;
