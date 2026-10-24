-- Review of PR #42, M2 (docs/PRD.md §11.2; REC-06, REC-08): a refund's reversal rows follow what each ledger row still
-- holds. Two partial refunds and then the rest give every row back exactly what it was paid, a row of one rupiah is
-- never reversed twice, and a refund retried under its own reference writes nothing again. The ledger rows are written
-- directly here, so the amounts are the ones the cases need; record_refund (Task P4.7.03) will be the real caller.
begin;
select plan(15);

-- ===== Fixtures: a paid booking whose ledger holds 1, 999 and 3333 =====
insert into public.tour_packages (id, rw_id, category, slug, name, tagline, duration_minutes, price_per_pax, status)
values ('00000000-0000-4000-9000-000000000601', 5, 'student', 'uji-balik-paket', 'Paket Uji Balik', 'Uji', 120, 25000,
        'published');
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, amount_paid,
  consent_version, consented_at, paid_at)
values ('00000000-0000-4000-9000-000000000621', 'GSK-REFVND01', 'paid', '00000000-0000-4000-9000-000000000601', '{}',
        '{5}', 'school', 'Bu Rani', '+6281234560621', 'balik@example.test', 4, public.today_jkt() + 30,
        public.today_jkt() + 30, 4333, 4333, 4333, 'v1', now(), now());
select set_config('app.in_rpc', '', true);
insert into public.revenue_share_entries (booking_id, entry_type, line_ref, rule_version, beneficiary, beneficiary_key,
  rw_id, base_amount, pct, amount, entry_hash)
values
  ('00000000-0000-4000-9000-000000000621', 'settlement', 'package', '{"lines": 3}', 'kelurahan', 'kelurahan', null,
   4333, 0.02, 1, 'set-by-the-chain'),
  ('00000000-0000-4000-9000-000000000621', 'settlement', 'package', '{"lines": 3}', 'rw_treasury', 'rw:5', 5,
   4333, 23.06, 999, 'set-by-the-chain'),
  ('00000000-0000-4000-9000-000000000621', 'settlement', 'package', '{"lines": 3}', 'umkm_vendor', 'vendor:uji', null,
   4333, 76.92, 3333, 'set-by-the-chain');

-- What each settlement row still holds once the reversals so far are taken off, in the rows' order.
create function pg_temp.balances() returns text[]
  language sql
as $$
  select array_agg(s.beneficiary_key || '=' || (s.amount + coalesce(
           (select sum(r.amount) from public.revenue_share_entries r
            where r.booking_id = s.booking_id and r.entry_type = 'reversal' and r.line_ref = s.line_ref
              and r.beneficiary_key = s.beneficiary_key), 0)) order by s.id)
  from public.revenue_share_entries s
  where s.booking_id = '00000000-0000-4000-9000-000000000621' and s.entry_type = 'settlement';
$$;

-- One refund's rows, in the rows' order.
create function pg_temp.refund_rows(p_reference text) returns text[]
  language sql
as $$
  select array_agg(r.beneficiary_key || '=' || r.amount order by r.id) from public.revenue_share_entries r
  where r.booking_id = '00000000-0000-4000-9000-000000000621' and r.entry_type = 'reversal'
    and r.rule_version ->> 'refund_reference' = p_reference;
$$;

-- ===== Two partial refunds, then the rest =====
select is(internal.reverse_revenue_share('00000000-0000-4000-9000-000000000621', 1000, 'refund-1', 'pgTAP') ->> 'result',
  'reversed', 'a first partial refund of Rp 1.000 is reversed');
select is(pg_temp.refund_rows('refund-1'), array['rw:5=-231', 'vendor:uji=-769'],
  'over what the rows hold, the one-rupiah row giving nothing yet');
select is(pg_temp.balances(), array['kelurahan=1', 'rw:5=768', 'vendor:uji=2564'], 'which leaves Rp 3.333');

select is(internal.reverse_revenue_share('00000000-0000-4000-9000-000000000621', 3000, 'refund-2', 'pgTAP') ->> 'amount',
  '-3000', 'a second partial refund of Rp 3.000');
select is(pg_temp.refund_rows('refund-2'), array['kelurahan=-1', 'rw:5=-691', 'vendor:uji=-2308'],
  'is split over what is left, not over what was first paid');
select is(pg_temp.balances(), array['kelurahan=0', 'rw:5=77', 'vendor:uji=256'],
  'so no row gives back more than it holds');

select is(internal.reverse_revenue_share('00000000-0000-4000-9000-000000000621', 333, 'refund-3', 'pgTAP') ->> 'amount',
  '-333', 'and the last Rp 333');
select is(pg_temp.balances(), array['kelurahan=0', 'rw:5=0', 'vendor:uji=0'],
  'gives every row back exactly what it was paid');

-- ===== A retried refund =====
select is(internal.reverse_revenue_share('00000000-0000-4000-9000-000000000621', 3000, 'refund-2', 'pgTAP') ->> 'result',
  'already_reversed', 'record_refund retried with the same reference finds its own rows');
select is((select count(*)::int from public.revenue_share_entries
           where booking_id = '00000000-0000-4000-9000-000000000621' and entry_type = 'reversal'), 7,
  'and writes no second set');
select throws_ok($$select internal.reverse_revenue_share('00000000-0000-4000-9000-000000000621', 2999, 'refund-2',
  'pgTAP')$$, 'P0001', null, 'the same reference with another amount is refused');
select throws_ok($$select internal.reverse_revenue_share('00000000-0000-4000-9000-000000000621', 1, 'refund-4',
  'pgTAP')$$, 'P0001', null, 'and nothing more can be given back once everything was');
select throws_ok($$select internal.reverse_revenue_share('00000000-0000-4000-9000-000000000621', 1, '  ', 'pgTAP')$$,
  '22023', null, 'a reversal always names its refund');
select throws_ok($$insert into public.revenue_share_entries (booking_id, entry_type, line_ref, rule_version,
    beneficiary, beneficiary_key, rw_id, base_amount, pct, amount, entry_hash)
  values ('00000000-0000-4000-9000-000000000621', 'reversal', 'package', '{"refund_reference": "refund-3"}',
          'rw_treasury', 'rw:5', 5, -333, 23.06, -77, 'set-by-the-chain')$$,
  '23505', null, 'and the ledger itself refuses a second row of one refund for one beneficiary');

select is((internal.verify_ledger_chain() ->> 'ok')::boolean, true, 'the chain still verifies');

select * from finish();
rollback;
