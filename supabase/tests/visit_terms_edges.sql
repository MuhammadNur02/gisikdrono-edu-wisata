-- The visit terms at their edges (review of PR #69, M4, H1, M1, M3, L2): H-2 and the visit day end to end, the day
-- turning at midnight in Jakarta rather than in UTC, a combo whose legs fall on two days, add-ons already handed over,
-- a refund previewed and then changed, the alert and staff message of every refund request, a refund call with no
-- answer that payments-poll retries and one Midtrans refused but carried out after all, the Virtual Account fee, a
-- weather refund the fee eats whole, the weather window closing, a full target session, the cap of three weather
-- moves with the ticket sent again after each, and the same cancellation or move asked twice.
begin;
select plan(188);
\ir helpers/rls_personas.psql
\ir helpers/visit_terms.psql
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: the RW 05 package at Rp 30.000 a head, a Rp 15.000 add-on, sessions on many days =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000e1001', 5, 'student', 'uji-tepi-paket', 'Paket Uji Tepi', 'per_pax', 30000,
   'published');
insert into public.umkm_vendors (id, rw_id, slug, name) values
  ('00000000-0000-4000-8000-0000000e1051', 5, 'uji-tepi-vendor', 'Vendor Uji Tepi');
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price, unit_label, min_order_qty,
  max_order_qty, is_addon_eligible, is_available, status) values
  ('00000000-0000-4000-8000-0000000e1a01', 5, '00000000-0000-4000-8000-0000000e1051', 'uji-tepi-kompos',
   'Kompos Uji Tepi', 'compost', 15000, 'kantong', 1, 10, true, true, 'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000e3002', 5, public.today_jkt() + 2, '09:00', '11:00', 'Uji tepi H-2', 200),
  ('00000000-0000-4000-8000-0000000e3005', 5, public.today_jkt() + 5, '09:00', '11:00', 'Uji tepi H-5', 200),
  ('00000000-0000-4000-8000-0000000e3006', 5, public.today_jkt() + 6, '09:00', '11:00', 'Uji tepi H-6', 200),
  ('00000000-0000-4000-8000-0000000e3007', 5, public.today_jkt() + 7, '09:00', '11:00', 'Uji tepi H-7', 200),
  ('00000000-0000-4000-8000-0000000e3008', 5, public.today_jkt() + 8, '09:00', '11:00', 'Uji tepi H-8', 200),
  ('00000000-0000-4000-8000-0000000e3009', 5, public.today_jkt() + 9, '09:00', '11:00', 'Uji tepi H-9', 200),
  ('00000000-0000-4000-8000-0000000e3012', 5, public.today_jkt() + 12, '09:00', '11:00', 'Uji tepi H-12', 200),
  ('00000000-0000-4000-8000-0000000e3013', 5, public.today_jkt() + 13, '09:00', '11:00', 'Uji tepi H-13', 200),
  ('00000000-0000-4000-8000-0000000e3014', 5, public.today_jkt() + 14, '09:00', '11:00', 'Uji tepi H-14', 200),
  ('00000000-0000-4000-8000-0000000e3015', 5, public.today_jkt() + 15, '09:00', '11:00', 'Uji tepi H-15', 200),
  ('00000000-0000-4000-8000-0000000e3016', 5, public.today_jkt() + 12, '13:00', '15:00', 'Uji tepi sempit', 3);

-- An RW officer's notice, as that officer at AAL2.
create function pg_temp.declare(p_session uuid, p_persona text default 'admin_rw_05') returns jsonb
  language plpgsql
as $$
declare
  reply jsonb;
begin
  perform pg_temp.act_as(p_persona);
  reply := public.declare_weather_disruption(p_session, 'Hujan deras');
  reset role;
  return reply;
end;
$$;

create function pg_temp.request_of(p_booking uuid) returns public.refund_requests
  language sql
as $$ select r.* from public.refund_requests r where r.booking_id = p_booking order by r.requested_at desc limit 1; $$;

-- The hint a statement is refused with, or null when it runs (re-review of PR #69, L-3).
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

-- ===== H-2, end to end: 80 % of the package =====
create temporary table h2 on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3002', 10,
                    '+6281300004001', false) as id;
select is(internal.refund_preview((select id from h2), 'cancellation') ->> 'refund_pct', '80', 'two days ahead is H-2');
select lives_ok($$select internal.cancel_booking((select id from h2), null, 'Batal', 'cancellation', 240000,
  80::smallint)$$, 'the visitor confirms the Rp 240.000 shown');
select is(pg_temp.event(pg_temp.order_of((select id from h2)), 'partial_refund', 300000, 240000) ->> 'processing_result',
  'refund_recorded', 'Midtrans'' refund is booked');
select is(pg_temp.held((select id from h2)), array['package:kelurahan=12000', 'package:rw=48000'],
  'the kept Rp 60.000 stays 20/80 with the kelurahan and the RW');

-- ===== The visit day, end to end: the package stays, the add-ons come back =====
create temporary table h0 on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3005', 10,
                    '+6281300004002', true) as id;
update public.bookings set visit_date = public.today_jkt() where id = (select id from h0);
select is(internal.refund_preview((select id from h0), 'cancellation') ->> 'amount', '30000',
  'on the visit day only the add-ons come back');
select lives_ok($$select internal.cancel_booking((select id from h0), null, 'Batal', 'cancellation', 30000,
  0::smallint)$$, 'the visitor confirms it');
select is(pg_temp.event(pg_temp.order_of((select id from h0)), 'partial_refund', 330000, 30000) ->> 'processing_result',
  'refund_recorded', 'and the refund is booked');
select is(pg_temp.held((select id from h0)),
  array['addon:rw=0', 'addon:vendor=0', 'package:kelurahan=60000', 'package:rw=240000'],
  'the whole package stays with the kelurahan and the RW; the vendor keeps nothing');

-- ===== The day turns at midnight in Jakarta =====
create temporary table turn on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3006', 10,
                    '+6281300004003', false) as id;
-- A clock the test sets: today_jkt reads test.now when given (rolled back with the rest).
create or replace function public.today_jkt() returns date
  language sql stable
  set search_path = ''
as $$
  select (coalesce(nullif(current_setting('test.now', true), '')::timestamptz, now()) at time zone 'Asia/Jakarta')::date;
$$;
create temporary table turn_day on commit drop as
select visit_date as visit_date from public.bookings where id = (select id from turn);
select set_config('test.now', ((select visit_date from turn_day) - 3)::text || ' 23:59:59+07', true);
select is(internal.refund_preview((select id from turn), 'cancellation') ->> 'refund_pct', '90',
  'one second before midnight in Jakarta it is still H-3');
select set_config('test.now', ((select visit_date from turn_day) - 3)::text || ' 17:30:00+00', true);
select is(internal.refund_preview((select id from turn), 'cancellation') ->> 'refund_pct', '80',
  'at 17:30 UTC it is already past midnight in Jakarta: H-2');
select set_config('test.now', '', true);

-- ===== The refund confirmed must be the refund shown (M3) =====
select throws_ok($$select internal.cancel_booking((select id from turn), null, 'Batal', 'cancellation', 300000,
  90::smallint)$$, 'P0001', null, 'a refund other than the one the database gives now is refused');
select is((select status::text from public.bookings where id = (select id from turn)), 'paid',
  'and the booking stays paid');
select throws_ok($$select internal.cancel_booking((select id from turn), null, 'Batal', 'cancellation', 270000,
  80::smallint)$$, 'P0001', null, 'the percentage counts too');

-- ===== Every refund request is somebody's work (H1) =====
select lives_ok($$select internal.cancel_booking((select id from turn), null, 'Batal', 'cancellation', 270000,
  90::smallint)$$, 'the figures shown cancel it');
select is((select severity::text from public.security_alerts
           where fingerprint = 'refund_requested:' || (pg_temp.request_of((select id from turn))).refund_key),
  'medium', 'the superadmin sees a refund_requested alert');
select ok(exists (select 1 from public.notifications n where n.template = 'admin_booking_needs_review'
                  and n.params ->> 'reason' = 'REFUND_REQUESTED'
                  and n.params ->> 'booking_code' = (select booking_code from public.bookings
                                                     where id = (select id from turn))),
  'and the staff get the review message');
select throws_ok($$select internal.cancel_booking((select id from turn), null, 'Lagi', 'cancellation', 270000,
  90::smallint)$$, 'P0001', null, 'the same cancellation asked again is refused');
select is((select count(*)::int from public.refund_requests where booking_id = (select id from turn)), 1,
  'and requests nothing more');

-- ===== A call with no answer stays requested and is tried again (M1) =====
select lives_ok($$select internal.mark_refund_request((pg_temp.request_of((select id from turn))).id, 'requested',
  null, 'midtrans_unreachable')$$, 'a timeout is reported');
select is((select status::text || ':' || attempts from public.refund_requests where booking_id = (select id from turn)),
  'requested:1', 'the request stays requested, one call counted');
select is(jsonb_array_length(internal.refund_requests_to_retry(10)), 0, 'and waits ten minutes before the next try');
update public.refund_requests set last_attempt_at = now() - interval '11 minutes'
where booking_id = (select id from turn);
select is(internal.refund_requests_to_retry(10) -> 0 ->> 'refund_key', (pg_temp.request_of((select id from turn))).refund_key,
  'then payments-poll picks it up');
select lives_ok($$select internal.mark_refund_request((pg_temp.request_of((select id from turn))).id, 'failed', '412',
  'midtrans_refused')$$, 'Midtrans refuses the next call in so many words');
select is(pg_temp.event(pg_temp.order_of((select id from turn)), 'partial_refund', 300000, 270000)
            ->> 'processing_result', 'refund_recorded',
  'a refund Midtrans carried out after all is still booked against the failed request');

-- ===== Add-ons already handed over still come back whole (decision of 2026-10-25, Q4) =====
create temporary table handed on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3007', 10,
                    '+6281300004004', true) as id;
update public.booking_addons set fulfillment_status = 'handed_over' where booking_id = (select id from handed);
select is(internal.refund_preview((select id from handed), 'cancellation') ->> 'addon_refund', '30000',
  'a handed-over add-on is refunded in full');

-- ===== A Virtual Account payment and the weather refund =====
select set_config('test.payment_type', 'bank_transfer', true);
create temporary table va on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3008', 5,
                    '+6281300004005', false) as id;
create temporary table va_small on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3008', 1,
                    '+6281300004006', false) as id;
select set_config('test.payment_type', '', true);
select is((select method::text from public.payments where booking_id = (select id from va) and status = 'settled'),
  'virtual_account', 'the payment is by Virtual Account');
select is(pg_temp.declare('00000000-0000-4000-8000-0000000e3008') ->> 'affected_bookings', '2',
  'the weather stops the session of both');
select is((select status::text from public.visit_sessions where id = '00000000-0000-4000-8000-0000000e3008'), 'closed',
  'the session under a notice takes no new booking (L2)');
select throws_ok($$select pg_temp.hold('00000000-0000-4000-8000-0000000e1001',
  '00000000-0000-4000-8000-0000000e3008', 2, '+6281300004007', false)$$, 'P0001', null,
  'a hold on it is refused');
