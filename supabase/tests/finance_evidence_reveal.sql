-- Review of PR #80, M-3 (docs/Security.md §6.6, §10.3; 20261104190500): the superadmin at AAL2 alone names the
-- evidence of an adjustment or the proof of a payout to sign a 300 s link to, and every view is a pii_revealed
-- security event of payment_adjustments or payout_batches, apart from the booking reveals' daily cap.
begin;
select plan(10);
\ir helpers/rls_personas.psql

-- ===== Fixtures: a paid booking with an adjustment's evidence, and a payout's proof =====
insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000f8001', 5, 'regular', 'uji-bukti', 'Paket Uji Bukti', 25000, 'published');
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, institution_name, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  amount_paid, consent_version, consented_at, paid_at)
values ('00000000-0000-4000-8000-0000000f8002', 'GSK-BK7R0001', 'paid', '00000000-0000-4000-8000-0000000f8001', '{}',
        '{5}', 'school', 'Bu Bukti', '+6281234560981', 'bukti@example.test', 'SD Uji Bukti', 4,
        public.today_jkt() + 10, public.today_jkt() + 10, 100000, 100000, 100000, 'v1', now(), now());
insert into public.payment_adjustments (id, booking_id, type, amount, reason, evidence_path, proposed_by)
values ('00000000-0000-4000-8000-0000000f8003', '00000000-0000-4000-8000-0000000f8002', 'write_off', 1000,
        'Selisih pembulatan uji bukti',
        'bookings/00000000-0000-4000-8000-0000000f8002/adjustment-00000000-0000-4000-8000-0000000f8004.pdf',
        '00000000-0000-4000-8000-00000000f001');
select set_config('app.in_rpc', '', true);
insert into public.payout_batches (id, beneficiary_key, period_from, period_to, total_amount, paid_at, reference,
  proof_path, created_by)
values ('00000000-0000-4000-8000-0000000f8005', 'rw:5', public.today_jkt() - 7, public.today_jkt() - 1, 50000, now(),
        'TRF-BUKTI-1', 'payouts/00000000-0000-4000-8000-0000000f8005/bukti.pdf', '00000000-0000-4000-8000-00000000f001');

-- ===== Who =====
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.rpc_reveal_finance_evidence('payout', '00000000-0000-4000-8000-0000000f8005')$$,
  '42501', null, 'an RW admin opens no finance evidence');
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select public.rpc_reveal_finance_evidence('payout', '00000000-0000-4000-8000-0000000f8005')$$,
  '42501', null, 'nor does the superadmin at AAL1');
reset role;

-- ===== The superadmin at AAL2 =====
select pg_temp.act_as('superadmin_aal2');
select is(public.rpc_reveal_finance_evidence('adjustment', '00000000-0000-4000-8000-0000000f8003'),
  'bookings/00000000-0000-4000-8000-0000000f8002/adjustment-00000000-0000-4000-8000-0000000f8004.pdf',
  'names an adjustment''s evidence');
select is(public.rpc_reveal_finance_evidence('payout', '00000000-0000-4000-8000-0000000f8005'),
  'payouts/00000000-0000-4000-8000-0000000f8005/bukti.pdf', 'and a payout''s proof');
select throws_ok($$select public.rpc_reveal_finance_evidence('booking', '00000000-0000-4000-8000-0000000f8002')$$,
  '22023', null, 'and nothing but those two');
select throws_ok($$select public.rpc_reveal_finance_evidence('payout', '00000000-0000-4000-8000-0000000f8999')$$,
  'P0002', null, 'a payout that does not exist has no evidence');
reset role;

select is((select count(*)::int from public.security_events
           where event_type = 'pii_revealed' and entity_type = 'payment_adjustments'
             and entity_id = '00000000-0000-4000-8000-0000000f8003'
             and actor_id = '00000000-0000-4000-8000-00000000f001'), 1,
  'each view is a pii_revealed event of the adjustment');
select is((select count(*)::int from public.security_events
           where event_type = 'pii_revealed' and entity_type = 'payout_batches'
             and entity_id = '00000000-0000-4000-8000-0000000f8005'), 1, 'or of the payout');
select is((select details ->> 'document' from public.security_events
           where event_type = 'pii_revealed' and entity_type = 'payout_batches'
             and entity_id = '00000000-0000-4000-8000-0000000f8005'), 'evidence', 'naming no path, only the kind');
select is((select count(*)::int from public.security_events
           where event_type = 'pii_revealed' and entity_type = 'bookings'
             and actor_id = '00000000-0000-4000-8000-00000000f001'), 0,
  'and none of them spends the booking reveals'' daily cap');

select * from finish();
rollback;
