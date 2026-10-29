-- Task P3.9.03 (20261105090000; docs/Security.md §3.7; REC-01, PAY-14), review of PR #105: the nightly run against
-- refunds. A cancellation at H-3 or earlier (90 %, docs/PRD.md §13.1 A16) and a whole booking's weather refund void the
-- paid invoice under a credit note, which is no invoice_mismatch (H1). Midtrans' refunds are compared with what was
-- recorded under its word (internal.midtrans_recorded), not with refunded_amount: a bank-transfer refund Midtrans
-- never made is no disagreement, while a Midtrans refund beside it, or one larger or smaller than the one recorded, is
-- an issue (M1).
begin;
select plan(9);
\ir helpers/rls_personas.psql
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: an RW 05 package at Rp 30.000 and two sessions =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000f7001', 5, 'student', 'uji-rekon-refund', 'Paket Uji Rekon Refund', 'per_pax',
   30000, 'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000f7101', 5, public.today_jkt() + 5, '13:07', '14:07', 'Uji rekon refund', 200),
  ('00000000-0000-4000-8000-0000000f7102', 5, public.today_jkt() + 6, '13:07', '14:07', 'Uji rekon cuaca', 200);

\ir helpers/visit_terms.psql

-- The poll event the route would store for a Status API answer, p_refunded rupiah refunded when given.
create function pg_temp.poll(p_order text, p_status text, p_gross bigint, p_refunded bigint) returns bigint
  language sql
as $$
  select (internal.record_payment_event('poll',
    encode(extensions.digest('poll' || p_order || p_status || coalesce(p_refunded, -1) || clock_timestamp()::text,
                             'sha256'), 'hex'),
    pg_temp.answer(p_order, p_status, p_gross)
      || case when p_refunded is null then '{}'::jsonb
              else jsonb_build_object('refund_amount', p_refunded || '.00') end) ->> 'event_id')::bigint;
$$;

create function pg_temp.look(p_booking uuid, p_status text, p_gross bigint, p_refunded bigint) returns jsonb
  language sql
as $$
  select jsonb_build_object('order_id', pg_temp.order_of(p_booking), 'outcome', 'answered',
                            'event_id', pg_temp.poll(pg_temp.order_of(p_booking), p_status, p_gross, p_refunded));
$$;

create function pg_temp.issues(p_booking uuid, p_run uuid) returns text
  language sql
as $$
  select coalesce(string_agg(i.issue_type, ',' order by i.issue_type), '') from public.reconciliation_issues i
  where i.booking_id = p_booking and i.run_id = p_run;
$$;

-- A16: Rp 300.000 cancelled five days ahead, 90 % refunded through Midtrans.
create temporary table cancelled on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000f7001', '00000000-0000-4000-8000-0000000f7101', 10,
                    '+6281300004001', false) as id;
create temporary table cancel_outcome on commit drop as
select internal.cancel_booking((select id from cancelled), null, 'Sekolah libur', 'cancellation', 270000,
                               90::smallint) as reply;
select internal.mark_refund_request((select (reply -> 'refund' ->> 'request_id')::uuid from cancel_outcome),
                                    'submitted', '200', null);
select pg_temp.event(pg_temp.order_of((select id from cancelled)), 'partial_refund', 300000, 270000);

-- A whole booking's weather refund, Rp 150.000 less the 0.7 % fee.
create temporary table rained on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000f7001', '00000000-0000-4000-8000-0000000f7102', 5,
                    '+6281300004002', false) as id;
select pg_temp.act_as('admin_rw_05');
select public.declare_weather_disruption('00000000-0000-4000-8000-0000000f7102', 'Hujan deras');
reset role;
update public.site_settings set value = '7' where key = 'midtrans.fee_qris_permille';
select internal.cancel_booking((select id from rained), null, 'Hujan', 'weather', 148950, null);
select pg_temp.event(pg_temp.order_of((select id from rained)), 'partial_refund', 150000, 148950);

