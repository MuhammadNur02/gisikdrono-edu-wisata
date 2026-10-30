-- The RW bears the costs of its own visits (decision of 2026-10-29, docs/PRD.md §13.1 A29 decision 6, A24 as revised;
-- 20261105160400), under the 100 %-RW defaults of 20261105160000: a paid cancellation keeps its retained part with the
-- RW alone; a combo leg's weather refund comes back from the stopped RW and leaves the visited RW whole; a leg the
-- shares cannot fund is borne by the stopped RW below zero, with the medium weather_shortfall_rw alert, never by the
-- kelurahan and never refused (review of PR #114, L3); and a weather refund's Midtrans fee is the visitor's, so the
-- kelurahan shows no line for it. Every case keeps the ledger equal to what was paid less what was refunded.
begin;
select plan(14);
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: an RW 05 package, a combo on the default rule and one on a 60/40 rule of its own =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000b7005', 5, 'regular', 'uji-biaya-rw-05', 'Paket Biaya RW 05', 'per_pax', 30000,
   'published');
insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000b7099', 'combo', 'uji-biaya-kombo', 'Kombo Biaya', 'per_pax', 30000, 'draft'),
  ('00000000-0000-4000-8000-0000000b7098', 'combo', 'uji-biaya-kombo-celah', 'Kombo Biaya Celah', 'per_pax', 30000,
   'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000b7099', 5, 1), ('00000000-0000-4000-8000-0000000b7099', 13, 2),
  ('00000000-0000-4000-8000-0000000b7098', 5, 1), ('00000000-0000-4000-8000-0000000b7098', 13, 2);
update public.tour_packages set status = 'published'
where id in ('00000000-0000-4000-8000-0000000b7099', '00000000-0000-4000-8000-0000000b7098');
-- RW 05 60 %, RW 13 40 %: RW 13 holds less than its leg's half, so its weather refund is short.
with rule as (
  insert into public.revenue_share_rules (scope, package_id, name, effective_from)
  values ('package', '00000000-0000-4000-8000-0000000b7098', 'Uji 60/40', public.today_jkt() - 1)
  returning id)
insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct)
select rule.id, 'rw_treasury', line.rw_id, line.pct
from rule, (values (5::smallint, 60.00), (13::smallint, 40.00)) as line(rw_id, pct);
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000b8005', 5, public.today_jkt() + 6, '09:20', '10:20', 'Uji biaya 05', 200),
  ('00000000-0000-4000-8000-0000000b8006', 5, public.today_jkt() + 6, '11:20', '12:20', 'Uji biaya kombo 05', 200),
  ('00000000-0000-4000-8000-0000000b8013', 13, public.today_jkt() + 6, '13:20', '14:20', 'Uji biaya kombo 13', 200),
  ('00000000-0000-4000-8000-0000000b8007', 5, public.today_jkt() + 6, '15:20', '16:20', 'Uji biaya celah 05', 200),
  ('00000000-0000-4000-8000-0000000b8014', 13, public.today_jkt() + 6, '17:20', '18:20', 'Uji biaya celah 13', 200);

create function pg_temp.hold(p_package uuid, p_sessions uuid[], p_rws smallint[], p_phone text) returns uuid
  language sql
as $$
  with proof as (
    insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
    values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
            now() - interval '1 minute', now() - interval '2 minutes')
    returning id
  )
  select (internal.create_booking(p_package, p_sessions, 20,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Biaya', 'pic_name', 'Ani Biaya',
                       'pic_phone', p_phone, 'pic_email', 'biaya@contoh.test', 'notes', null),
    '[]', '[]', 'pay', 'web', null, (select id from proof), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote(p_package, 20, '[]', p_rws))) ->> 'booking_id')::uuid;
$$;

create function pg_temp.settle(p_booking uuid) returns void
  language plpgsql
as $$
declare
  attempt jsonb := internal.create_payment_attempt(p_booking, null, null);
  order_id text := attempt ->> 'order_id';
  answer jsonb;
