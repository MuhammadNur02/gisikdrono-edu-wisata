-- Review of PR #42 (docs/PRD.md §11.2; REC-06, REC-10, REC-14): which rule a settlement splits by, and what happens
-- when none can. A rule paying one vendor twice is refused when written, and at settlement it leaves the booking paid
-- under review (H1); so do no rule and two rules in force. A package's own rule beats its RW's default, and a
-- product's beats the add-on default; the kelurahan wins a tie, a three-leg combo's spare rupiah goes to the earlier
-- legs, and the Jakarta day picks the rule. A split refused for want of a rule is written once one covers the
-- settlement's day, when the payments poll completes the booking, and the review stays for staff to close (M3).
begin;
select plan(21);
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures =====
insert into public.umkm_vendors (id, rw_id, slug, name) values
  ('00000000-0000-4000-8000-0000000f0051', 5, 'uji-aturan-vendor', 'Vendor Uji Aturan');
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price, unit_label, is_addon_eligible,
  status)
select ('00000000-0000-4000-8000-0000000f0a0' || n)::uuid, 5, '00000000-0000-4000-8000-0000000f0051',
       'uji-aturan-produk-' || n, 'Produk Uji Aturan ' || n, 'compost', 15001, 'kantong', true, 'published'
from generate_series(1, 4) as n;
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, flat_price, status)
values
  ('00000000-0000-4000-8000-0000000f1001', 5, 'regular', 'uji-aturan-biasa', 'Paket Uji Aturan', 'per_pax', 33333,
   null, 'published'),
  ('00000000-0000-4000-8000-0000000f1002', 5, 'regular', 'uji-aturan-seri', 'Paket Uji Seri', 'flat_group', null,
   1000001, 'published'),
  ('00000000-0000-4000-8000-0000000f1004', 5, 'regular', 'uji-aturan-tengah-malam', 'Paket Uji Tengah Malam',
   'per_pax', 30000, null, 'published');
insert into public.tour_packages (id, category, slug, name, pricing_basis, flat_price, status) values
  ('00000000-0000-4000-8000-0000000f1003', 'combo', 'uji-aturan-tiga-rw', 'Kombo Uji Tiga RW', 'flat_group', 1000003,
   'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000f1003', 5, 1), ('00000000-0000-4000-8000-0000000f1003', 13, 2),
  ('00000000-0000-4000-8000-0000000f1003', 8, 3);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000f1003';
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000f2001', 5, public.today_jkt() + 11, '08:07', '09:07', 'Uji aturan 05', 200),
  ('00000000-0000-4000-8000-0000000f2002', 5, public.today_jkt() + 11, '10:07', '11:07', 'Uji seri 05', 200),
  ('00000000-0000-4000-8000-0000000f2003', 5, public.today_jkt() + 11, '12:07', '13:07', 'Uji tiga 05', 200),
  ('00000000-0000-4000-8000-0000000f2013', 13, public.today_jkt() + 11, '13:37', '14:37', 'Uji tiga 13', 200),
  ('00000000-0000-4000-8000-0000000f2008', 8, public.today_jkt() + 11, '15:07', '16:07', 'Uji tiga 08', 200),
  ('00000000-0000-4000-8000-0000000f2004', 5, public.today_jkt() + 11, '16:37', '17:37', 'Uji tengah malam', 200);

-- A rule and its lines, as (beneficiary, rw_id, vendor_id, pct) rows.
create function pg_temp.rule(p_scope text, p_package uuid, p_product uuid, p_from date, p_to date, p_lines jsonb)
  returns uuid
  language plpgsql
as $$
declare
  rule_id uuid;
begin
  insert into public.revenue_share_rules (scope, rw_id, package_id, product_id, name, effective_from, effective_to)
  values (p_scope::public.revenue_rule_scope, case when p_scope = 'addon_default' then 5 end, p_package, p_product,
          'Aturan uji', p_from, p_to)
  returning id into rule_id;
  insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, vendor_id, pct)
  select rule_id, line.beneficiary::public.revenue_beneficiary, line.rw_id, line.vendor_id, line.pct
  from jsonb_to_recordset(p_lines) as line(beneficiary text, rw_id smallint, vendor_id uuid, pct numeric);
  return rule_id;
end;
$$;

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

create function pg_temp.hold(p_package uuid, p_sessions uuid[], p_addons jsonb, p_rws smallint[], p_phone text)
  returns uuid
  language sql