select throws_ok($$select internal.refund_preview((select id from va), 'weather')$$, 'P0001', null,
  'no weather refund while the Virtual Account fee is not set');
update public.site_settings set value = '4000' where key = 'midtrans.fee_va_idr';
select is((select (q ->> 'amount') || ':' || (q ->> 'fee_amount') from (select internal.refund_preview((select id from va),
  'weather') as q) as x), '146000:4000', 'a flat Rp 4.000 Virtual Account fee comes off Rp 150.000');
update public.site_settings set value = '50000' where key = 'midtrans.fee_va_idr';
select is((select (q ->> 'amount') || ':' || (q ->> 'fee_amount') from (select internal.refund_preview(
  (select id from va_small), 'weather') as q) as x), '0:30000', 'a fee above the amount paid leaves nothing to refund');
select is(internal.cancel_booking((select id from va_small), null, 'Hujan', 'weather', 0, null) -> 'refund',
  'null'::jsonb, 'that weather cancellation requests no refund');
select is((select status::text from public.bookings where id = (select id from va_small)), 'cancelled',
  'and still cancels the booking');
select is(pg_temp.ledger_sum((select id from va_small)), 30000::bigint,
  'with nothing refunded the ledger keeps what was paid (final review of PR #69, P-3)');

-- ===== Weather moves (decision of 2026-10-25, rules 1 and 2) =====
update public.site_settings set value = '7' where key = 'midtrans.fee_qris_permille';
update public.site_settings set value = 'null' where key = 'midtrans.fee_va_idr';
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000e3010', 5, public.today_jkt() + 10, '13:00', '15:00', 'Uji tepi habis', 200),
  ('00000000-0000-4000-8000-0000000e3011', 5, public.today_jkt() + 11, '13:00', '15:00', 'Uji tepi tanpa biaya', 200);
create temporary table moved on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3009', 5,
                    '+6281300004008', false) as id;
create temporary table lapsed on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3010', 5,
                    '+6281300004010', false) as id;
select set_config('test.payment_type', 'bank_transfer', true);
create temporary table lapsed_va on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3011', 5,
                    '+6281300004011', false) as id;
select set_config('test.payment_type', '', true);
select pg_temp.declare('00000000-0000-4000-8000-0000000e3009');
select pg_temp.declare('00000000-0000-4000-8000-0000000e3010');
update public.site_settings set value = 'true' where key = 'whatsapp.weather_template_approved';
select pg_temp.declare('00000000-0000-4000-8000-0000000e3011');
update public.site_settings set value = 'false' where key = 'whatsapp.weather_template_approved';
select is((select count(*)::int from public.notifications
           where booking_id = (select id from moved) and template = 'weather_disruption' and channel = 'email'), 1,
  'the notice goes out by email (rule 4)');
select is((select count(*)::int from public.notifications
           where booking_id = (select id from moved) and template = 'weather_disruption' and channel = 'whatsapp'), 0,
  'and not by WhatsApp while whatsapp.weather_template_approved is false');
select is((select array_agg(channel::text order by channel::text) from public.notifications
           where booking_id = (select id from lapsed_va) and template = 'weather_disruption'),
  array['email', 'whatsapp'], 'once the superadmin sets it after Meta''s approval, WhatsApp goes too');
select is((select count(*)::int from public.notifications
           where booking_id = (select id from moved) and template = 'booking_link' and dedupe_key like '%:weather_%'), 2,
  'the manage link follows in a message of its own, on both channels');

select throws_ok($$select internal.reschedule_for_weather((select id from moved),
  '00000000-0000-4000-8000-0000000e3016')$$, 'P0001', 'session 00000000-0000-4000-8000-0000000e3016 has no room for 5 more visitors',
  'a session without room for the group refuses the move');
select is(internal.reschedule_for_weather((select id from moved), '00000000-0000-4000-8000-0000000e3012') ->> 'moves',
  '1', 'the first move');
select throws_ok($$select internal.reschedule_for_weather((select id from moved),
  '00000000-0000-4000-8000-0000000e3012')$$, 'P0001', null, 'the same move asked again is refused');
select is((select count(*)::int from public.booking_events
           where booking_id = (select id from moved) and reason = 'weather_reschedule'), 1, 'and moves nothing twice');
select is((select count(*)::int from public.notifications
           where booking_id = (select id from moved) and template = 'payment_received_ticket'
             and dedupe_key like '%:weather_move_%_1'), 2, 'the ticket goes out again with the new day, on both channels');
select is(internal.reschedule_for_weather((select id from moved), '00000000-0000-4000-8000-0000000e3013') ->> 'moves',
  '2', 'the rights stay with the booking and the notice: a second move needs no second notice');
select is(internal.reschedule_for_weather((select id from moved), '00000000-0000-4000-8000-0000000e3014') ->> 'moves_left',
  '0', 'a third');
select throws_ok($$select internal.reschedule_for_weather((select id from moved),
  '00000000-0000-4000-8000-0000000e3015')$$, 'P0001', null,
  'and no fourth: booking.weather_reschedule_max is 3');
select is((select visit_date - public.today_jkt() || ':' || pg_temp.reserved('00000000-0000-4000-8000-0000000e3014')
           from public.bookings where id = (select id from moved)), '14:5', 'the booking stays on its third new day');
select is(internal.refund_preview((select id from moved), 'weather') ->> 'amount', '148950',
  'after moving, the weather refund is still there while the window is open');

-- The window closes for all three: payments-poll's sweep.
select set_config('app.in_rpc', '1', true);
update public.weather_notice_bookings set open_until = now() - interval '1 second'
where booking_id in ((select id from moved), (select id from lapsed), (select id from lapsed_va));
select set_config('app.in_rpc', '', true);
select is(internal.settle_lapsed_weather_links(10), '{"auto_refunded": 1, "kept": 1, "cancelled": 0, "held": 1}'::jsonb,
  'the sweep keeps the moved booking, refunds the one that chose nothing and holds the one without a fee');
select is((select resolution from public.weather_notice_bookings where booking_id = (select id from moved)), 'kept',
  'a booking that moved keeps its new day');
select is((select b.status::text || ':' || r.kind || ':' || r.amount || ':' || r.status
           from public.bookings b join public.refund_requests r on r.booking_id = b.id
           where b.id = (select id from lapsed)), 'cancelled:weather:148950:requested',
  'one that chose nothing is cancelled and its weather refund requested (rule 2)');
select is((select severity::text from public.security_alerts
           where fingerprint = 'weather_auto_refund:' || (select id from lapsed)), 'high',
  'with an alert for the superadmin');
select is((select resolution from public.weather_notice_bookings where booking_id = (select id from lapsed)),
  'auto_refunded', 'its rights end as auto_refunded');
select is((select status::text from public.bookings where id = (select id from lapsed_va)), 'paid',
  'without a Virtual Account fee the booking stays paid for the superadmin');
select is((select severity::text from public.security_alerts
           where fingerprint = 'weather_link_held:' || (select w.id from public.weather_notice_bookings w
                                                        where w.booking_id = (select id from lapsed_va))), 'high',
  'and a high alert asks them to decide');
select is((select count(*)::int from public.weather_notice_bookings
           where booking_id = (select id from lapsed_va) and resolved_at is null), 1,
  'its rights wait for the next run, once the fee is set');

-- ===== A combo whose legs fall on two days: H-n counts to the first, and only the stopped leg moves (rule 3) =====
insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000e1003', 'combo', 'uji-tepi-kombo', 'Kombo Uji Tepi', 'per_pax', 30000, 'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000e1003', 5, 1), ('00000000-0000-4000-8000-0000000e1003', 13, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000e1003';
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000e3105', 5, public.today_jkt() + 10, '09:00', '11:00', 'Uji tepi kombo 05', 40),
  ('00000000-0000-4000-8000-0000000e3113', 13, public.today_jkt() + 11, '09:00', '11:00', 'Uji tepi kombo 13', 40),
  ('00000000-0000-4000-8000-0000000e3114', 13, public.today_jkt() + 12, '09:00', '11:00', 'Uji tepi kombo 13 baru', 40);
create temporary table combo on commit drop as
select (internal.create_booking('00000000-0000-4000-8000-0000000e1003',
  array['00000000-0000-4000-8000-0000000e3105', '00000000-0000-4000-8000-0000000e3113']::uuid[], 4,
  jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Uji Kombo', 'pic_name', 'Bu Kombo',
                     'pic_phone', '+6281300004009', 'pic_email', 'kombo@contoh.test', 'notes', null),
  '[]', '[]', 'pay', 'web', null, pg_temp.otp('+6281300004009'), '{"version": "2026-10-18"}', null,
  '{"ip": null, "user_agent": "pgTAP"}',
  internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000e1003', 4, '[]',
                                                     array[5, 13]::smallint[]))) ->> 'booking_id')::uuid as id;
select pg_temp.event(pg_temp.attempt((select id from combo)), 'settlement',
                     (select total_amount from public.bookings where id = (select id from combo)), null);
select is((select (q ->> 'days_before') || ':' || (q ->> 'refund_pct') from (select internal.refund_preview(
  (select id from combo), 'cancellation') as q) as x), '10:90', 'H-n counts to the first leg''s day, not the second');
select pg_temp.declare('00000000-0000-4000-8000-0000000e3113', 'admin_rw_13');
select throws_ok($$select internal.reschedule_for_weather((select id from combo),
  '00000000-0000-4000-8000-0000000e3012')$$, 'P0001', null, 'the RW 05 leg the weather did not stop does not move');
select is(internal.reschedule_for_weather((select id from combo), '00000000-0000-4000-8000-0000000e3114') ->> 'moves',
  '1', 'the RW 13 leg moves on its own');
select is((select array_agg(t.valid_on - public.today_jkt() order by t.valid_on) from public.tickets_qr t
           where t.booking_id = (select id from combo)), array[10, 12],
  'its ticket takes the new day; the RW 05 ticket keeps its own');
select is((select (visit_date - public.today_jkt()) || '..' || (visit_date_end - public.today_jkt())
           from public.bookings where id = (select id from combo)), '10..12', 'the booking runs from its first leg to its last');

-- ===== Review of PR #69, second round =====

-- M-C: a package rule with a vendor line leaves the kelurahan and RW treasury less than a cancellation may keep.
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000e1004', 5, 'student', 'uji-tepi-vendor-paket', 'Paket Uji Vendor', 'per_pax', 30000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000e3020', 5, public.today_jkt() + 20, '09:00', '11:00', 'Uji tepi vendor', 200);
with rule as (
  insert into public.revenue_share_rules (scope, package_id, name, effective_from)
  values ('package', '00000000-0000-4000-8000-0000000e1004', 'Aturan uji vendor', public.today_jkt() - 1)
  returning id)
insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, vendor_id, pct)
select rule.id, line.beneficiary::public.revenue_beneficiary, line.rw_id, line.vendor_id, line.pct
from rule, (values ('kelurahan', null::smallint, null::uuid, 10::numeric),
                   ('rw_treasury', 5::smallint, null::uuid, 10::numeric),
                   ('umkm_vendor', null::smallint, '00000000-0000-4000-8000-0000000e1051'::uuid, 80::numeric))
  as line(beneficiary, rw_id, vendor_id, pct);