begin
  perform internal.attach_snap_token((attempt ->> 'payment_id')::uuid, 'token-' || order_id,
                                     'https://app.sandbox.midtrans.com/snap/v4/redirection/' || order_id);
  answer := jsonb_build_object('order_id', order_id, 'status_code', '200',
    'gross_amount', (attempt ->> 'gross_amount') || '.00', 'signature_key', repeat('a', 128),
    'transaction_status', 'settlement', 'transaction_id', 'txn-' || order_id, 'payment_type', 'qris',
    'currency', 'IDR', 'fraud_status', 'accept',
    'settlement_time', to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'));
  perform internal.apply_payment_event((internal.record_payment_event('webhook',
    encode(extensions.digest(answer::text, 'sha256'), 'hex'), answer) ->> 'event_id')::bigint, 'webhook', answer);
end;
$$;

-- What each party still holds of a booking, by beneficiary key.
create function pg_temp.balances(p_booking uuid) returns text[]
  language sql
as $$
  select array_agg(x.key || '=' || x.amount order by x.key) from (
    select e.beneficiary_key as key, sum(e.amount) as amount from public.revenue_share_entries e
    where e.booking_id = p_booking group by e.beneficiary_key) as x;
$$;

create function pg_temp.leg_of(p_booking uuid, p_rw smallint) returns uuid
  language sql
as $$ select l.id from public.booking_legs l where l.booking_id = p_booking and l.rw_id = p_rw; $$;

create temporary table regular on commit drop as
  select pg_temp.hold('00000000-0000-4000-8000-0000000b7005', array['00000000-0000-4000-8000-0000000b8005']::uuid[],
    array[5]::smallint[], '+6281300009911') as id;
create temporary table combo on commit drop as
  select pg_temp.hold('00000000-0000-4000-8000-0000000b7099',
    array['00000000-0000-4000-8000-0000000b8006', '00000000-0000-4000-8000-0000000b8013']::uuid[],
    array[5, 13]::smallint[], '+6281300009912') as id;
create temporary table short_combo on commit drop as
  select pg_temp.hold('00000000-0000-4000-8000-0000000b7098',
    array['00000000-0000-4000-8000-0000000b8007', '00000000-0000-4000-8000-0000000b8014']::uuid[],
    array[5, 13]::smallint[], '+6281300009913') as id;
select pg_temp.settle((select id from regular));
select pg_temp.settle((select id from combo));
select pg_temp.settle((select id from short_combo));

select is(pg_temp.balances((select id from regular)), array['rw:5=600000'],
  'a settled RW 05 visit pays RW 05 all of it');

-- The ledger writers, as the visit-terms functions call them.
select set_config('app.in_rpc', '1', true);
select set_config('app.actor_role', 'cron', true);
select internal.take_audit_turn();

-- ===== A paid cancellation (A16): the retained part stays with the RW alone =====
select is(internal.reverse_cancellation_share((select id from regular), 540000, 'uji-biaya-batal') ->> 'amount',
  '-540000', 'a cancellation at 90 % writes reversals of Rp 540.000 of the package');
select is(pg_temp.balances((select id from regular)), array['rw:5=60000'],
  'and RW 05 keeps the Rp 60.000 the terms retain, the kelurahan nothing');

-- ===== A combo leg's weather refund (A20) under the default split =====
select is(internal.reverse_leg_share((select id from combo), pg_temp.leg_of((select id from combo), 13::smallint),
                                     'uji-biaya-kaki') ->> 'rw_shortfall',
  '0', 'the stopped RW 13 holds exactly its leg''s half, so nothing is short');
select is(pg_temp.balances((select id from combo)), array['rw:13=0', 'rw:5=300000'],
  'RW 13 gives back its Rp 300.000, RW 05 keeps its own whole');

-- ===== A leg the shares cannot fund (A24 as revised; review L3): the stopped RW bears the rest =====
select lives_ok(
  $$select internal.reverse_leg_share((select id from short_combo),
      pg_temp.leg_of((select id from short_combo), 13::smallint), 'uji-biaya-celah')$$,
  'a leg whose RW holds less than its share is reversed, not refused for want of a kelurahan share');
select is(pg_temp.balances((select id from short_combo)), array['rw:13=-60000', 'rw:5=360000'],
  'RW 13 gives back its Rp 240.000 and bears the Rp 60.000 still short below zero; RW 05 keeps its share');
select is((select coalesce(sum(-e.amount), 0)::bigint from public.revenue_share_entries e
           where e.booking_id = (select id from short_combo) and e.entry_type = 'reversal'),
  internal.leg_share((select b from public.bookings b where b.id = (select id from short_combo)),
                     pg_temp.leg_of((select id from short_combo), 13::smallint)),
  'exactly the leg''s share comes back, so the ledger balances with the refund');
select is((select severity::text || ':' || (details ->> 'rw_id') || ':' || (details ->> 'shortfall')
           from public.security_alerts where fingerprint = 'weather_shortfall_rw:uji-biaya-celah'),
  'medium:13:60000', 'with the medium weather_shortfall_rw alert naming RW 13');
select is((select count(*)::int from public.security_alerts
           where fingerprint = 'weather_shortfall_kelurahan:uji-biaya-celah'), 0,
  'and no kelurahan shortfall alert');
select set_config('app.actor_role', '', true);
select set_config('app.in_rpc', '', true);

-- ===== No kelurahan line, for revenue or for costs =====
select is((select count(*)::int from public.revenue_share_entries e
           where e.booking_id in ((select id from regular), (select id from combo), (select id from short_combo))
             and e.beneficiary = 'kelurahan'),
  0, 'none of the three bookings gives the kelurahan a ledger row, settlement or reversal');

-- ===== The Midtrans fee of a weather refund is the visitor's (A18) =====
update public.site_settings set value = '7' where key = 'midtrans.fee_qris_permille';
select is(
  (select (q ->> 'fee_amount') || ':' || (q ->> 'amount')
   from internal.weather_quote(internal.settled_payment_of((select id from combo)), null, 300000) as q),
  '4200:295800',
  'a QRIS weather refund of a Rp 300.000 leg is Rp 295.800: the visitor bears the 7 permille fee on Rp 600.000');
select is(
  (select pg_temp.balances(b.id) from public.bookings b where b.id = (select id from combo)),
  array['rw:13=0', 'rw:5=300000'],
  'while the ledger gives back the whole share and charges the fee to no party, the kelurahan included');
select is(internal.verify_ledger_chain() ->> 'ok', 'true', 'the ledger''s hash chain still verifies');

select * from finish();
rollback;
