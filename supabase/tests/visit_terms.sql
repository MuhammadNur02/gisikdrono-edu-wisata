-- Task P3.12.02 with the owner's visit terms (docs/PRD.md §13.1 A16–A18, FR-BOOK-17, FR-BOOK-23..25): an unpaid
-- booking is cancelled for free; a paid one under the refund schedule, its tickets revoked and seats released at once
-- and its refund requested, then booked when Midtrans reports it, add-ons back in full and the kept package part split
-- between the kelurahan and the RW only, refund + retained = paid; weather_notices and refund_requests stay behind RLS;
-- a weather notice opens moves within its window, or the weather refund net of the fee once the fee is set, which
-- gives back the whole ledger. visit_terms_edges.sql has the cap, the window and the combo.
begin;
select plan(48);
\ir helpers/addons_on.psql
\ir helpers/rls_personas.psql
\ir helpers/kelurahan_share_defaults.psql
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: an RW 05 package at Rp 30.000, a Rp 15.000 add-on, sessions on four days =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000e1001', 5, 'student', 'uji-syarat-paket', 'Paket Uji Syarat', 'per_pax', 30000,
   'published'),
  ('00000000-0000-4000-8000-0000000e1002', 5, 'student', 'uji-syarat-ganjil', 'Paket Uji Ganjil', 'per_pax', 33337,
   'published');
insert into public.umkm_vendors (id, rw_id, slug, name) values
  ('00000000-0000-4000-8000-0000000e1051', 5, 'uji-syarat-vendor', 'Vendor Uji Syarat');
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price, unit_label, min_order_qty,
  max_order_qty, is_addon_eligible, is_available, status) values
  ('00000000-0000-4000-8000-0000000e1a01', 5, '00000000-0000-4000-8000-0000000e1051', 'uji-syarat-kompos',
   'Kompos Uji Syarat', 'compost', 15000, 'kantong', 1, 10, true, true, 'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000e2001', 5, public.today_jkt() + 5, '09:00', '11:00', 'Uji syarat H-5', 200),
  ('00000000-0000-4000-8000-0000000e2002', 5, public.today_jkt() + 6, '09:00', '11:00', 'Uji syarat H-6', 200),
  ('00000000-0000-4000-8000-0000000e2003', 5, public.today_jkt() + 1, '20:00', '21:30', 'Uji syarat H-1', 200),
  ('00000000-0000-4000-8000-0000000e2004', 5, public.today_jkt() + 7, '09:00', '11:00', 'Uji syarat H-7', 200);

\ir helpers/visit_terms.psql

-- ===== The schedule =====
select is(array[internal.cancel_refund_pct(9), internal.cancel_refund_pct(3), internal.cancel_refund_pct(2),
                internal.cancel_refund_pct(1), internal.cancel_refund_pct(0), internal.cancel_refund_pct(-1)]::int[],
  array[90, 90, 80, 50, 0, 0], 'H-3 or earlier 90 %, H-2 80 %, H-1 50 %, the visit day and after nothing');

-- ===== An unpaid booking is cancelled for free =====
create temporary table unpaid on commit drop as
select pg_temp.hold('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e2004', 4,
                    '+6281300003001', false) as id;
create temporary table unpaid_order on commit drop as select pg_temp.attempt((select id from unpaid)) as order_id;
select is(pg_temp.reserved('00000000-0000-4000-8000-0000000e2004'), 4, 'the hold takes its four seats');
create temporary table unpaid_outcome on commit drop as
select internal.cancel_booking((select id from unpaid), null, 'Rencana berubah', 'cancellation', 0, null) as reply;
select is((select reply -> 'close_orders' from unpaid_outcome), jsonb_build_array((select order_id from unpaid_order)),
  'the visitor''s cancellation names the open order for Midtrans to end');
select is((select status::text from public.bookings where id = (select id from unpaid)), 'cancelled',
  'the unpaid booking is cancelled');
select is(pg_temp.reserved('00000000-0000-4000-8000-0000000e2004'), 0, 'its seats are back');
select is((select status::text from public.payments where order_id = (select order_id from unpaid_order)), 'cancelled',
  'and its open attempt is closed');
select is((select count(*)::int from public.refund_requests where booking_id = (select id from unpaid)), 0,
  'no money, no refund request');
select is((select count(*)::int from public.notifications
           where booking_id = (select id from unpaid) and template = 'booking_cancelled'), 2,
  'booking_cancelled goes out on both channels');