create temporary table vendor_rule on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1004', '00000000-0000-4000-8000-0000000e3020', 10,
                    '+6281300004012', false) as id;
select is(internal.package_keeper_holdings((select id from vendor_rule)), 60000::bigint,
  'the kelurahan and the RW hold Rp 60.000 of the Rp 300.000 package');
update public.bookings set visit_date = public.today_jkt() where id = (select id from vendor_rule);
select throws_ok($$select internal.refund_preview((select id from vendor_rule), 'cancellation')$$, 'P0001', null,
  'keeping the whole package on the visit day is refused before any money moves (M-C)');
select is(pg_temp.hint_of($$select internal.refund_preview((select id from vendor_rule), 'cancellation')$$),
  'CANCEL_NEEDS_SUPERADMIN', 'with the hint the hub flags the superadmin on (D-6, M-1)');
select internal.flag_cancellation_for_superadmin((select id from vendor_rule));
select internal.flag_cancellation_for_superadmin((select id from vendor_rule));
select is((select count(*)::int from public.security_alerts
           where fingerprint = 'cancellation_needs_superadmin:' || (select id from vendor_rule)), 1,
  'once, however often the hub is opened');
update public.security_alerts set acknowledged_at = now()
where fingerprint = 'cancellation_needs_superadmin:' || (select id from vendor_rule);
select internal.flag_cancellation_for_superadmin((select id from vendor_rule));
select is((select count(*)::int from public.security_alerts
           where fingerprint = 'cancellation_needs_superadmin:' || (select id from vendor_rule)), 1,
  'and not again once the superadmin acknowledged it (L-b)');
update public.bookings set visit_date = public.today_jkt() + 20 where id = (select id from vendor_rule);
select is(internal.refund_preview((select id from vendor_rule), 'cancellation') ->> 'amount', '270000',
  'keeping 10 % at H-20 fits what they hold');
select lives_ok($$select internal.cancel_booking((select id from vendor_rule), null, 'Batal', 'cancellation', 270000,
  90::smallint)$$, 'so the cancellation goes through');
-- The ledger moves on before the refund comes back (a superadmin's correction), so the reversal no longer fits.
select internal.reverse_revenue_share((select id from vendor_rule), 280000, 'uji-koreksi', 'manual_correction');
select is(pg_temp.event(pg_temp.order_of((select id from vendor_rule)), 'partial_refund', 300000, 270000)
            ->> 'processing_result', 'refund_recorded',
  'the refund Midtrans paid out is still recorded, never refused inside the event');
select is((select severity::text from public.security_alerts
           where fingerprint = 'refund_ledger_unbalanced:' || (pg_temp.request_of((select id from vendor_rule))).refund_key),
  'high', 'and the ledger it could not reverse raises a high alert');

-- L-2: the same refund reported again after it was recorded alerts nobody.
select is(pg_temp.event(pg_temp.order_of((select id from vendor_rule)), 'partial_refund', 300000, 270000)
            ->> 'processing_result', 'refund_already_recorded', 'a repeat of a recorded refund changes nothing');

-- L-3: the visit-terms settings keep their shapes.
select throws_ok($$update public.site_settings set value = '"tiga"' where key = 'booking.weather_reschedule_max'$$,
  '23514', null, 'the weather cap is a whole number');
select throws_ok($$update public.site_settings set value = '[{"min_days": 3, "pct": 120}]'
  where key = 'booking.cancel_refund_schedule'$$, '23514', null, 'a refund percentage stays within 0-100');
select throws_ok($$update public.site_settings set value = '2.5' where key = 'midtrans.fee_va_idr'$$, '23514', null,
  'the Virtual Account fee is whole rupiah');
select lives_ok($$update public.site_settings set value = '7.5' where key = 'midtrans.fee_qris_permille'$$,
  'a QRIS fee may be a fraction of a permille');

-- L-5: a refund Midtrans took whose notification never arrives raises a high alert after six looks.
create temporary table unconfirmed on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3020', 4,
                    '+6281300004013', false) as id;
select internal.cancel_booking((select id from unconfirmed), null, 'Batal', 'cancellation',
  (internal.refund_preview((select id from unconfirmed), 'cancellation') ->> 'amount')::bigint, 90::smallint);
select internal.mark_refund_request((pg_temp.request_of((select id from unconfirmed))).id, 'submitted', '200', null)
from generate_series(1, 6);
select is((select severity::text from public.security_alerts
           where fingerprint = 'refund_unconfirmed:' || (pg_temp.request_of((select id from unconfirmed))).refund_key),
  'high', 'six looks without Midtrans'' notification raise refund_unconfirmed');

-- L-7: the phone check answers yes or no.
select is(public.svc_is_booking_phone((select id from unconfirmed), '+6281300004013'), true,
  'the booking''s own number');
select is(public.svc_is_booking_phone((select id from unconfirmed), '+6281300009999'), false, 'and no other');

-- ===== The owner's answers of 2026-10-25 on M-A and M-B =====
update public.site_settings set value = '7' where key = 'midtrans.fee_qris_permille';
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000e3030', 5, public.today_jkt() + 8, '13:00', '15:00', 'Uji tepi bayar telat', 200),
  ('00000000-0000-4000-8000-0000000e3205', 5, public.today_jkt() + 2, '20:00', '21:30', 'Uji tepi dua hari 05', 40),
  ('00000000-0000-4000-8000-0000000e3213', 13, public.today_jkt() + 5, '09:00', '11:00', 'Uji tepi dua hari 13', 40),
  ('00000000-0000-4000-8000-0000000e3214', 13, public.today_jkt() + 6, '09:00', '11:00', 'Uji tepi dua hari 13 baru', 40);

-- M-A (A19): a hold on a session under a notice that is paid afterwards gets the rights, its window from settlement.
create temporary table late_hold on commit drop as
select pg_temp.hold('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3030', 5,
                    '+6281300004014', false) as id;
create temporary table late_order on commit drop as select pg_temp.attempt((select id from late_hold)) as order_id;
select pg_temp.declare('00000000-0000-4000-8000-0000000e3030');
select is((select count(*)::int from public.weather_notice_bookings where booking_id = (select id from late_hold)), 0,
  'a hold not yet paid gets no rights when the notice comes');
select pg_temp.event((select order_id from late_order), 'settlement', 150000, null);
select is((select status::text from public.bookings where id = (select id from late_hold)), 'paid',
  'the hold is paid after the notice');
select ok((select open_until between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute'
           from public.weather_notice_bookings where booking_id = (select id from late_hold)),
  'and gets the rights, its 24 h counted from the settlement (A19)');
select is((select count(*)::int from public.notifications
           where booking_id = (select id from late_hold) and template = 'weather_disruption'), 1,
  'with the weather notice');

-- M-B (A20): a combo on two days whose first leg was visited; only the stopped leg's share comes back.
create temporary table visited on commit drop as
select (internal.create_booking('00000000-0000-4000-8000-0000000e1003',
  array['00000000-0000-4000-8000-0000000e3205', '00000000-0000-4000-8000-0000000e3213']::uuid[], 4,
  jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Uji Dua Hari', 'pic_name', 'Bu Dua',
                     'pic_phone', '+6281300004015', 'pic_email', 'duahari@contoh.test', 'notes', null),
  '[]', '[]', 'pay', 'web', null, pg_temp.otp('+6281300004015'), '{"version": "2026-10-18"}', null,
  '{"ip": null, "user_agent": "pgTAP"}',
  internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000e1003', 4, '[]',
                                                     array[5, 13]::smallint[]))) ->> 'booking_id')::uuid as id;
select pg_temp.event(pg_temp.attempt((select id from visited)), 'settlement',
                     (select total_amount from public.bookings where id = (select id from visited)), null);
-- The RW 05 leg checked in, as check_in_ticket leaves it.
select set_config('app.in_rpc', '1', true);
update public.booking_legs set status = 'checked_in', checked_in_at = now()
where booking_id = (select id from visited) and rw_id = 5;
update public.tickets_qr set status = 'used' where booking_id = (select id from visited) and rw_id = 5;
update public.bookings set status = 'checked_in' where id = (select id from visited);
select set_config('app.in_rpc', '', true);
select is(pg_temp.declare('00000000-0000-4000-8000-0000000e3213', 'admin_rw_13') ->> 'affected_bookings', '1',
  'the weather stopping the leg still to visit gives the checked_in booking its rights');
select is(internal.leg_share((select b from public.bookings b where b.id = (select id from visited)),
  (select l.id from public.booking_legs l where l.booking_id = (select id from visited) and l.rw_id = 13)), 60000::bigint,
  'the RW 13 leg''s share is half the Rp 120.000 package');
select is((select (q ->> 'amount') || ':' || (q ->> 'fee_amount') from (select internal.refund_preview(
  (select id from visited), 'weather') as q) as x), '59160:840', 'its weather refund is that share minus the fee');
select is(internal.reschedule_for_weather((select id from visited), '00000000-0000-4000-8000-0000000e3214') ->> 'moves',
  '1', 'the stopped leg may move');
select lives_ok($$select internal.cancel_booking((select id from visited), null, 'Hujan', 'weather', 59160, null)$$,
  'or take its weather refund, also after moving');
select is((select status::text from public.bookings where id = (select id from visited)), 'checked_in',
  'the booking stays checked_in');
select is((select array_agg(l.rw_id || ':' || l.status order by l.rw_id) from public.booking_legs l
           where l.booking_id = (select id from visited)), array['5:checked_in', '13:released'],
  'the visited leg stays as it was; the stopped one is released');
select is((select array_agg(t.rw_id || ':' || t.status order by t.rw_id) from public.tickets_qr t
           where t.booking_id = (select id from visited)), array['5:used', '13:revoked'], 'and only its ticket revoked');
select is((select r.amount || ':' || (r.booking_leg_id is not null) from public.refund_requests r
           where r.booking_id = (select id from visited)), '59160:true', 'the request names the leg');
create temporary table recap_before on commit drop as
select internal.recap_invariant(public.today_jkt(), public.today_jkt()) as value;
select is(pg_temp.event(pg_temp.order_of((select id from visited)), 'partial_refund', 120000, 59160)
            ->> 'processing_result', 'refund_recorded', 'and is booked when Midtrans reports it');
select is((select array_agg(x.label order by x.label) from (
    select s.beneficiary_key || '=' || (s.amount + coalesce((select sum(r.amount) from public.revenue_share_entries r
              where r.booking_id = s.booking_id and r.entry_type = 'reversal' and r.line_ref = s.line_ref
                and r.beneficiary_key = s.beneficiary_key), 0)) as label
    from public.revenue_share_entries s
    where s.booking_id = (select id from visited) and s.entry_type = 'settlement') as x),
  array['kelurahan=12000', 'rw:13=0', 'rw:5=48000'],
  'only the stopped leg''s lines give back: RW 13 its whole share, the kelurahan half of its own; RW 05 keeps all');
select is((select coalesce(sum(e.amount), 0)::bigint from public.revenue_share_entries e
           where e.booking_id = (select id from visited)),
  (select b.total_amount - p.refunded_amount - internal.weather_refund_fees(b.id) from public.bookings b
   join public.payments p on p.booking_id = b.id and p.status = 'partially_refunded' where b.id = (select id from visited)),
  'M-5: the ledger holds what was paid less the refund less its Midtrans fee, which the visitor bore');