-- A Virtual Account refund paid by bank transfer: the payment shows it, Midtrans never made it.
create temporary table transferred on commit drop as
select pg_temp.paid('00000000-0000-4000-8000-0000000f7001', '00000000-0000-4000-8000-0000000f7101', 4,
                    '+6281300004003', false) as id;
alter table public.payments disable trigger user;
update public.payments set status = 'partially_refunded', refunded_amount = 30000
where booking_id = (select id from transferred);
alter table public.payments enable trigger user;

select is((select p.status || ':' || p.refunded_amount || ':' || i.status || ':' || (i.credit_note_number is not null)
           from public.payments p join public.invoices i on i.payment_id = p.id
           where p.order_id = pg_temp.order_of((select id from cancelled))),
  'partially_refunded:270000:void:true', 'the 90 % cancellation leaves the payment partly refunded, its invoice credited');
select is((select p.status || ':' || p.refunded_amount || ':' || i.status || ':' || (i.credit_note_number is not null)
           from public.payments p join public.invoices i on i.payment_id = p.id
           where p.order_id = pg_temp.order_of((select id from rained))),
  'partially_refunded:148950:void:true', 'and so does the weather refund');

-- ===== What Midtrans says is what was recorded =====
create temporary table agreeing_run on commit drop as
select (internal.reconcile_payments(jsonb_build_array(
          pg_temp.look((select id from cancelled), 'partial_refund', 300000, 270000),
          pg_temp.look((select id from rained), 'partial_refund', 150000, 148950),
          pg_temp.look((select id from transferred), 'settlement', 120000, null))) ->> 'run_id')::uuid as id;
select is(pg_temp.issues((select id from cancelled), (select id from agreeing_run)), '',
  'a payment refunded 90 % with its invoice credited raises no invoice_mismatch, and its refund agrees (H1)');
select is(pg_temp.issues((select id from rained), (select id from agreeing_run)), '',
  'nor does a weather refund, whose ledger gave back all but the fee');
select is((select count(*)::int from public.reconciliation_issues
           where run_id = (select id from agreeing_run) and booking_id = (select id from transferred)
             and issue_type in ('status_disagreement', 'amount_mismatch')),
  0, 'a bank-transfer refund Midtrans never made, with Midtrans still saying settlement, is no disagreement (M1)');
select is((select count(*)::int from public.reconciliation_issues
           where run_id = (select id from agreeing_run) and booking_id = (select id from transferred)
             and issue_type = 'invoice_mismatch'),
  0, 'and its invoice, still paid, is the one it keeps');

-- ===== Midtrans says otherwise =====
create temporary table disagreeing_run on commit drop as
select (internal.reconcile_payments(jsonb_build_array(
          pg_temp.look((select id from cancelled), 'partial_refund', 300000, 200000),
          pg_temp.look((select id from rained), 'partial_refund', 150000, 150000),
          pg_temp.look((select id from transferred), 'partial_refund', 120000, 30000))) ->> 'run_id')::uuid as id;
select is((select (details ->> 'midtrans_refunded') || ':' || (details ->> 'our_midtrans_refunded')
           from public.reconciliation_issues
           where run_id = (select id from disagreeing_run) and booking_id = (select id from cancelled)
             and issue_type = 'amount_mismatch'),
  '200000:270000', 'Midtrans reporting less refunded than was booked as its refund is an amount mismatch');
select is((select (details ->> 'midtrans_refunded') || ':' || (details ->> 'our_midtrans_refunded')
           from public.reconciliation_issues
           where run_id = (select id from disagreeing_run) and booking_id = (select id from rained)
             and issue_type = 'amount_mismatch'),
  '150000:148950', 'and so is Midtrans reporting more');
select is((select details ->> 'midtrans_status' || ':' || (details ->> 'our_midtrans_refunded') || ':' || severity
           from public.reconciliation_issues
           where run_id = (select id from disagreeing_run) and booking_id = (select id from transferred)
             and issue_type = 'status_disagreement'),
  'partial_refund:0:high', 'a Midtrans refund beside a bank transfer already made is a high disagreement (M1)');

select * from finish();
rollback;
