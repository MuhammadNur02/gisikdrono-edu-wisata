-- Ticket revenue to the RWs (decision of 2026-10-29, docs/PRD.md §13.1 A4 as revised, 20261105160000): every default
-- package rule in force pays the RW treasuries all of it and the kelurahan nothing; a combo's default splits it equally
-- over the booking's RWs by largest remainder; the versions they replaced are closed, not changed; RW 13 is covered;
-- a settlement writes the new split; and the superadmin can still set another version through save_revenue_rule.
begin;
select plan(16);
\ir helpers/rls_personas.psql
select set_config('app.qr_key_id', 'k1', true);

create function pg_temp.in_force_default(p_rw_id smallint) returns uuid
  language sql
as $$
  select r.id from public.revenue_share_rules r
  where r.scope = 'package_default' and r.rw_id is not distinct from p_rw_id and r.package_id is null
    and r.product_id is null and r.is_active
    and r.effective_from <= public.today_jkt() and (r.effective_to is null or r.effective_to >= public.today_jkt());
$$;
create function pg_temp.lines_of(p_rule uuid) returns text
  language sql
as $$
  select string_agg(l.beneficiary || coalesce('/' || l.rw_id, '/legs') || '=' || l.pct, ' ' order by l.beneficiary)
  from public.revenue_share_rule_lines l where l.rule_id = p_rule;
$$;

-- ===== The defaults in force =====
select is(pg_temp.lines_of(pg_temp.in_force_default(5::smallint)), 'rw_treasury/5=100.00',
  'RW 05''s package default pays its own treasury all of it');
select is(pg_temp.lines_of(pg_temp.in_force_default(8::smallint)), 'rw_treasury/8=100.00',
  'so does RW 08''s');
select is(pg_temp.lines_of(pg_temp.in_force_default(13::smallint)), 'rw_treasury/13=100.00',
  'and RW 13''s, the RW of 20261022080000');
select is(pg_temp.lines_of(pg_temp.in_force_default(null)), 'rw_treasury/legs=100.00',
  'the combo default pays the RWs of the booking''s legs all of it, in equal parts');
select is(
  (select count(*)::int from public.revenue_share_rules r join public.revenue_share_rule_lines l on l.rule_id = r.id
   where r.scope = 'package_default' and r.package_id is null and r.product_id is null and r.is_active
     and r.effective_from <= public.today_jkt() and (r.effective_to is null or r.effective_to >= public.today_jkt())
     and l.beneficiary = 'kelurahan'),
  0,
  'no default package rule in force pays the kelurahan'
);
select ok(
  (select bool_and(internal.has_current_default_rules(u.id)) from public.rw_units u where u.is_active),
  'every RW online keeps the default rules it needs to stay online'
);

-- ===== The versions they replaced: closed, not changed =====
select is(
  (select count(distinct coalesce(r.rw_id, 0))::int from public.revenue_share_rules r
   where r.scope = 'package_default' and r.package_id is null and r.product_id is null
     and (r.rw_id in (5, 8, 13) or r.rw_id is null)
     and exists (select 1 from public.revenue_share_rule_lines l where l.rule_id = r.id and l.beneficiary = 'kelurahan')
     and (not r.is_active or r.effective_to < public.today_jkt())),
  4,
  'the 20/80 versions of RW 05, RW 08, RW 13 and the combo are still there, out of force'
);
select is(
  (select string_agg(distinct (select sum(l.pct) from public.revenue_share_rule_lines l where l.rule_id = r.id)::text, ',')
   from public.revenue_share_rules r
   where r.scope = 'package_default' and r.package_id is null and r.product_id is null),
  '100.00',
  'with their lines as they were, every version adding up to 100 %'
);

-- ===== Which rule a settlement today follows =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000b1005', 5, 'regular', 'uji-kas-rw-05', 'Paket Kas RW 05', 'per_pax', 33333,
   'published'),
  ('00000000-0000-4000-8000-0000000b1013', 13, 'regular', 'uji-kas-rw-13', 'Paket Kas RW 13', 'per_pax', 25000, 'draft');