select is((internal.recap_invariant(public.today_jkt(), public.today_jkt()) ->> 'mismatched_bookings')::int,
  (select (value ->> 'mismatched_bookings')::int from recap_before),
  'so the recap does not count it among the mismatched bookings');
select is((select status::text from public.invoices where booking_id = (select id from visited)), 'paid',
  'the invoice of the visited leg stands');

-- ===== The final review of PR #69 =====

-- M-1: a bank transfer against a QRIS request Midtrans may still pay out is refused; after Midtrans refused it, it books.
create temporary table qris_pending on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3020', 2,
                    '+6281300004016', false) as id;
select internal.cancel_booking((select id from qris_pending), null, 'Batal', 'cancellation',
  (internal.refund_preview((select id from qris_pending), 'cancellation') ->> 'amount')::bigint, 90::smallint);
insert into storage.objects (bucket_id, name)
values ('documents', 'bookings/' || (select id from qris_pending) || '/refund-' || md5('m1')::uuid || '.pdf'),
       ('documents', 'bookings/' || (select id from qris_pending) || '/refund-' || md5('m1b')::uuid || '.pdf');
select is(pg_temp.hint_of($$select internal.record_refund_core((select id from qris_pending), null,
  (pg_temp.request_of((select id from qris_pending))).amount, 'transfer-m1', 'Transfer bank uji M-1',
  'bookings/' || (select id from qris_pending) || '/refund-' || md5('m1')::uuid || '.pdf',
  '00000000-0000-4000-8000-00000000f001', false)$$), 'REFUND_PENDING_AT_MIDTRANS',
  'a transfer against a QRIS refund still requested at Midtrans is refused');
select internal.mark_refund_request((pg_temp.request_of((select id from qris_pending))).id, 'failed', '412', 'midtrans_refused');
select is(internal.record_refund_core((select id from qris_pending), null,
  (pg_temp.request_of((select id from qris_pending))).amount, 'transfer-m1b', 'Transfer bank uji M-1',
  'bookings/' || (select id from qris_pending) || '/refund-' || md5('m1b')::uuid || '.pdf',
  '00000000-0000-4000-8000-00000000f001', false) ->> 'result', 'recorded',
  'once Midtrans refused it, the transfer books the request');
select is((select status::text from public.refund_requests where booking_id = (select id from qris_pending)),
  'recorded', 'the request is recorded');
select is((select status::text from public.bookings where id = (select id from qris_pending)), 'cancelled',
  'and the booking stays cancelled');

-- L-2: close_past_bookings leaves a booking whose weather window is still unanswered to the weather sweep.
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000e3040', 5, public.today_jkt() + 4, '13:00', '15:00', 'Uji tepi tutup', 200);
create temporary table closed_late on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3040', 2,
                    '+6281300004017', false) as id;
select pg_temp.declare('00000000-0000-4000-8000-0000000e3040');
select set_config('app.in_rpc', '1', true);
update public.bookings set visit_date = public.today_jkt() - 1, visit_date_end = public.today_jkt() - 1
where id = (select id from closed_late);
select set_config('app.in_rpc', '', true);
select internal.close_past_bookings();
select is((select status::text from public.bookings where id = (select id from closed_late)), 'paid',
  'a paid booking whose visit day passed with its window unanswered is not closed as no_show (L-5): the sweep goes first');
create temporary table closed_link on commit drop as
select id from public.weather_notice_bookings where booking_id = (select id from closed_late);
grant select on closed_link to authenticated;
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.resolve_weather_link((select id from closed_link), 'no_refund',
  'Diputuskan superadmin')$$), 'STATE_INVALID', 'a window still open is not the superadmin''s to close (L-a)');
reset role;
select set_config('app.in_rpc', '1', true);
update public.weather_notice_bookings set open_until = now() - interval '1 second' where id = (select id from closed_link);
select set_config('app.in_rpc', '', true);
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.resolve_weather_link((select id from closed_link), 'no_refund',
  'Diputuskan superadmin')$$), 'STATE_INVALID', 'nor a closed window the sweep did not hold (F-5)');
reset role;
select set_config('app.in_rpc', '1', true);
update public.weather_notice_bookings set held_at = now(), held_reason = 'fee_unset' where id = (select id from closed_link);
select set_config('app.in_rpc', '', true);
select pg_temp.act_as('superadmin_stale_totp');
select is(pg_temp.hint_of($$select public.resolve_weather_link((select id from closed_link), 'no_refund',
  'Diputuskan superadmin')$$), 'FRESH_TOTP', 'a held link is resolved only with a fresh code');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is(public.resolve_weather_link((select id from closed_link), 'no_refund', 'Diputuskan superadmin')
            ->> 'resolution', 'no_refund', 'a superadmin with a fresh code resolves the held link');
reset role;
select internal.close_past_bookings();
select is((select status::text from public.bookings where id = (select id from closed_late)), 'no_show',
  'after which close_past_bookings closes the booking');

-- P-4: a checked_in booking whose review clears gets the rights of its leg still to visit.
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000e3215', 13, public.today_jkt() + 5, '13:00', '15:00', 'Uji tepi tinjau 13', 40);
create temporary table reviewed on commit drop as
select (internal.create_booking('00000000-0000-4000-8000-0000000e1003',
  array['00000000-0000-4000-8000-0000000e3205', '00000000-0000-4000-8000-0000000e3215']::uuid[], 2,
  jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Uji Tinjau', 'pic_name', 'Bu Tinjau',
                     'pic_phone', '+6281300004018', 'pic_email', 'tinjau@contoh.test', 'notes', null),
  '[]', '[]', 'pay', 'web', null, pg_temp.otp('+6281300004018'), '{"version": "2026-10-18"}', null,
  '{"ip": null, "user_agent": "pgTAP"}',
  internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000e1003', 2, '[]',
                                                     array[5, 13]::smallint[]))) ->> 'booking_id')::uuid as id;
select pg_temp.event(pg_temp.attempt((select id from reviewed)), 'settlement',
                     (select total_amount from public.bookings where id = (select id from reviewed)), null);
select set_config('app.in_rpc', '1', true);
update public.booking_legs set status = 'checked_in', checked_in_at = now()
where booking_id = (select id from reviewed) and rw_id = 5;
update public.bookings set status = 'checked_in', needs_review = true where id = (select id from reviewed);
select set_config('app.in_rpc', '', true);
select pg_temp.declare('00000000-0000-4000-8000-0000000e3215', 'admin_rw_13');
select is((select count(*)::int from public.weather_notice_bookings where booking_id = (select id from reviewed)), 0,
  'a booking under review gets no rights when the notice comes');
select set_config('app.in_rpc', '1', true);
update public.bookings set needs_review = false where id = (select id from reviewed);
select set_config('app.in_rpc', '', true);
select is((select count(*)::int from public.weather_notice_bookings w join public.booking_legs l on l.id = w.booking_leg_id
           where w.booking_id = (select id from reviewed) and l.rw_id = 13), 1,
  'once its review clears, its leg still to visit gets them (P-4)');

-- ===== The delta review of PR #69 =====

-- D-1: while a QRIS request is open at Midtrans, a manual refund of any amount is refused when proposed.
create temporary table qris_open on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3020', 3,
                    '+6281300004019', false) as id;
select internal.cancel_booking((select id from qris_open), null, 'Batal', 'cancellation',
  (internal.refund_preview((select id from qris_open), 'cancellation') ->> 'amount')::bigint, 90::smallint);
select is(pg_temp.hint_of($$select internal.check_adjustment_terms('manual_refund', (select id from qris_open),
  (select p.id from public.payments p where p.booking_id = (select id from qris_open) and p.status = 'settled'),
  90000, '{}')$$), 'REFUND_PENDING_AT_MIDTRANS',
  'a manual refund of the whole payment is refused while the QRIS request is open');
select internal.mark_refund_request((pg_temp.request_of((select id from qris_open))).id, 'failed', '412', 'refused');
select is(pg_temp.hint_of($$select internal.check_adjustment_terms('manual_refund', (select id from qris_open),
  (select p.id from public.payments p where p.booking_id = (select id from qris_open) and p.status = 'settled'),
  1000, '{}')$$), 'REFUND_REQUEST_MISMATCH', 'a failed request is finished only by a refund of exactly its amount');
select lives_ok($$select internal.check_adjustment_terms('manual_refund', (select id from qris_open),
  (select p.id from public.payments p where p.booking_id = (select id from qris_open) and p.status = 'settled'),
  (pg_temp.request_of((select id from qris_open))).amount, '{}')$$, 'its exact amount is accepted');

-- D-1, L-3: the payment's refunded amount is what was refunded, after an earlier refund of another amount that
-- Midtrans reported and record_refund booked under its word.
insert into public.payment_events (payment_id, order_id, source, event_hash, transaction_status, status_code,
  gross_amount_raw, payload, processed_at)
select p.id, p.order_id, 'status_api', md5('d1-earlier' || p.order_id), 'partial_refund', '200',
       p.gross_amount || '.00', jsonb_build_object('order_id', p.order_id, 'refund_amount', '1000.00', 'currency', 'IDR'),
       now()
from public.payments p where p.booking_id = (select id from qris_open) and p.status = 'settled';
insert into storage.objects (bucket_id, name)
values ('documents', 'bookings/' || (select id from qris_open) || '/refund-' || md5('d1-earlier')::uuid || '.pdf');
select is(internal.record_refund_core((select id from qris_open), null, 1000, 'midtrans-d1-earlier',
  'Pengembalian sebagian dari dasbor Midtrans',
  'bookings/' || (select id from qris_open) || '/refund-' || md5('d1-earlier')::uuid || '.pdf',
  '00000000-0000-4000-8000-00000000f001', true) ->> 'result', 'recorded',
  'a refund of another amount that Midtrans reports is booked under its word');
select is(pg_temp.event(pg_temp.order_of((select id from qris_open)), 'partial_refund', 90000,
                        1000 + (pg_temp.request_of((select id from qris_open))).amount) ->> 'processing_result',
  'refund_recorded', 'Midtrans'' refund of the request is booked after it');
select is((select refunded_amount from public.payments where booking_id = (select id from qris_open)
           and status = 'partially_refunded'), 1000 + (pg_temp.request_of((select id from qris_open))).amount,
  'and the payment shows both refunds');

-- D-2, re-review M-2 and M-3: a submitted request Midtrans never paid out is failed only on the server's own look,
-- taken at least 24 h after the submission, whose answer lists no refund under its key and no more refunded than
-- was recorded; by payments-poll on its own, or by a superadmin with a fresh code.
create function pg_temp.stuck(p_phone text) returns uuid
  language plpgsql
as $fn$
declare
  booking_id uuid := pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3020', 2,
                                  p_phone, false);
begin
  perform internal.cancel_booking(booking_id, null, 'Batal', 'cancellation',
    (internal.refund_preview(booking_id, 'cancellation') ->> 'amount')::bigint, 90::smallint);
  perform internal.mark_refund_request((pg_temp.request_of(booking_id)).id, 'submitted', '200', null);
  return booking_id;
