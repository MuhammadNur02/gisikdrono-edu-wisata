-- Task P3.9.01 (docs/PRD.md §11.2; REC-06, REC-10, REC-14): the ledger a settlement writes and a refund reverses. The
-- rows of a payment add up to its amount exactly, odd amounts and ties included; a second allocation writes nothing; the
-- chain verifies; a refused split leaves the settlement standing under review; a reversal mirrors the settlement.
begin;
select plan(19);
\ir helpers/addons_on.psql
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: an RW 05 package with an add-on, and a flat-priced combo of RW 05 and RW 13 =====
insert into public.umkm_vendors (id, rw_id, slug, name) values
  ('00000000-0000-4000-8000-0000000d0051', 5, 'uji-buku-vendor', 'Vendor Uji Buku');
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price, unit_label, is_addon_eligible,
  status) values
  ('00000000-0000-4000-8000-0000000d0a05', 5, '00000000-0000-4000-8000-0000000d0051', 'uji-buku-kompos', 'Kompos Buku',
   'compost', 15001, 'kantong', true, 'published');
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000d1001', 5, 'regular', 'uji-buku-paket', 'Paket Uji Buku', 'per_pax', 33333,
   'published');
insert into public.tour_packages (id, category, slug, name, pricing_basis, flat_price, status) values
  ('00000000-0000-4000-8000-0000000d1002', 'combo', 'uji-buku-kombo', 'Kombo Uji Buku', 'flat_group', 1000001, 'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000d1002', 5, 1), ('00000000-0000-4000-8000-0000000d1002', 13, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000d1002';
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000d2001', 5, public.today_jkt() + 5, '09:05', '10:05', 'Uji buku 05', 200),
  ('00000000-0000-4000-8000-0000000d2002', 5, public.today_jkt() + 5, '11:05', '12:05', 'Uji buku kombo 05', 200),
  ('00000000-0000-4000-8000-0000000d2013', 13, public.today_jkt() + 5, '13:05', '14:05', 'Uji buku kombo 13', 200);

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
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Buku', 'pic_name', 'Ani Buku',
                       'pic_phone', p_phone, 'pic_email', 'buku@contoh.test', 'notes', null),
    p_addons, '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote(p_package, 20, p_addons, p_rws))) ->> 'booking_id')::uuid;
$$;

-- An attempt for the booking's total and its confirmed settlement; returns the order id.
create function pg_temp.settle(p_booking uuid) returns text
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
  return order_id;
end;
$$;

create function pg_temp.ledger(p_booking uuid) returns table (line_ref text, beneficiary_key text, amount bigint)
  language sql
as $$
  select e.line_ref, e.beneficiary_key, e.amount from public.revenue_share_entries e
  where e.booking_id = p_booking and e.entry_type = 'settlement' order by e.id;
$$;

-- ===== A package with an add-on =====
create temporary table regular on commit drop as
  select pg_temp.hold('00000000-0000-4000-8000-0000000d1001', array['00000000-0000-4000-8000-0000000d2001']::uuid[],
    '[{"product_id": "00000000-0000-4000-8000-0000000d0a05", "qty": 3}]', array[5]::smallint[], '+6281300000901') as id;
select pg_temp.settle((select id from regular));
select is((select sum(amount)::bigint from pg_temp.ledger((select id from regular))),
  (select total_amount from public.bookings where id = (select id from regular)),
  'the settlement rows add up to the booking''s total, odd amounts included');
select is((select array_agg(beneficiary_key || '=' || amount order by line_ref, beneficiary_key)
           from pg_temp.ledger((select id from regular)) where line_ref = 'package'),
  array['rw:5=666660'],
  'the package line pays RW 05 all of it and the kelurahan nothing (decision of 2026-10-29)');
select is((select array_agg(beneficiary_key || '=' || amount order by beneficiary_key)
           from pg_temp.ledger((select id from regular)) where line_ref like 'addon:%'),
  array['rw:5=4500', 'vendor:00000000-0000-4000-8000-0000000d0051=40503'],
  'an add-on pays its vendor 90 % and its RW 10 %');
select is((select rule_version -> 'lines' is not null and rule_version ->> 'scope' = 'package_default'
           from public.revenue_share_entries where booking_id = (select id from regular) and line_ref = 'package'
           limit 1), true, 'each row keeps the rule it was split by');
