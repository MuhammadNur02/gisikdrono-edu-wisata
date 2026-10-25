-- The visit terms at their edges (review of PR #69, M4, H1, M1, M3, L2): H-2 and the visit day end to end, the day
-- turning at midnight in Jakarta rather than in UTC, a combo whose legs fall on two days, add-ons already handed over,
-- a refund previewed and then changed, the alert and staff message of every refund request, a refund call with no
-- answer that payments-poll retries and one Midtrans refused but carried out after all, the Virtual Account fee, a
-- weather refund the fee eats whole, the weather window closing, a full target session, the cap of three weather
-- moves with the ticket sent again after each, and the same cancellation or move asked twice.
begin;
select plan(60);
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
select pg_temp.declare('00000000-0000-4000-8000-0000000e3011');
select is((select count(*)::int from public.notifications
           where booking_id = (select id from moved) and template = 'weather_disruption' and channel = 'email'), 1,
  'the notice goes out by email (rule 4)');
select is((select count(*)::int from public.notifications
           where booking_id = (select id from moved) and template = 'weather_disruption' and channel = 'whatsapp'), 0,
  'and not by WhatsApp until Meta approves gsk_weather_disruption_v1');
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
           where fingerprint = 'weather_refund_fee_unset:' || (select id from lapsed_va)), 'high',
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

select * from finish();
rollback;