end;
$fn$;
-- An answer the poll stored for the booking's settled payment; p_extra adds refunds[] or a refund_amount.
create function pg_temp.look(p_booking uuid, p_extra jsonb default '{}', p_status text default 'settlement',
  p_code text default '200', p_source text default 'poll') returns bigint
  language sql
as $fn$
  insert into public.payment_events (payment_id, order_id, source, event_hash, transaction_status, status_code, payload)
  select p.id, p.order_id, p_source, md5(p.order_id || p_extra::text || coalesce(p_status, '') || clock_timestamp()::text),
         p_status,
         p_code, jsonb_build_object('order_id', p.order_id, 'transaction_status', p_status, 'status_code', p_code)
                 || p_extra
  from public.payments p where p.booking_id = p_booking and p.status = 'settled'
  returning id;
$fn$;
create function pg_temp.a_day_ago(p_booking uuid) returns void
  language sql
as $fn$ update public.refund_requests set submitted_at = now() - interval '25 hours' where booking_id = p_booking; $fn$;

-- M-3: Midtrans gives the same answer before and after the submission, which the poll stores once, as one event.
create temporary table qris_stuck on commit drop as select pg_temp.stuck('+6281300004020') as id;
create temporary table early_answer on commit drop as select pg_temp.look((select id from qris_stuck)) as id;
select is(internal.fail_unconfirmed_refund_by_poll((pg_temp.request_of((select id from qris_stuck))).id,
                                                   (select id from early_answer)), false,
  'a request submitted just now is not failed');
select is((pg_temp.request_of((select id from qris_stuck))).last_checked_event_id, (select id from early_answer),
  'though the look is stored with it');
select pg_temp.a_day_ago((select id from qris_stuck));
select is(internal.fail_unconfirmed_refund_by_poll((pg_temp.request_of((select id from qris_stuck))).id,
                                                   (select id from early_answer)), true,
  'a day after the submission the same answer, stored before it, fails it: the look counts from when it was asked');
select is((select severity::text from public.security_alerts
           where fingerprint = 'refund_failed:' || (pg_temp.request_of((select id from qris_stuck))).refund_key),
  'high', 'and raises refund_failed for the transfer');

-- M-2: an answer that shows the refund in any way fails nothing, nor does a look of more than five minutes ago.
create temporary table qris_seen on commit drop as select pg_temp.stuck('+6281300004024') as id;
select pg_temp.a_day_ago((select id from qris_seen));
select is(internal.fail_unconfirmed_refund_by_poll((pg_temp.request_of((select id from qris_seen))).id,
  pg_temp.look((select id from qris_seen), jsonb_build_object('refunds', jsonb_build_array(jsonb_build_object(
    'refund_key', (pg_temp.request_of((select id from qris_seen))).refund_key, 'refund_amount', '1.00'))))), false,
  'an answer listing its refund_key does not fail it');
select is(internal.fail_unconfirmed_refund_by_poll((pg_temp.request_of((select id from qris_seen))).id,
  pg_temp.look((select id from qris_seen), jsonb_build_object('refund_amount',
    (pg_temp.request_of((select id from qris_seen))).amount || '.00'))), false,
  'an answer stating only a refund_amount counts as one showing the refund');
update public.refund_requests set last_checked_at = now() - interval '10 minutes',
  last_checked_event_id = pg_temp.look((select id from qris_seen))
where booking_id = (select id from qris_seen);
select is(internal.fail_unconfirmed_refund((pg_temp.request_of((select id from qris_seen))).id, null, 'uji'), false,
  'nor does a clean answer looked up more than five minutes ago');
select is((pg_temp.request_of((select id from qris_seen))).status::text, 'submitted', 'the request stays submitted');
-- L-d: only a successful answer about a settled transaction, and none while Midtrans reported more than was recorded.
select is(internal.fail_unconfirmed_refund_by_poll((pg_temp.request_of((select id from qris_seen))).id,
  pg_temp.look((select id from qris_seen), '{}', 'settlement', '404')), false,
  'an answer that is not a 200 fails nothing');
select is(internal.fail_unconfirmed_refund_by_poll((pg_temp.request_of((select id from qris_seen))).id,
  pg_temp.look((select id from qris_seen), '{}', 'pending')), false,
  'nor does one about a transaction that is not settled or refunded');
select pg_temp.look((select id from qris_seen), jsonb_build_object('refund_amount', '5000.00'), 'partial_refund', '200',
                    'status_api');
select is(internal.fail_unconfirmed_refund_by_poll((pg_temp.request_of((select id from qris_seen))).id,
  pg_temp.look((select id from qris_seen))), false,
  'nor a clean answer while an earlier one reported a refund nobody recorded');

-- N-1: the monthly prune removes a look older than 24 months; the request keeps no dangling event.
insert into public.payment_events (payment_id, order_id, source, event_hash, transaction_status, status_code, payload,
  received_at)
select p.id, p.order_id, 'poll', md5('aged-look' || p.order_id), 'settlement', '200',
       jsonb_build_object('order_id', p.order_id, 'transaction_status', 'settlement'), now() - interval '25 months'
from public.payments p where p.booking_id = (select id from qris_seen) and p.status = 'settled';
update public.refund_requests
set last_checked_event_id = (select e.id from public.payment_events e
                             join public.payments p on p.order_id = e.order_id
                             where p.booking_id = (select id from qris_seen) and e.event_hash = md5('aged-look' || p.order_id))
where booking_id = (select id from qris_seen);
select lives_ok($$select internal.prune_operational_tables()$$,
  'the monthly prune runs with an aged event a refund request still names');
select set_config('app.purge', '', true), set_config('app.audit_mode', '', true), set_config('app.in_rpc', '', true),
  set_config('app.actor_role', '', true);
select is((pg_temp.request_of((select id from qris_seen))).last_checked_event_id, null,
  'and the request''s look is cleared with it');

-- L-e: a request Midtrans takes again counts its 24 h from then.
select internal.mark_refund_request((pg_temp.request_of((select id from qris_stuck))).id, 'submitted', '200', null);
select is((pg_temp.request_of((select id from qris_stuck))).submitted_at, now(),
  'a failed request submitted again is stamped again');
select is(internal.fail_unconfirmed_refund_by_poll((pg_temp.request_of((select id from qris_stuck))).id,
  pg_temp.look((select id from qris_stuck))), false, 'so it is not failed on the old submission''s day');

-- The superadmin: the server action's look stored first, then a fresh code (L-2: FRESH_TOTP).
create temporary table qris_stuck_staff on commit drop as select pg_temp.stuck('+6281300004023') as id;
select pg_temp.a_day_ago((select id from qris_stuck_staff));
create temporary table stuck_request on commit drop as
select (pg_temp.request_of((select id from qris_stuck_staff))).id as id;
create temporary table staff_look on commit drop as select pg_temp.look((select id from qris_stuck_staff)) as id;
grant select on stuck_request, staff_look to authenticated;
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.mark_refund_request_failed((select id from stuck_request),
  (select id from staff_look), 'Midtrans tidak membayar')$$), 'STATE_INVALID',
  'nothing is marked on an answer the server did not just look up');
reset role;
select ok(internal.record_refund_look((select id from stuck_request), (select id from staff_look)),
  'the server action stores its look');
select pg_temp.act_as('superadmin_stale_totp');
select is(pg_temp.hint_of($$select public.mark_refund_request_failed((select id from stuck_request),
  (select id from staff_look), 'Midtrans tidak membayar')$$), 'FRESH_TOTP',
  'a superadmin without a fresh code cannot mark it');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is(public.mark_refund_request_failed((select id from stuck_request), (select id from staff_look),
  'Midtrans tidak membayar') ->> 'result', 'failed', 'a superadmin with a fresh code marks it failed');
reset role;
select is((select status::text from public.refund_requests where id = (select id from stuck_request)), 'failed',
  'which opens the transfer path');

-- M-2: a bank transfer approved against a refused request is not applied once Midtrans refunded the request after all.
create temporary table overtaken on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3020', 2,
                    '+6281300004025', false) as id;
select internal.cancel_booking((select id from overtaken), null, 'Batal', 'cancellation',
  (internal.refund_preview((select id from overtaken), 'cancellation') ->> 'amount')::bigint, 90::smallint);
select internal.mark_refund_request((pg_temp.request_of((select id from overtaken))).id, 'failed', '412', 'refused');
insert into storage.objects (bucket_id, name)
values ('documents', 'bookings/' || (select id from overtaken) || '/adjustment-' || md5('overtaken')::uuid || '.pdf');
-- The superadmin persona old enough, with a factor, to approve their own adjustment after the 24 h wait.
update public.profiles set created_at = now() - interval '40 days' where id = '00000000-0000-4000-8000-00000000f001';
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-4000-8000-00000000f001', 'uji-tepi', 'totp', 'verified',
        now() - interval '39 days', now());
create temporary table overtaking_transfer on commit drop as select gen_random_uuid() as id;
select set_config('app.in_rpc', '1', true);
insert into public.payment_adjustments (id, booking_id, payment_id, type, amount, reason, evidence_path, proposed_by)
select (select id from overtaking_transfer), b.id, p.id, 'manual_refund', (pg_temp.request_of(b.id)).amount,
       'Transfer bank uji M-2', 'bookings/' || b.id || '/adjustment-' || md5('overtaken')::uuid || '.pdf',
       '00000000-0000-4000-8000-00000000f001'
from public.bookings b join public.payments p on p.booking_id = b.id and p.status = 'settled'
where b.id = (select id from overtaken);
update public.payment_adjustments
set status = 'approved', approved_by = '00000000-0000-4000-8000-00000000f001', approved_at = now() - interval '25 hours',
    apply_not_before = now() - interval '1 hour'
where id = (select id from overtaking_transfer);
select set_config('app.in_rpc', '', true);
grant select on overtaking_transfer to authenticated;
select is(pg_temp.event(pg_temp.order_of((select id from overtaken)), 'partial_refund', 60000,
                        (pg_temp.request_of((select id from overtaken))).amount) ->> 'processing_result',
  'refund_recorded', 'Midtrans carries the refused refund out after all');
select pg_temp.act_as('superadmin_aal2');
select is(public.apply_adjustment((select id from overtaking_transfer)) ->> 'status', 'rejected',
  'the approved transfer is then rejected, not applied');
reset role;
select is((select severity::text from public.security_alerts
           where fingerprint = 'refund_paid_twice_detected:' || (select id from overtaking_transfer)),
  'high', 'with a high alert');
select is((select refunded_amount from public.payments where booking_id = (select id from overtaken)
           and status in ('partially_refunded', 'refunded')), (pg_temp.request_of((select id from overtaken))).amount,
  'and the visitor is refunded once');

-- D-4: Midtrans' refund API is called again at most once per ten minutes.
create temporary table claimed on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3020', 2,
                    '+6281300004026', false) as id;
select internal.cancel_booking((select id from claimed), null, 'Batal', 'cancellation',
  (internal.refund_preview((select id from claimed), 'cancellation') ->> 'amount')::bigint, 90::smallint);
select is(internal.claim_refund_retry((pg_temp.request_of((select id from claimed))).id), false,
  'a request just written is not claimed');