as $$
  select (internal.create_booking(p_package, p_sessions, 20,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Aturan', 'pic_name', 'Ani Aturan',
                       'pic_phone', p_phone, 'pic_email', 'aturan@contoh.test', 'notes', null),
    p_addons, '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote(p_package, 20, p_addons, p_rws))) ->> 'booking_id')::uuid;
$$;

-- An attempt for the booking's total, settled at p_settled_at (Midtrans' Jakarta wall clock); returns the order id.
create function pg_temp.settle(p_booking uuid, p_settled_at text) returns text
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
    'currency', 'IDR', 'fraud_status', 'accept', 'settlement_time', p_settled_at);
  perform internal.apply_payment_event((internal.record_payment_event('webhook',
    encode(extensions.digest(answer::text, 'sha256'), 'hex'), answer) ->> 'event_id')::bigint, 'webhook', answer);
  return order_id;
end;
$$;

create function pg_temp.now_jkt() returns text
  language sql
as $$ select to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'); $$;

create function pg_temp.ledger(p_booking uuid, p_line_like text) returns text[]
  language sql
as $$
  select array_agg(e.beneficiary_key || '=' || e.amount order by e.beneficiary_key) from public.revenue_share_entries e
  where e.booking_id = p_booking and e.entry_type = 'settlement' and e.line_ref like p_line_like;
$$;

create function pg_temp.review_of(p_booking uuid) returns text
  language sql
as $$
  select b.status || '/' || b.needs_review || '/' || coalesce(b.review_reason, '-') || '/' ||
         (select count(*) from public.revenue_share_entries e where e.booking_id = b.id)
  from public.bookings b where b.id = p_booking;
$$;

-- ===== H1: one vendor paid twice in a line =====
create function pg_temp.write_double_vendor_rule() returns void
  language plpgsql
as $$
begin
  perform pg_temp.rule('product', null, '00000000-0000-4000-8000-0000000f0a01', '2026-01-01', null,
    '[{"beneficiary": "umkm_vendor", "pct": 45},
      {"beneficiary": "umkm_vendor", "vendor_id": "00000000-0000-4000-8000-0000000f0051", "pct": 45},
      {"beneficiary": "rw_treasury", "rw_id": 5, "pct": 10}]');
  set constraints revenue_rule_shape_guard immediate;
end;
$$;
select throws_ok('select pg_temp.write_double_vendor_rule()', 'P0001',
  'a revenue rule pays the product''s own vendor or named vendors, not both',
  'a rule paying the product''s own vendor and a named one is refused when written');

-- One that got past the guard, as one written before it would have: the guard checks at commit, which a test never
-- reaches.
set constraints revenue_rule_shape_guard deferred;
select pg_temp.rule('product', null, '00000000-0000-4000-8000-0000000f0a01', '2026-01-01', null,
  '[{"beneficiary": "umkm_vendor", "pct": 45},
    {"beneficiary": "umkm_vendor", "vendor_id": "00000000-0000-4000-8000-0000000f0051", "pct": 45},
    {"beneficiary": "rw_treasury", "rw_id": 5, "pct": 10}]');
create temporary table double_vendor on commit drop as
  select pg_temp.hold('00000000-0000-4000-8000-0000000f1001', array['00000000-0000-4000-8000-0000000f2001']::uuid[],
    '[{"product_id": "00000000-0000-4000-8000-0000000f0a01", "qty": 3}]', array[5]::smallint[], '+6281300003101')
    as id;
select pg_temp.settle((select id from double_vendor), pg_temp.now_jkt());
select is(pg_temp.review_of((select id from double_vendor)), 'paid/true/REVENUE_RULE_REFUSED/0',
  'at settlement it leaves the booking paid under review with no ledger, instead of failing the notification');
select is((select status::text from public.payments where booking_id = (select id from double_vendor)), 'settled',
  'and the payment settled');
select is((select count(*)::int from public.tickets_qr where booking_id = (select id from double_vendor)), 1,
  'with its ticket issued');
select ok((select a.details ->> 'split_error' like 'P0001: revenue rule % pays one beneficiary twice in line addon:%'
           from public.security_alerts a join public.payments p on p.booking_id = (select id from double_vendor)
           where a.fingerprint = 'payment_review:REVENUE_RULE_REFUSED:' || p.order_id),
  'and its alert says why, so a fault in the split is not taken for a missing rule');