select throws_ok($$select internal.cancel_booking((select id from unpaid), null, 'lagi', 'cancellation', 0, null)$$,
  'P0001', null, 'a cancelled booking is not cancelled again');

-- ===== A paid booking five days ahead: Rp 300.000 package and Rp 30.000 add-ons =====
create temporary table paid on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e2001', 10,
                    '+6281300003002', true) as id;
select is((select status::text || ':' || total_amount from public.bookings where id = (select id from paid)),
  'paid:330000', 'the booking is paid, Rp 330.000');
select is(pg_temp.held((select id from paid)),
  array['addon:rw=3000', 'addon:vendor=27000', 'package:kelurahan=60000', 'package:rw=240000'],
  'its ledger splits the package 20/80 and the add-ons 90/10');
select is(internal.refund_preview((select id from paid), 'cancellation') ->> 'amount', '300000',
  'the preview: 90 % of the package and the add-ons in full');
select throws_ok($$select internal.refund_preview((select id from paid), 'weather')$$, 'P0001', null,
  'no weather refund without a weather notice');

create temporary table paid_outcome on commit drop as
select internal.cancel_booking((select id from paid), null, 'Sekolah libur', 'cancellation', 300000, 90::smallint) as reply;
select is((select status::text from public.bookings where id = (select id from paid)), 'cancelled',
  'the paid booking is cancelled at once');
select is((select array_agg(distinct status::text) from public.tickets_qr where booking_id = (select id from paid)),
  array['revoked'], 'its tickets are revoked');
select is(pg_temp.reserved('00000000-0000-4000-8000-0000000e2001'), 0, 'and its seats released');
select is((select status::text || ':' || amount || ':' || package_refund || ':' || addon_refund || ':' || refund_pct
           || ':' || days_before from public.refund_requests where booking_id = (select id from paid)),
  'requested:300000:270000:30000:90:5', 'the refund is requested, not paid: Rp 270.000 + Rp 30.000 at H-5');
select matches((select reply -> 'refund' ->> 'refund_key' from paid_outcome),
  '^GSK-[0-9A-HJKMNP-TV-Z]{8}-01-R01$', 'its refund key names the order and the refund');
select is((select payment_status::text from (select status as payment_status from public.payments
           where booking_id = (select id from paid) and status = 'settled') as p), 'settled',
  'the payment stays settled until the refund comes back');
select is(pg_temp.ledger_sum((select id from paid)), 330000::bigint, 'and nothing leaves the ledger yet');

select lives_ok($$select internal.mark_refund_request((select (reply -> 'refund' ->> 'request_id')::uuid
  from paid_outcome), 'submitted', '200', null)$$, 'Midtrans took the refund call');

-- ===== The refund comes back =====
select is(pg_temp.event(pg_temp.order_of((select id from paid)), 'partial_refund', 330000, 300000)
            ->> 'processing_result',
  'refund_recorded', 'the partial_refund notification of the request books it');
select is((select status::text || ':' || refunded_amount from public.payments
           where order_id = pg_temp.order_of((select id from paid))), 'partially_refunded:300000',
  'the payment takes Midtrans'' status and the refunded amount');
select is(pg_temp.held((select id from paid)),
  array['addon:rw=0', 'addon:vendor=0', 'package:kelurahan=6000', 'package:rw=24000'],
  'the add-ons go back whole; the kept Rp 30.000 stays 20/80 with the kelurahan and the RW only');
select is(pg_temp.ledger_sum((select id from paid)) + 300000, 330000::bigint, 'refund + retained = paid');
select is((select status::text from public.refund_requests where booking_id = (select id from paid)), 'recorded',
  'the request is recorded');
select matches((select status::text || ':' || credit_note_number from public.invoices
                where booking_id = (select id from paid)), '^void:CN/GSK/', 'the invoice is voided with a credit note');
select is((select count(*)::int from public.notifications
           where booking_id = (select id from paid) and template = 'refund_processed'), 2,
  'refund_processed goes out on both channels');
select is(pg_temp.event(pg_temp.order_of((select id from paid)), 'partial_refund', 330000, 300000) ->> 'processing_result',
  'refund_already_recorded', 'the same refund reported again books nothing twice');
select is(pg_temp.ledger_sum((select id from paid)), 30000::bigint, 'the ledger keeps the retained part');