update public.refund_requests set last_attempt_at = now() - interval '11 minutes'
where booking_id = (select id from claimed);
select is(internal.claim_refund_retry((pg_temp.request_of((select id from claimed))).id), true,
  'ten minutes after its last call it is claimed');
select is(internal.claim_refund_retry((pg_temp.request_of((select id from claimed))).id), false,
  'once');

-- D-3, M-4: a leg's refund gives back exactly its share, from the stopped RW's treasury first, then the kelurahan,
-- then the package's vendor lines; on an asymmetric rule with an odd amount and on a vendor line.
insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000e1005', 'combo', 'uji-tepi-kombo-ganjil', 'Kombo Uji Ganjil', 'per_pax', 246900,
   'draft'),
  ('00000000-0000-4000-8000-0000000e1006', 'combo', 'uji-tepi-kombo-vendor', 'Kombo Uji Vendor', 'per_pax', 30000,
   'draft'),
  ('00000000-0000-4000-8000-0000000e1007', 'combo', 'uji-tepi-kombo-sempit', 'Kombo Uji Sempit', 'per_pax', 30000,
   'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000e1005', 5, 1), ('00000000-0000-4000-8000-0000000e1005', 13, 2),
  ('00000000-0000-4000-8000-0000000e1006', 5, 1), ('00000000-0000-4000-8000-0000000e1006', 13, 2),
  ('00000000-0000-4000-8000-0000000e1007', 5, 1), ('00000000-0000-4000-8000-0000000e1007', 13, 2);
update public.tour_packages set status = 'published'
where id in ('00000000-0000-4000-8000-0000000e1005', '00000000-0000-4000-8000-0000000e1006',
             '00000000-0000-4000-8000-0000000e1007');
create function pg_temp.rule(p_package uuid, p_lines jsonb) returns void
  language sql
as $fn$
  with rule as (
    insert into public.revenue_share_rules (scope, package_id, name, effective_from)
    values ('package', p_package, 'Aturan uji kombo', public.today_jkt() - 1)
    returning id)
  insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, vendor_id, pct)
  select rule.id, (line ->> 'beneficiary')::public.revenue_beneficiary, (line ->> 'rw_id')::smallint,
         (line ->> 'vendor_id')::uuid, (line ->> 'pct')::numeric
  from rule, jsonb_array_elements(p_lines) as line;
$fn$;
select pg_temp.rule('00000000-0000-4000-8000-0000000e1005', '[{"beneficiary": "kelurahan", "pct": 30},
  {"beneficiary": "rw_treasury", "rw_id": 5, "pct": 40}, {"beneficiary": "rw_treasury", "rw_id": 13, "pct": 30}]');
select pg_temp.rule('00000000-0000-4000-8000-0000000e1006', '[{"beneficiary": "kelurahan", "pct": 20},
  {"beneficiary": "rw_treasury", "rw_id": 5, "pct": 35}, {"beneficiary": "rw_treasury", "rw_id": 13, "pct": 35},
  {"beneficiary": "umkm_vendor", "vendor_id": "00000000-0000-4000-8000-0000000e1051", "pct": 10}]');
select pg_temp.rule('00000000-0000-4000-8000-0000000e1007', '[{"beneficiary": "kelurahan", "pct": 5},
  {"beneficiary": "rw_treasury", "rw_id": 5, "pct": 80}, {"beneficiary": "rw_treasury", "rw_id": 13, "pct": 15}]');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000e3206', 5, public.today_jkt() + 2, '18:00', '19:30', 'Uji tepi ganjil 05', 40),
  ('00000000-0000-4000-8000-0000000e3216', 13, public.today_jkt() + 5, '15:00', '16:00', 'Uji tepi ganjil 13', 40),
  ('00000000-0000-4000-8000-0000000e3217', 13, public.today_jkt() + 5, '16:30', '17:30', 'Uji tepi vendor 13', 40),
  ('00000000-0000-4000-8000-0000000e3218', 13, public.today_jkt() + 5, '18:00', '19:00', 'Uji tepi sempit 13', 40);

-- A combo paid, its RW 05 leg visited, its RW 13 session stopped by the weather.
create function pg_temp.visited_combo_open(p_package uuid, p_session_13 uuid, p_pax integer, p_phone text) returns uuid
  language plpgsql
as $$
declare
  new_booking uuid := (internal.create_booking(p_package,
    array['00000000-0000-4000-8000-0000000e3206', p_session_13]::uuid[], p_pax,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Uji Asimetris', 'pic_name', 'Bu Asimetris',
                       'pic_phone', p_phone, 'pic_email', 'asimetris@contoh.test', 'notes', null),
    '[]', '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote(p_package, p_pax, '[]', array[5, 13]::smallint[])))
    ->> 'booking_id')::uuid;
begin
  perform pg_temp.event(pg_temp.attempt(new_booking), 'settlement',
                        (select b.total_amount from public.bookings b where b.id = new_booking), null);
  perform set_config('app.in_rpc', '1', true);
  update public.booking_legs set status = 'checked_in', checked_in_at = now()
  where booking_legs.booking_id = new_booking and rw_id = 5;
  update public.bookings set status = 'checked_in' where id = new_booking;
  perform set_config('app.in_rpc', '', true);
  perform pg_temp.declare(p_session_13, 'admin_rw_13');
  return new_booking;
end;
$$;

-- The same, its stopped leg's weather refund taken and booked when Midtrans reports it.
create function pg_temp.visited_combo(p_package uuid, p_session_13 uuid, p_pax integer, p_phone text) returns uuid
  language plpgsql
as $$
declare
  new_booking uuid := pg_temp.visited_combo_open(p_package, p_session_13, p_pax, p_phone);
begin
  perform internal.cancel_booking(new_booking, null, 'Hujan', 'weather',
    (internal.refund_preview(new_booking, 'weather') ->> 'amount')::bigint, null);
  perform pg_temp.event(pg_temp.order_of(new_booking), 'partial_refund',
    (select b.total_amount from public.bookings b where b.id = new_booking),
    (select r.amount from public.refund_requests r where r.booking_id = new_booking));
  return new_booking;
end;
$$;

-- The per-party balance after the refund, as beneficiary_key=amount.
create function pg_temp.balances(p_booking uuid) returns text[]
  language sql
as $$
  select array_agg(x.label order by x.label) from (
    select s.beneficiary_key || '=' || (s.amount + coalesce((select sum(r.amount) from public.revenue_share_entries r
              where r.booking_id = s.booking_id and r.entry_type = 'reversal' and r.line_ref = s.line_ref
                and r.beneficiary_key = s.beneficiary_key), 0)) as label
    from public.revenue_share_entries s
    where s.booking_id = p_booking and s.entry_type = 'settlement') as x;
$$;

create temporary table odd_combo on commit drop as
select pg_temp.visited_combo('00000000-0000-4000-8000-0000000e1005', '00000000-0000-4000-8000-0000000e3216', 5,
                             '+6281300004021') as id;
select is(pg_temp.balances((select id from odd_combo)), array['kelurahan=123450', 'rw:13=0', 'rw:5=493800'],
  'on a 30/40/30 rule of Rp 1.234.500 the leg''s Rp 617.250 takes RW 13''s whole share, then the kelurahan''s; RW 05 keeps its 40 %');
select is(pg_temp.ledger_sum((select id from odd_combo)), 617250::bigint, 'exactly the package part the leg refunded');
select is((select count(*)::int from public.security_alerts
           where fingerprint like 'refund_ledger_unbalanced:%' and details ->> 'booking_id' = (select id from odd_combo)::text),
  0, 'with no unbalanced ledger');

create temporary table vendor_combo on commit drop as
select pg_temp.visited_combo('00000000-0000-4000-8000-0000000e1006', '00000000-0000-4000-8000-0000000e3217', 4,
                             '+6281300004022') as id;
select is(pg_temp.ledger_sum((select id from vendor_combo)), 60000::bigint,
  'with a vendor line the leg''s Rp 60.000 still comes back exactly');
select is(pg_temp.balances((select id from vendor_combo)),
  array['kelurahan=6000', 'rw:13=0', 'rw:5=42000', 'vendor:00000000-0000-4000-8000-0000000e1051=12000'],
  'RW 13''s Rp 42.000 and Rp 18.000 of the kelurahan''s; the vendor, needed for nothing, and the visited RW 05 keep theirs');

-- L-1: a leg's refund the stopped RW's treasury, the kelurahan and the vendors cannot fund is the superadmin's.
create temporary table short_combo on commit drop as
select pg_temp.visited_combo_open('00000000-0000-4000-8000-0000000e1007', '00000000-0000-4000-8000-0000000e3218', 2,
                                  '+6281300004027') as id;
select is(pg_temp.hint_of($$select internal.refund_preview((select id from short_combo), 'weather')$$),
  'CANCEL_NEEDS_SUPERADMIN', 'a leg whose refund only the visited RW''s treasury could fund is refused before any money moves');

-- L-f: a Rp 100.000 combo on a 10/45/10/23/12 rule (kelurahan, RW 05, RW 13, two vendors). The leg's Rp 50.000 takes
-- RW 13's Rp 10.000 and the kelurahan's Rp 10.000; the Rp 30.000 left splits 23.000 : 12.000 over the vendors,
-- 19.714,28 and 10.285,71, the rupiah left to the larger remainder: Rp 19.714 and Rp 10.286.
insert into public.umkm_vendors (id, rw_id, slug, name) values
  ('00000000-0000-4000-8000-0000000e1052', 13, 'uji-tepi-vendor-dua', 'Vendor Uji Tepi Dua');
insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000e1008', 'combo', 'uji-tepi-kombo-dua-vendor', 'Kombo Uji Dua Vendor', 'per_pax',
   25000, 'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000e1008', 5, 1), ('00000000-0000-4000-8000-0000000e1008', 13, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000e1008';
select pg_temp.rule('00000000-0000-4000-8000-0000000e1008', '[{"beneficiary": "kelurahan", "pct": 10},
  {"beneficiary": "rw_treasury", "rw_id": 5, "pct": 45}, {"beneficiary": "rw_treasury", "rw_id": 13, "pct": 10},
  {"beneficiary": "umkm_vendor", "vendor_id": "00000000-0000-4000-8000-0000000e1051", "pct": 23},
  {"beneficiary": "umkm_vendor", "vendor_id": "00000000-0000-4000-8000-0000000e1052", "pct": 12}]');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000e3219', 13, public.today_jkt() + 5, '19:00', '20:00', 'Uji tepi dua vendor 13', 40);
create temporary table two_vendors on commit drop as
select pg_temp.visited_combo('00000000-0000-4000-8000-0000000e1008', '00000000-0000-4000-8000-0000000e3219', 4,
                             '+6281300004028') as id;
select is(pg_temp.balances((select id from two_vendors)),
  array['kelurahan=0', 'rw:13=0', 'rw:5=45000', 'vendor:00000000-0000-4000-8000-0000000e1051=3286',
        'vendor:00000000-0000-4000-8000-0000000e1052=1714'],
  'RW 13 and the kelurahan give all they hold; the vendors give Rp 19.714 and Rp 10.286; RW 05 keeps its share');