select is(internal.allocate_revenue_share((select id from regular),
            (select id from public.payments where booking_id = (select id from regular) and status = 'settled')) ->> 'result',
  'already_allocated', 'a second allocation writes nothing');
select is((select count(*)::int from pg_temp.ledger((select id from regular))), 3, 'so the rows stay three');

-- ===== A combo of an odd amount: the tie goes to the earlier leg (decision of 2026-10-22, Q1) =====
create temporary table combo on commit drop as
  select pg_temp.hold('00000000-0000-4000-8000-0000000d1002',
    array['00000000-0000-4000-8000-0000000d2002', '00000000-0000-4000-8000-0000000d2013']::uuid[], '[]',
    array[5, 13]::smallint[], '+6281300000902') as id;
select pg_temp.settle((select id from combo));
select is((select array_agg(beneficiary_key || '=' || amount order by beneficiary_key)
           from pg_temp.ledger((select id from combo))),
  array['rw:13=500000', 'rw:5=500001'],
  'Rp 1.000.001 pays the two RWs half each, the spare rupiah to RW 05''s earlier leg');
select is((select sum(amount)::bigint from pg_temp.ledger((select id from combo))), 1000001::bigint,
  'and adds up to the payment exactly');

-- ===== The chain =====
select is((internal.verify_ledger_chain() ->> 'ok')::boolean, true, 'the ledger''s hash chain verifies');

-- ===== A split the rules refuse: the settlement stands, the booking waits for a person =====
create temporary table refused on commit drop as
  select pg_temp.hold('00000000-0000-4000-8000-0000000d1001', array['00000000-0000-4000-8000-0000000d2001']::uuid[],
    '[{"product_id": "00000000-0000-4000-8000-0000000d0a05", "qty": 3}]', array[5]::smallint[], '+6281300000903') as id;
update public.bookings set discount_amount = subtotal_package + 1, total_amount = subtotal_addons - 1
where id = (select id from refused);
select pg_temp.settle((select id from refused));
select is((select (status::text, needs_review, review_reason) from public.bookings where id = (select id from refused))::text,
  ('paid', true, 'REVENUE_RULE_REFUSED')::text,
  'a discount larger than the package line is refused: the booking is paid and waits under review');
select is((select count(*)::int from public.revenue_share_entries where booking_id = (select id from refused)), 0,
  'with no half-written ledger');
select is((select status::text from public.payments where booking_id = (select id from refused)), 'settled',
  'and the settlement stands');
select ok(exists (select 1 from public.security_alerts
                  where fingerprint like 'payment_review:REVENUE_RULE_REFUSED:%' and severity = 'high'),
  'with a high alert');

-- ===== A refund's reversal mirrors the settlement (Task P4.7.03 writes it) =====
select is(internal.reverse_revenue_share((select id from regular), 100001, 'refund-1', 'pgTAP') ->> 'amount', '-100001',
  'a partial refund reverses its amount');
select is((select sum(amount)::bigint from public.revenue_share_entries
           where booking_id = (select id from regular) and entry_type = 'reversal'), -100001::bigint,
  'in negative rows that add up to it exactly');
select ok((select bool_and(r.amount <= 0 and r.beneficiary_key = s.beneficiary_key)
           from public.revenue_share_entries r
           join public.revenue_share_entries s on s.booking_id = r.booking_id and s.line_ref = r.line_ref
             and s.beneficiary_key = r.beneficiary_key and s.entry_type = 'settlement'
           where r.booking_id = (select id from regular) and r.entry_type = 'reversal'),
  'each one against a settlement row of its own');
select throws_ok($$select internal.reverse_revenue_share((select id from regular),
  (select total_amount from public.bookings where id = (select id from regular)), 'refund-2', 'pgTAP')$$,
  'P0001', null,
  'more than is left to give back is refused');
select is((internal.verify_ledger_chain() ->> 'ok')::boolean, true, 'and the chain still verifies');
select throws_ok($$update public.revenue_share_entries set amount = 0 where booking_id = (select id from regular)$$,
  '42501', null, 'the ledger is never edited');

select * from finish();
rollback;