-- ===== No rule in force, and the poll's retry once one is (M3) =====
update public.revenue_share_rules set is_active = false where scope = 'addon_default' and rw_id = 5 and is_active;
create temporary table no_rule on commit drop as
  select pg_temp.hold('00000000-0000-4000-8000-0000000f1001', array['00000000-0000-4000-8000-0000000f2001']::uuid[],
    '[{"product_id": "00000000-0000-4000-8000-0000000f0a03", "qty": 3}]', array[5]::smallint[], '+6281300003102')
    as id;
-- Settled ten minutes ago, past the two minutes the poll leaves a fresh settlement to its webhook.
create temporary table no_rule_order on commit drop as
  select pg_temp.settle((select id from no_rule),
    to_char(now() at time zone 'Asia/Jakarta' - interval '10 minutes', 'YYYY-MM-DD HH24:MI:SS')) as order_id;
select is(pg_temp.review_of((select id from no_rule)), 'paid/true/REVENUE_RULE_REFUSED/0',
  'an add-on whose RW has no add-on default in force is refused into the review');
select ok((select e.payload ->> 'split_error' like 'P0001: product % has 0 revenue-share rules in force on %'
           from public.booking_events e
           where e.booking_id = (select id from no_rule) and e.reason = 'revenue_rule_refused'),
  'with the refusal in the booking''s history too');
select is((select reason from internal.payments_to_poll(50) where order_id = (select order_id from no_rule_order)),
  'paid_incomplete', 'the poll lists it, though it is under review, since only its split keeps it there');
select is(internal.complete_paid_order((select order_id from no_rule_order), 'k1') ->> 'result', 'ignored',
  'while no rule covers the settlement''s day, the retry writes nothing');
select is((select count(*)::int from public.booking_events
           where booking_id = (select id from no_rule) and reason = 'revenue_rule_refused'), 1,
  'and raises no second review');
-- The rule that fixes it must cover the settlement's own Jakarta day.
select pg_temp.rule('addon_default', null, null,
  (select (p.settlement_time at time zone 'Asia/Jakarta')::date from public.payments p
   where p.order_id = (select order_id from no_rule_order)), null,
  '[{"beneficiary": "umkm_vendor", "pct": 90}, {"beneficiary": "rw_treasury", "rw_id": 5, "pct": 10}]');
select is(internal.complete_paid_order((select order_id from no_rule_order), 'k1') ->> 'result', 'applied',
  'once a rule covers the settlement''s Jakarta day, the poll writes the ledger');
select is((select sum(amount)::bigint from public.revenue_share_entries where booking_id = (select id from no_rule)),
  (select total_amount from public.bookings where id = (select id from no_rule)), 'for the booking''s whole total');
select is((select needs_review from public.bookings where id = (select id from no_rule)), true,
  'and leaves the review for staff to close');
select ok(not exists (select 1 from internal.payments_to_poll(50) where order_id = (select order_id from no_rule_order)),
  'after which the poll leaves the booking alone');

-- ===== Two rules in force, which only rules written past the constraint can be =====
set constraints revenue_share_rules_no_overlap deferred;
select pg_temp.rule('product', null, '00000000-0000-4000-8000-0000000f0a04', '2026-01-01', null,
  '[{"beneficiary": "umkm_vendor", "pct": 90}, {"beneficiary": "rw_treasury", "rw_id": 5, "pct": 10}]')
from generate_series(1, 2);
create temporary table two_rules on commit drop as
  select pg_temp.hold('00000000-0000-4000-8000-0000000f1001', array['00000000-0000-4000-8000-0000000f2001']::uuid[],
    '[{"product_id": "00000000-0000-4000-8000-0000000f0a04", "qty": 3}]', array[5]::smallint[], '+6281300003103')
    as id;
select pg_temp.settle((select id from two_rules), pg_temp.now_jkt());
select is(pg_temp.review_of((select id from two_rules)), 'paid/true/REVENUE_RULE_REFUSED/0',
  'two rules in force for one product are refused, never picked between');

-- ===== Which rule applies, and who wins a tie =====
select pg_temp.rule('package', '00000000-0000-4000-8000-0000000f1002', null, '2026-01-01', null,
  '[{"beneficiary": "kelurahan", "pct": 50}, {"beneficiary": "rw_treasury", "rw_id": 5, "pct": 50}]');
create temporary table tie on commit drop as
  select pg_temp.hold('00000000-0000-4000-8000-0000000f1002', array['00000000-0000-4000-8000-0000000f2002']::uuid[],
    '[]', array[5]::smallint[], '+6281300003104') as id;