select is(pg_temp.ledger_sum((select id from two_vendors)), 50000::bigint, 'exactly the leg''s Rp 50.000');

-- ===== Follow-ups of the delta3 review of PR #69 and the review of PR #90 (20261104181000) =====

-- An approved manual_refund of the superadmin persona (old enough, with a factor, since the M-2 case above), its
-- evidence in the bucket, past its 24 h wait.
create function pg_temp.approved_refund(p_booking uuid, p_amount bigint, p_name text, p_details jsonb default '{}')
  returns uuid
  language plpgsql
as $fn$
declare
  adjustment_id uuid := gen_random_uuid();
  evidence text := 'bookings/' || p_booking || '/adjustment-' || md5(p_name)::uuid || '.pdf';
begin
  insert into storage.objects (bucket_id, name) values ('documents', evidence);
  perform set_config('app.in_rpc', '1', true);
  insert into public.payment_adjustments (id, booking_id, payment_id, type, amount, reason, evidence_path, proposed_by,
    details)
  select adjustment_id, p_booking, p.id, 'manual_refund', p_amount, 'Transfer bank uji tindak lanjut', evidence,
         '00000000-0000-4000-8000-00000000f001', p_details
  from public.payments p
  where p.booking_id = p_booking and p.status in ('settled', 'partially_refunded')
  order by p.attempt_no desc limit 1;
  update public.payment_adjustments
  set status = 'approved', approved_by = '00000000-0000-4000-8000-00000000f001',
      approved_at = now() - interval '25 hours', apply_not_before = now() - interval '1 hour'
  where id = adjustment_id;
  perform set_config('app.in_rpc', '', true);
  return adjustment_id;
end;
$fn$;

-- F-1: a refused QRIS request R, a Rp 5.000 transfer approved against it, R refunded by Midtrans after all, and
-- Midtrans' answer listing the adjustment's own key, beside R's when p_both.
create function pg_temp.refund_under_own_key(p_phone text, p_both boolean) returns uuid
  language plpgsql
as $fn$
declare
  booking_id uuid := pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3020', 2,
                                  p_phone, false);
  adjustment_id uuid;
  request public.refund_requests;
begin
  perform internal.cancel_booking(booking_id, null, 'Batal', 'cancellation',
    (internal.refund_preview(booking_id, 'cancellation') ->> 'amount')::bigint, 90::smallint);
  perform internal.mark_refund_request((pg_temp.request_of(booking_id)).id, 'failed', '412', 'refused');
  adjustment_id := pg_temp.approved_refund(booking_id, 5000, 'own-key' || p_phone);
  request := pg_temp.request_of(booking_id);
  perform pg_temp.event(pg_temp.order_of(booking_id), 'partial_refund', 60000, request.amount);
  insert into public.payment_events (payment_id, order_id, source, event_hash, transaction_status, status_code, payload)
  select p.id, p.order_id, 'status_api', md5('own-key' || p_phone), 'partial_refund', '200',
         jsonb_build_object('order_id', p.order_id, 'refunds',
           case when p_both
                then jsonb_build_array(jsonb_build_object('refund_key', request.refund_key,
                                                          'refund_amount', request.amount || '.00'),
                                       jsonb_build_object('refund_key', adjustment_id::text, 'refund_amount', '5000.00'))
                else jsonb_build_array(jsonb_build_object('refund_key', adjustment_id::text, 'refund_amount', '5000.00'))
           end)
  from public.payments p where p.id = request.payment_id;
  return adjustment_id;
end;
$fn$;
create temporary table own_key_once on commit drop as select pg_temp.refund_under_own_key('+6281300004030', false) as id;
create temporary table own_key_both on commit drop as select pg_temp.refund_under_own_key('+6281300004031', true) as id;
grant select on own_key_once, own_key_both to authenticated;
select pg_temp.act_as('superadmin_aal2');
select is(public.apply_adjustment((select id from own_key_once)) ->> 'status', 'rejected',
  'F-1: a refund under the adjustment''s key that Midtrans does not report beside R is R itself, already recorded');
select is(public.apply_adjustment((select id from own_key_both)) ->> 'status', 'applied',
  'one Midtrans reports beside R is applied');
reset role;
select is((select count(*)::int from public.security_alerts
           where fingerprint = 'refund_paid_twice_detected:' || (select id from own_key_once)), 0,
  'the first raises no alert');
select is((select count(*)::int from public.audit_logs
           where action = 'adjustment.rejected' and entity_id = (select id from own_key_once)::text
             and metadata ->> 'reason' = 'already_recorded'), 1, 'and is audited as already recorded');
select is((select severity::text from public.security_alerts
           where fingerprint = 'refund_paid_twice_detected:' || (select id from own_key_both)), 'high',
  'the second still raises refund_paid_twice_detected');

-- ===== The weather refund by hand through the finance RPCs (delta review of PR #90, H-A) =====

-- A second superadmin, old enough and with a factor, approves what the persona superadmin proposes (dual control).
insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000f002', 'rls-super-b@example.test');
insert into public.profiles (id, email, full_name, role, rw_id) values
  ('00000000-0000-4000-8000-00000000f002', 'rls-super-b@example.test', 'Super B', 'superadmin', null);
update public.profiles set created_at = now() - interval '40 days' where id = '00000000-0000-4000-8000-00000000f002';
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-4000-8000-00000000f002', 'uji-b', 'totp', 'verified',
        now() - interval '39 days', now());
create function pg_temp.act_as_super_b() returns void
  language plpgsql
as $fn$
declare
  user_id uuid := '00000000-0000-4000-8000-00000000f002';
  verified_at bigint := extract(epoch from now())::bigint - 60;
begin
  perform set_config('request.jwt.claims', (jsonb_build_object(
      'iss', 'supabase', 'aud', 'authenticated', 'sub', user_id, 'role', 'authenticated',
      'email', 'rls-super-b@example.test', 'session_id', gen_random_uuid(), 'is_anonymous', false, 'aal', 'aal2',
      'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', verified_at),
                               jsonb_build_object('method', 'password', 'timestamp', verified_at - 60)))
    || internal.staff_token_claims(user_id))::text, true);
  perform set_config('role', 'authenticated', true);
end;
$fn$;
-- propose_adjustment as the superadmin persona, naming p_link (in capitals, as a form might send it) when given.
create function pg_temp.propose_refund(p_booking uuid, p_amount bigint, p_name text, p_link uuid default null)
  returns uuid
  language plpgsql
as $fn$
declare
  evidence text := 'bookings/' || p_booking || '/adjustment-' || md5(p_name)::uuid || '.pdf';
  payment_id uuid := (select p.id from public.payments p
                      where p.booking_id = p_booking and p.status in ('settled', 'partially_refunded')
                      order by p.attempt_no desc limit 1);
  reply jsonb;
begin
  insert into storage.objects (bucket_id, name) values ('documents', evidence) on conflict do nothing;
  perform pg_temp.act_as('superadmin_aal2');
  reply := public.propose_adjustment('manual_refund', p_booking, payment_id, p_amount, 'Transfer bank uji tindak lanjut',
    evidence, case when p_link is null then '{}'::jsonb else jsonb_build_object('weather_link_id', upper(p_link::text)) end);
  reset role;
  return (reply ->> 'id')::uuid;
end;
$fn$;
-- approve_adjustment by the second superadmin, then apply_adjustment by the persona.
create function pg_temp.approve_and_apply(p_adjustment uuid) returns text
  language plpgsql
as $fn$
declare
  reply jsonb;
begin
  perform pg_temp.act_as_super_b();
  perform public.approve_adjustment(p_adjustment);
  reset role;
  perform pg_temp.act_as('superadmin_aal2');
  reply := public.apply_adjustment(p_adjustment);
  reset role;
  return reply ->> 'status';
end;
$fn$;

-- M-A: a paid booking held for its unset Virtual Account fee is refunded by the sweep once the fee is set; a transfer
-- by hand is refused when it is proposed, or the visitor would be paid twice.
create temporary table va_link on commit drop as
select id from public.weather_notice_bookings where booking_id = (select id from lapsed_va);
select is((select held_reason from public.weather_notice_bookings where id = (select id from va_link)), 'fee_unset',
  'F-3: the sweep marked the link it held');
select ok((select title like '%pengembalian dana cuaca berjalan otomatis. Jangan transfer manual.'
           from public.security_alerts where fingerprint = 'weather_link_held:' || (select id from va_link)),
  'its alert says to set the fee and not to transfer by hand');
select is(pg_temp.hint_of($$select pg_temp.propose_refund((select id from lapsed_va), 146000, 'va-named',
  (select id from va_link))$$), 'WEATHER_FEE_UNSET_MANUAL',
  'H-A, M-A: proposing a refund by hand for a link held for its fee is refused, with its own hint');
update public.site_settings set value = '4000' where key = 'midtrans.fee_va_idr';
select internal.settle_lapsed_weather_links(50);
select is((select b.status::text || ':' || w.resolution || ':' || r.kind || ':' || r.status || ':' || r.amount || ':'
                  || r.fee_amount
           from public.bookings b join public.weather_notice_bookings w on w.booking_id = b.id
           join public.refund_requests r on r.booking_id = b.id where b.id = (select id from lapsed_va)),
  'cancelled:auto_refunded:weather:requested:146000:4000',
  'once the fee is set, the sweep cancels it and requests the weather refund itself');
select is((select count(*)::int from public.security_alerts
           where fingerprint = 'weather_link_held:' || (select id from va_link) and acknowledged_at is null), 0,
  'L-3: and closes the held link''s alert');

-- A paid booking and a visited combo held for the unset QRIS fee.
update public.site_settings set value = 'null' where key = 'midtrans.fee_qris_permille';
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000e3041', 5, public.today_jkt() + 6, '13:00', '15:00', 'Uji tepi biasa', 200),
  ('00000000-0000-4000-8000-0000000e3042', 5, public.today_jkt() + 7, '13:00', '15:00', 'Uji tepi susulan', 200),
  ('00000000-0000-4000-8000-0000000e3043', 5, public.today_jkt() + 7, '15:30', '17:00', 'Uji tepi susulan VA', 200),
  ('00000000-0000-4000-8000-0000000e3220', 13, public.today_jkt() + 5, '20:00', '21:00', 'Uji tepi manual 13', 40);
create temporary table held_plain on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3041', 2,
                    '+6281300004034', false) as id;
select pg_temp.declare('00000000-0000-4000-8000-0000000e3041');
create temporary table manual_leg on commit drop as
select pg_temp.visited_combo_open('00000000-0000-4000-8000-0000000e1005', '00000000-0000-4000-8000-0000000e3220', 2,
                                  '+6281300004032') as id;
create temporary table manual_leg_link on commit drop as
select id from public.weather_notice_bookings where booking_id = (select id from manual_leg);
select internal.flag_cancellation_for_superadmin((select id from manual_leg));
update public.security_alerts set acknowledged_at = now()
where fingerprint = 'cancellation_needs_superadmin:' || (select id from manual_leg);
select set_config('app.in_rpc', '1', true);
update public.weather_notice_bookings set open_until = now() - interval '1 second'
where booking_id in ((select id from held_plain), (select id from manual_leg));
select set_config('app.in_rpc', '', true);
select internal.settle_lapsed_weather_links(50);
select internal.settle_lapsed_weather_links(50);
select is((select count(*)::int from public.security_alerts
           where fingerprint = 'weather_link_held:' || (select id from manual_leg_link) and severity = 'high'), 1,
  'F-3: a hold asks the superadmin once with its own alert, though the hub''s alert was acknowledged');