insert into public.tour_packages (id, category, slug, name, pricing_basis, flat_price, status) values
  ('00000000-0000-4000-8000-0000000b1099', 'combo', 'uji-kas-rw-kombo', 'Kombo Kas RW', 'flat_group', 1000001, 'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000b1099', 5, 1), ('00000000-0000-4000-8000-0000000b1099', 13, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000b1099';
select is(internal.resolve_package_rule('00000000-0000-4000-8000-0000000b1013', public.today_jkt()),
  pg_temp.in_force_default(13::smallint), 'an RW 13 package settles under RW 13''s new default');
select is(internal.resolve_package_rule('00000000-0000-4000-8000-0000000b1099', public.today_jkt()),
  pg_temp.in_force_default(null), 'a combo under the new combo default');

-- ===== A settlement writes the new split =====
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000b2005', 5, public.today_jkt() + 5, '09:10', '10:10', 'Uji kas 05', 200),
  ('00000000-0000-4000-8000-0000000b2006', 5, public.today_jkt() + 5, '11:10', '12:10', 'Uji kas kombo 05', 200),
  ('00000000-0000-4000-8000-0000000b2013', 13, public.today_jkt() + 5, '13:10', '14:10', 'Uji kas kombo 13', 200);

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
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Kas', 'pic_name', 'Ani Kas',
                       'pic_phone', p_phone, 'pic_email', 'kas@contoh.test', 'notes', null),
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

create function pg_temp.ledger(p_booking uuid) returns text[]
  language sql
as $$
  select array_agg(e.beneficiary_key || '=' || e.amount order by e.beneficiary_key)
  from public.revenue_share_entries e where e.booking_id = p_booking and e.entry_type = 'settlement';
$$;

create temporary table regular on commit drop as
  select pg_temp.hold('00000000-0000-4000-8000-0000000b1005', array['00000000-0000-4000-8000-0000000b2005']::uuid[],
    array[5]::smallint[], '+6281300009901') as id;
select pg_temp.settle((select id from regular));
select is(pg_temp.ledger((select id from regular)), array['rw:5=666660'],
  'an RW 05 visit of Rp 666.660 pays RW 05 every rupiah, in one row');

create temporary table combo on commit drop as
  select pg_temp.hold('00000000-0000-4000-8000-0000000b1099',
    array['00000000-0000-4000-8000-0000000b2006', '00000000-0000-4000-8000-0000000b2013']::uuid[],
    array[5, 13]::smallint[], '+6281300009902') as id;
select pg_temp.settle((select id from combo));
select is(pg_temp.ledger((select id from combo)), array['rw:13=500000', 'rw:5=500001'],
  'a combo of Rp 1.000.001 pays RW 05 and RW 13 half each, the spare rupiah to the earlier leg');
select is(
  (select count(*)::int from public.revenue_share_entries e
   where e.booking_id in ((select id from regular), (select id from combo)) and e.beneficiary = 'kelurahan'),
  0,
  'and the kelurahan gets no ledger row from either'
);
select is((internal.verify_ledger_chain() ->> 'ok')::boolean, true, 'the ledger''s hash chain still verifies');

-- ===== The superadmin can still change it (/dashboard/finance/revenue-share) =====
select pg_temp.act_as('superadmin_aal2');
select lives_ok(
  $$select public.save_revenue_rule('package_default', 'Uji versi berikutnya RW 05', public.today_jkt() + 1,
      '[{"beneficiary": "kelurahan", "pct": 10}, {"beneficiary": "rw_treasury", "rw_id": 5, "pct": 90}]', 5::smallint)$$,
  'save_revenue_rule writes a next version of RW 05''s default from tomorrow'
);
reset role;
select is(
  (select r.effective_to from public.revenue_share_rules r where r.id = pg_temp.in_force_default(5::smallint)),
  public.today_jkt(),
  'which closes today''s version tonight, as for any other rule'
);

select * from finish();
rollback;