select pg_temp.settle((select id from tie), pg_temp.now_jkt());
select is(pg_temp.ledger((select id from tie), 'package'), array['kelurahan=500001', 'rw:5=500000'],
  'a package''s own 50/50 rule beats its RW''s default, and the kelurahan wins the tie over Rp 1.000.001');

-- The combo carries a rule of its own in the shape of the combo default before 2026-10-29 (20261105160000), so the
-- kelurahan's line still has a remainder to win.
select pg_temp.rule('package', '00000000-0000-4000-8000-0000000f1003', null, '2026-01-01', null,
  '[{"beneficiary": "kelurahan", "pct": 20}, {"beneficiary": "rw_treasury", "pct": 80}]');
create temporary table three_legs on commit drop as
  select pg_temp.hold('00000000-0000-4000-8000-0000000f1003',
    array['00000000-0000-4000-8000-0000000f2003', '00000000-0000-4000-8000-0000000f2013',
          '00000000-0000-4000-8000-0000000f2008']::uuid[], '[]', array[5, 13, 8]::smallint[], '+6281300003105') as id;
select pg_temp.settle((select id from three_legs), pg_temp.now_jkt());
select is(pg_temp.ledger((select id from three_legs), 'package'),
  array['kelurahan=200001', 'rw:13=266667', 'rw:5=266668', 'rw:8=266667'],
  'a three-leg combo of Rp 1.000.003: the kelurahan''s spare rupiah first, then the first leg''s');
select is((select sum(amount)::bigint from public.revenue_share_entries where booking_id = (select id from three_legs)),
  1000003::bigint, 'adding up to the payment exactly');

select pg_temp.rule('product', null, '00000000-0000-4000-8000-0000000f0a02', '2026-01-01', null,
  '[{"beneficiary": "umkm_vendor", "pct": 80}, {"beneficiary": "rw_treasury", "rw_id": 5, "pct": 20}]');
create temporary table product_rule on commit drop as
  select pg_temp.hold('00000000-0000-4000-8000-0000000f1001', array['00000000-0000-4000-8000-0000000f2001']::uuid[],
    '[{"product_id": "00000000-0000-4000-8000-0000000f0a02", "qty": 3}]', array[5]::smallint[], '+6281300003106')
    as id;
select pg_temp.settle((select id from product_rule), pg_temp.now_jkt());
select is(pg_temp.ledger((select id from product_rule), 'addon:%'),
  array['rw:5=9001', 'vendor:00000000-0000-4000-8000-0000000f0051=36002'],
  'a product''s own 80/20 rule beats the add-on default for Rp 45.003');

-- ===== The Jakarta day picks the rule =====
select pg_temp.rule('package', '00000000-0000-4000-8000-0000000f1004', null, '2026-01-01', '2026-10-19',
  '[{"beneficiary": "kelurahan", "pct": 30}, {"beneficiary": "rw_treasury", "rw_id": 5, "pct": 70}]');
select pg_temp.rule('package', '00000000-0000-4000-8000-0000000f1004', null, '2026-10-20', null,
  '[{"beneficiary": "kelurahan", "pct": 40}, {"beneficiary": "rw_treasury", "rw_id": 5, "pct": 60}]');
create temporary table after_midnight on commit drop as
  select pg_temp.hold('00000000-0000-4000-8000-0000000f1004', array['00000000-0000-4000-8000-0000000f2004']::uuid[],
    '[]', array[5]::smallint[], '+6281300003107') as id;
select pg_temp.settle((select id from after_midnight), '2026-10-20 00:30:00');
create temporary table before_midnight on commit drop as
  select pg_temp.hold('00000000-0000-4000-8000-0000000f1004', array['00000000-0000-4000-8000-0000000f2004']::uuid[],
    '[]', array[5]::smallint[], '+6281300003108') as id;
select pg_temp.settle((select id from before_midnight), '2026-10-19 23:30:00');
select is(pg_temp.ledger((select id from after_midnight), 'package'), array['kelurahan=240000', 'rw:5=360000'],
  'a settlement at 00:30 in Jakarta, still the day before in UTC, follows the rule of the new Jakarta day');
select is(pg_temp.ledger((select id from before_midnight), 'package'), array['kelurahan=180000', 'rw:5=420000'],
  'and one at 23:30 the rule of the day before');

select * from finish();
rollback;