select is(pg_temp.hint_of($$select pg_temp.propose_refund((select id from manual_leg), 243443, 'leg-named',
  (select id from manual_leg_link))$$), 'WEATHER_FEE_UNSET_MANUAL',
  'nor is a visited combo''s leg held for its fee refunded by hand');

-- L-3: the backfill marks the holds the sweep made before 20261104181000 from what holds them now.
create temporary table old_hold on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3042', 2,
                    '+6281300004035', false) as id;
select set_config('test.payment_type', 'bank_transfer', true);
create temporary table old_hold_va on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e3043', 2,
                    '+6281300004036', false) as id;
select set_config('test.payment_type', '', true);
select pg_temp.declare('00000000-0000-4000-8000-0000000e3042');
select pg_temp.declare('00000000-0000-4000-8000-0000000e3043');
select set_config('app.in_rpc', '1', true);
update public.weather_notice_bookings set open_until = now() - interval '1 second'
where booking_id in ((select id from old_hold), (select id from old_hold_va));
select set_config('app.in_rpc', '', true);
insert into public.security_alerts (rule, severity, fingerprint, title, first_seen_at)
select 'weather_refund_fee_unset', 'high', 'weather_refund_fee_unset:' || b.id, 'Uji peringatan lama',
       now() - interval '2 days'
from public.bookings b where b.id in ((select id from old_hold), (select id from old_hold_va));
select internal.backfill_weather_holds();
select is((select w.held_reason || ':' || (w.held_at = now() - interval '2 days')
           from public.weather_notice_bookings w where w.booking_id = (select id from old_hold)), 'fee_unset:true',
  'a link whose fee is still unset is marked fee_unset, from the old alert''s first day');
select is((select (a.acknowledged_at is not null)::text || ':'
                  || (select count(*) from public.security_alerts n
                      where n.fingerprint = 'weather_link_held:' || w.id and n.acknowledged_at is null)
           from public.security_alerts a join public.weather_notice_bookings w on w.booking_id = (select id from old_hold)
           where a.fingerprint = 'weather_refund_fee_unset:' || (select id from old_hold)), 'true:1',
  'with its own alert, the old one closed');
select is((select coalesce(w.held_reason, 'unmarked') from public.weather_notice_bookings w
           where w.booking_id = (select id from old_hold_va)), 'unmarked',
  'a link whose fee is set now is left for the sweep');

-- H-1: a manual_refund that names no link is an ordinary refund.
select is(pg_temp.approve_and_apply(pg_temp.propose_refund((select id from held_plain), 1000, 'plain')), 'applied',
  'H-1: a manual_refund that names no link is applied as an ordinary refund');
select is((select count(*)::int || ':' || (select (w.resolved_at is null)::text from public.weather_notice_bookings w
                                           where w.booking_id = (select id from held_plain))
           from public.refund_requests r where r.booking_id = (select id from held_plain)), '0:true',
  'with no weather request, its link still held');

-- M-C: while any manual_refund of the booking is open, the sweep leaves the booking alone.
create temporary table open_plain on commit drop as
select pg_temp.propose_refund((select id from held_plain), 500, 'plain-open') as id;
update public.site_settings set value = '7' where key = 'midtrans.fee_qris_permille';
select internal.settle_lapsed_weather_links(50);
select is((select (resolved_at is null)::text from public.weather_notice_bookings
           where booking_id = (select id from held_plain)), 'true',
  'M-C: the sweep skips a booking with an open manual_refund, named or not');
select is((select w.resolution || ':' || r.status || ':' || r.amount || ':' || r.fee_amount || ':'
                  || string_agg(l.rw_id || '=' || l.status, ',' order by l.rw_id)
           from public.weather_notice_bookings w join public.refund_requests r on r.booking_id = w.booking_id
           join public.booking_legs l on l.booking_id = w.booking_id
           where w.id = (select id from manual_leg_link) group by w.resolution, r.status, r.amount, r.fee_amount),
  'auto_refunded:requested:243443:3457:5=checked_in,13=released',
  'and refunds the visited combo''s leg itself once the QRIS fee is set: its share less the Rp 3.457 fee');

-- F-2 (H-A, M-B): a visited combo's leg the shares cannot fund is the one refunded by hand. On the 5/80/15 rule of the
-- L-1 combo of Rp 60.000 the kelurahan holds Rp 3.000, RW 05 Rp 48.000 and RW 13 Rp 9.000. The leg's share is
-- Rp 30.000 and the QRIS fee 7 per mille of Rp 60.000, Rp 420, so the transfer is Rp 29.580. The ledger gives back
-- the share: RW 13's Rp 9.000, the kelurahan's Rp 3.000 and, as A24 says, Rp 18.000 more from the kelurahan, which ends
-- at minus Rp 18.000; RW 05 keeps its Rp 48.000.
create temporary table short_link on commit drop as
select id from public.weather_notice_bookings where booking_id = (select id from short_combo);
select set_config('app.in_rpc', '1', true);
update public.weather_notice_bookings set open_until = now() - interval '1 second' where id = (select id from short_link);
select set_config('app.in_rpc', '', true);
select internal.settle_lapsed_weather_links(50);
select is((select held_reason from public.weather_notice_bookings where id = (select id from short_link)),
  'shares_short', 'the sweep holds the leg the shares cannot fund');
select is(pg_temp.hint_of($$select internal.held_weather_terms(
  jsonb_populate_record((select b from public.bookings b where b.id = (select id from short_combo)), '{"needs_review": true}'),
  (select w from public.weather_notice_bookings w where w.id = (select id from short_link)),
  (select p from public.payments p where p.booking_id = (select id from short_combo)))$$), 'STATE_INVALID',
  'L-a: no weather refund by hand for a booking under review');
select is(pg_temp.hint_of($$select internal.held_weather_terms(
  (select b from public.bookings b where b.id = (select id from short_combo)),
  jsonb_populate_record((select w from public.weather_notice_bookings w where w.id = (select id from short_link)),
                        '{"moves_used": 1}'),
  (select p from public.payments p where p.booking_id = (select id from short_combo)))$$), 'STATE_INVALID',
  'nor for a link that moved');
select is(pg_temp.hint_of($$select internal.held_weather_terms(
  (select b from public.bookings b where b.id = (select id from short_combo)),
  jsonb_populate_record((select w from public.weather_notice_bookings w where w.id = (select id from short_link)),
    jsonb_build_object('booking_leg_id', (select l.id from public.booking_legs l
                                          where l.booking_id = (select id from short_combo) and l.rw_id = 5))),
  (select p from public.payments p where p.booking_id = (select id from short_combo)))$$), 'STATE_INVALID',
  'nor for a leg already visited');
select is(pg_temp.hint_of($$select pg_temp.propose_refund((select id from short_combo), 30000, 'short-wrong',
  (select id from short_link))$$), 'REFUND_REQUEST_MISMATCH',
  'a proposal of any other amount than the share less the Midtrans fee is refused');
create temporary table short_manual on commit drop as
select pg_temp.propose_refund((select id from short_combo), 29580, 'short-manual', (select id from short_link)) as id;
grant select on short_link, short_manual to authenticated;
select is((select details ->> 'weather_link_id' from public.payment_adjustments where id = (select id from short_manual)),
  (select id::text from short_link), 'H-A: propose_adjustment keeps the link it names, lower-cased');
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.resolve_weather_link((select id from short_link), 'no_refund',
  'Diputuskan superadmin')$$), 'STATE_INVALID', 'L-4: no_refund is refused while a manual refund is open');
reset role;
select is(pg_temp.approve_and_apply((select id from short_manual)), 'applied',
  'approved by a second superadmin, the exact Rp 29.580 is applied');
select is((select r.kind || ':' || r.status || ':' || r.amount || ':' || r.fee_amount || ':' || r.kelurahan_shortfall
                  || ':' || (r.booking_leg_id is not null)
           from public.refund_requests r where r.booking_id = (select id from short_combo)),
  'weather:recorded:29580:420:18000:true',
  'as the leg''s weather refund request, the Rp 18.000 the kelurahan bore recorded on it');
select is(pg_temp.balances((select id from short_combo)), array['kelurahan=-18000', 'rw:13=0', 'rw:5=48000'],
  'M-B: RW 13 and the kelurahan give back what they hold, the kelurahan bears the rest, RW 05 keeps its share');
select is((select pg_temp.ledger_sum(b.id) = b.total_amount - p.refunded_amount - internal.weather_refund_fees(b.id)
           from public.bookings b join public.payments p on p.booking_id = b.id where b.id = (select id from short_combo)),
  true, 'so the ledger, Rp 30.000, balances with the refund and its fee');
select is((select severity::text || ':' || (details ->> 'shortfall') from public.security_alerts
           where fingerprint = 'weather_shortfall_kelurahan:'
                               || (pg_temp.request_of((select id from short_combo))).refund_key), 'medium:18000',
  'with the medium weather_shortfall_kelurahan alert');
select is((select count(*)::int from public.security_alerts
           where fingerprint = 'refund_ledger_unbalanced:' || (pg_temp.request_of((select id from short_combo))).refund_key),
  0, 'and no unbalanced ledger');
select is((select b.status::text || ':' || w.resolution || ':' || string_agg(l.rw_id || '=' || l.status, ',' order by l.rw_id)
           from public.bookings b join public.booking_legs l on l.booking_id = b.id
           join public.weather_notice_bookings w on w.id = (select id from short_link)
           where b.id = (select id from short_combo) group by b.status, w.resolution),
  'checked_in:refunded_manually:5=checked_in,13=released',
  'M-1: in the same transaction the stopped leg is released and the link resolved');
select is(pg_temp.hint_of($$select pg_temp.propose_refund((select id from short_combo), 100, 'short-again',
  (select id from short_link))$$), 'STATE_INVALID', 'M-2: a second refund naming the resolved link is refused');
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.resolve_weather_link((select id from short_link), 'no_refund',
  'Diputuskan superadmin')$$), 'STATE_INVALID', 'and so is no_refund after the weather refund');
select throws_ok($$select public.resolve_weather_link((select id from short_link), 'refunded_manually',
  'Transfer bank oleh kelurahan')$$, '22023', null, 'refunded_manually is not an outcome resolve takes');
reset role;

-- F-4: an answer without a transaction status fails nothing.
create temporary table no_status on commit drop as select pg_temp.stuck('+6281300004033') as id;
select pg_temp.a_day_ago((select id from no_status));
select is(internal.fail_unconfirmed_refund_by_poll((pg_temp.request_of((select id from no_status))).id,
  pg_temp.look((select id from no_status), '{}', null)), false, 'F-4: an answer without a transaction status fails nothing');
select is(internal.fail_unconfirmed_refund_by_poll((pg_temp.request_of((select id from no_status))).id,
  pg_temp.look((select id from no_status))), true, 'the same answer with its status does');

select * from finish();
rollback;