-- ===== Odd amounts at H-1: rounded down, the rest by largest remainder =====
create temporary table odd on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1002', '00000000-0000-4000-8000-0000000e2003', 3,
                    '+6281300003003', false) as id;
create temporary table odd_outcome on commit drop as
select internal.cancel_booking((select id from odd), null, 'Sakit', 'cancellation', 50005, 50::smallint) as reply;
select is((select amount || ':' || refund_pct from public.refund_requests where booking_id = (select id from odd)),
  '50005:50', 'half of Rp 100.011 is Rp 50.005, rounded down');
select is(pg_temp.event(pg_temp.order_of((select id from odd)), 'partial_refund', 100011, 50005) ->> 'processing_result',
  'refund_recorded', 'its refund is booked');
select is((select sum(e.amount) from public.revenue_share_entries e where e.booking_id = (select id from odd)),
  50006::numeric, 'the kelurahan and the RW keep exactly Rp 50.006');
select is((select count(*)::int from public.revenue_share_entries e
           where e.booking_id = (select id from odd) and e.entry_type = 'reversal' and e.amount <> trunc(e.amount)), 0,
  'in whole rupiah');

-- ===== Weather =====
create temporary table rained on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e2001', 5,
                    '+6281300003004', false) as id;
create temporary table rained_refund on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e2001', 5,
                    '+6281300003005', false) as id;

select pg_temp.act_as('admin_rw_13');
select throws_ok($$select public.declare_weather_disruption('00000000-0000-4000-8000-0000000e2001', 'Hujan')$$,
  '42501', null, 'an RW 13 officer declares no weather for RW 05');
reset role;
select pg_temp.act_as('admin_rw_05_aal1');
select throws_ok($$select public.declare_weather_disruption('00000000-0000-4000-8000-0000000e2001', 'Hujan')$$,
  '42501', null, 'nor does an officer short of AAL2');
reset role;
select pg_temp.act_as('admin_rw_05');
select is(public.declare_weather_disruption('00000000-0000-4000-8000-0000000e2001', 'Hujan deras') ->> 'affected_bookings',
  '2', 'the RW 05 officer declares it for the two paid bookings on the session');
select is((select count(*)::int from public.weather_notices
           where visit_session_id = '00000000-0000-4000-8000-0000000e2001'), 1, 'and reads the notice back');
reset role;
select pg_temp.act_as('admin_rw_08');
select is((select count(*)::int from public.weather_notices
           where visit_session_id = '00000000-0000-4000-8000-0000000e2001'), 0, 'which an RW 08 officer does not see');
select is((select count(*)::int from public.refund_requests), 0, 'nor any refund request');
reset role;

select is(internal.reschedule_for_weather((select id from rained),
  '00000000-0000-4000-8000-0000000e2002') ->> 'moves', '1',
  'a booking on the session moves to another day');
select is((select visit_date - public.today_jkt() || ':' || pg_temp.reserved('00000000-0000-4000-8000-0000000e2002')
           from public.bookings where id = (select id from rained)), '6:5', 'its day and its seats move together');
select is((select valid_on - public.today_jkt() || ':' || status from public.tickets_qr
           where booking_id = (select id from rained)), '6:issued', 'its ticket keeps its code and takes the new day');
select is(internal.reschedule_for_weather((select id from rained),
  '00000000-0000-4000-8000-0000000e2004') ->> 'moves_left', '1',
  'the rights stay with the booking and the notice, so it may move again (decision of 2026-10-25, rule 1)');

select throws_ok($$select internal.cancel_booking((select id from rained_refund), null, 'Hujan', 'weather', 148950, null)$$, 'P0001', null,
  'no weather refund while the Midtrans fee is not set');
update public.site_settings set value = '7' where key = 'midtrans.fee_qris_permille';
select is(internal.cancel_booking((select id from rained_refund), null, 'Hujan', 'weather', 148950, null) -> 'refund' ->> 'amount',
  '148950', 'the weather refund is Rp 150.000 minus the 0.7 % fee of Rp 1.050');
select is(pg_temp.event(pg_temp.order_of((select id from rained_refund)), 'partial_refund', 150000, 148950)
            ->> 'processing_result', 'refund_recorded', 'which is booked when it comes back');
select is(pg_temp.ledger_sum((select id from rained_refund)), 0::bigint,
  'and gives the whole ledger back: neither the kelurahan nor the RW keeps any of it');

select * from finish();
rollback;
