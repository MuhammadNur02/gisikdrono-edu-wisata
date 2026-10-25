-- Task P4.7.03 (docs/PRD.md §9.2, §10.3; docs/Security.md REC-08, REC-09, REC-16, AUTH-11): a refund is recorded once
-- with its proof, a whole refund refunds the booking, revokes its tickets, frees its seats and voids its invoice under
-- a credit note, and the ledger gives back each party's share as it stands; an adjustment is proposed with evidence,
-- approved by another superadmin who meets REC-16 (or by its proposer alone after 24 hours), and applied once.
-- Review of PR #68: a duplicate payment's refund (M1), a partial refund without a ledger (M2), a refund of money held
-- for review (M5), and the Lows L2, L4, L5 and L9.
begin;
select plan(80);
\ir helpers/rls_personas.psql

-- ===== Fixtures: RW 05 and combo packages and two superadmins old enough to approve =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000f1001', 5, 'student', 'uji-refund', 'Paket Uji Refund', 'per_pax', 30000,
   'published');
insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000f1002', 'combo', 'uji-refund-kombo', 'Kombo Uji Refund', 'per_pax', 30000, 'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000f1002', 5, 1), ('00000000-0000-4000-8000-0000000f1002', 8, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000f1002';
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000f2001', 5, public.today_jkt() + 6, '09:00', '10:00', 'Uji refund', 200),
  ('00000000-0000-4000-8000-0000000f2002', 8, public.today_jkt() + 6, '13:00', '14:00', 'Uji refund 08', 200);

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000f002', 'rls-super-b@example.test');
insert into public.profiles (id, email, full_name, role, rw_id) values
  ('00000000-0000-4000-8000-00000000f002', 'rls-super-b@example.test', 'Super B', 'superadmin', null);
update public.profiles set created_at = now() - interval '40 days'
where id in ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000f002');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000f001', 'uji-a', 'totp', 'verified', now() - interval '39 days',
   now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000f002', 'uji-b', 'totp', 'verified', now() - interval '39 days',
   now());
-- Other superadmins of the local stack stay out of the one-superadmin count of these cases.
create temporary table other_supers on commit drop as
  select id from public.profiles
  where role = 'superadmin' and is_active
    and id not in ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000f002');
select set_config('request.jwt.claims', '', true);
select set_config('app.privileged_rpc', 'on', true);
update public.profiles set is_active = false where id in (select id from other_supers);
select set_config('app.privileged_rpc', '', true);

-- Superadmin B, signed in at AAL2 with a fresh code, as GoTrue would send it.
create function pg_temp.act_as_super_b() returns void
  language plpgsql
as $$
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
$$;

-- A proof or evidence file as the server leaves it in the documents bucket (L7), named back for the call.
create function pg_temp.doc(p_path text) returns text
  language plpgsql security definer
as $$
begin
  insert into storage.objects (bucket_id, name) values ('documents', p_path) on conflict do nothing;
  return p_path;
end;
$$;
grant execute on function pg_temp.doc(text) to authenticated;

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

-- A booking of 10 at Rp 30.000, paid through Midtrans: Rp 300.000, its tickets, invoice and ledger.
create function pg_temp.paid_booking(p_phone text,
  p_package uuid default '00000000-0000-4000-8000-0000000f1001',
  p_sessions uuid[] default array['00000000-0000-4000-8000-0000000f2001']::uuid[]) returns uuid
  language plpgsql
as $$
declare
  rws smallint[] := coalesce(
    nullif(array(select l.rw_id from public.tour_package_legs l where l.package_id = p_package order by l.leg_order),
           '{}'),
    array(select p.rw_id from public.tour_packages p where p.id = p_package));
  booking_id uuid := (internal.create_booking(p_package, p_sessions, 10,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Uji Refund', 'pic_name', 'Ani Refund',
                       'pic_phone', p_phone, 'pic_email', 'refund@contoh.test', 'notes', null),
    '[]', '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote(p_package, 10, '[]', rws))) ->> 'booking_id')::uuid;
  total bigint := (select b.total_amount from public.bookings b where b.id = booking_id);
  attempt jsonb := internal.create_payment_attempt(booking_id, null, null);
  answer jsonb := jsonb_build_object('order_id', attempt ->> 'order_id', 'status_code', '200',
    'gross_amount', total || '.00', 'signature_key', repeat('a', 128), 'transaction_status', 'settlement',
    'transaction_id', 'txn-' || (attempt ->> 'order_id'), 'payment_type', 'qris', 'currency', 'IDR',
    'fraud_status', 'accept', 'settlement_time', to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'));
begin
  perform internal.attach_snap_token((attempt ->> 'payment_id')::uuid, 'token-' || (attempt ->> 'order_id'),
    'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (attempt ->> 'order_id'));
  perform internal.apply_payment_event((internal.record_payment_event('webhook',
    encode(extensions.digest(answer::text || clock_timestamp()::text, 'sha256'), 'hex'), answer) ->> 'event_id')::bigint,
    'webhook', answer, 'k1');
  return booking_id;
end;
$$;

create function pg_temp.payment_of(p_booking uuid) returns uuid
  language sql
as $$ select id from public.payments where booking_id = p_booking and status <> 'initiated' order by attempt_no limit 1; $$;

-- What each beneficiary of a booking still holds in the ledger.
create function pg_temp.holdings(p_booking uuid) returns text[]
  language sql
as $$
  select array_agg(beneficiary_key || '=' || total order by beneficiary_key)
  from (select beneficiary_key, sum(amount) as total from public.revenue_share_entries
        where booking_id = p_booking group by beneficiary_key) as held;
$$;
grant execute on function pg_temp.payment_of(uuid) to authenticated;

create temporary table refunded on commit drop as select pg_temp.paid_booking('+6281300002001') as id;
create temporary table adjusted on commit drop as select pg_temp.paid_booking('+6281300002002') as id;
create temporary table shared on commit drop as select pg_temp.paid_booking('+6281300002003') as id;
create temporary table doubled on commit drop as select pg_temp.paid_booking('+6281300002004') as id;
create temporary table combo on commit drop as
  select pg_temp.paid_booking('+6281300002005', '00000000-0000-4000-8000-0000000f1002',
    array['00000000-0000-4000-8000-0000000f2001', '00000000-0000-4000-8000-0000000f2002']::uuid[]) as id;
grant select on refunded, adjusted, shared, doubled, combo to authenticated;

-- A booking paid without a ledger (its split refused) and one still waiting while Midtrans' money is held for review.
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, institution_name, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  amount_paid, consent_version, consented_at, paid_at, expires_at)
values
  ('00000000-0000-4000-8000-0000000f3001', 'GSK-RF0000M2', 'paid', '00000000-0000-4000-8000-0000000f1001', '{}',
   '{5}', 'school', 'Bu Tanpa', '+6281300002006', 'tanpa@contoh.test', 'SD Tanpa Buku', 10,
   public.today_jkt() + 6, public.today_jkt() + 6, 300000, 300000, 300000, 'v1', now(), now(), null),
  ('00000000-0000-4000-8000-0000000f3002', 'GSK-RF0000M5', 'pending_payment', '00000000-0000-4000-8000-0000000f1001',
   '{}', '{5}', 'school', 'Bu Tahan', '+6281300002007', 'tahan@contoh.test', 'SD Ditahan', 10,
   public.today_jkt() + 6, public.today_jkt() + 6, 300000, 300000, 0, 'v1', now(), null, now() + interval '1 day');
insert into public.payments (id, booking_id, attempt_no, provider, method, status, order_id, gross_amount,
  settlement_time) values
  ('00000000-0000-4000-8000-0000000f4001', '00000000-0000-4000-8000-0000000f3001', 1, 'midtrans', 'qris', 'settled',
   'GSK-RF0000M2-01', 300000, now()),
  ('00000000-0000-4000-8000-0000000f4002', '00000000-0000-4000-8000-0000000f3002', 1, 'midtrans', 'qris',
   'needs_review', 'GSK-RF0000M5-01', 300000, null);
-- A second settlement of the doubled booking, which apply_payment_event would have stored as duplicate.
insert into public.payments (id, booking_id, attempt_no, provider, method, status, order_id, gross_amount,
  settlement_time)
select '00000000-0000-4000-8000-0000000f4003', b.id, 2, 'midtrans', 'qris', 'duplicate', b.booking_code || '-02',
       300000, now()
from public.bookings b where b.id = (select id from doubled);
select set_config('app.in_rpc', '', true);
insert into public.security_alerts (rule, severity, fingerprint, title)
select 'duplicate_settlement', 'high', 'duplicate_settlement:' || p.order_id, 'Pembayaran ganda'
from public.payments p where p.id = '00000000-0000-4000-8000-0000000f4003';
insert into public.security_alerts (rule, severity, fingerprint, title)
select 'refund_seen', 'high', 'refund_seen:' || p.order_id, 'Refund terlihat di Midtrans'
from public.payments p where p.id = pg_temp.payment_of((select id from refunded));
create temporary table invariant_before on commit drop as
  select internal.recap_invariant(public.today_jkt(), public.today_jkt()) as value;

select is((select status::text from public.bookings where id = (select id from refunded)), 'paid',
  'the fixture booking is paid through the real settlement path');

-- ===== record_refund: who =====
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.record_refund((select id from refunded), 100000, 'TRF-001', 'Sebagian rombongan batal',
  null, pg_temp.doc('bookings/' || (select id from refunded) || '/refund-1.pdf'))$$, '42501', null,
  'an RW admin records no refund');
reset role;
select pg_temp.act_as('superadmin_stale_totp');
select throws_ok($$select public.record_refund((select id from refunded), 100000, 'TRF-001', 'Sebagian rombongan batal',
  null, pg_temp.doc('bookings/' || (select id from refunded) || '/refund-1.pdf'))$$, '42501', null,
  'nor a superadmin whose code is two hours old (AUTH-11)');
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select public.record_refund((select id from refunded), 100000, 'TRF-001', 'Sebagian rombongan batal',
  null, pg_temp.doc('bookings/' || (select id from refunded) || '/refund-1.pdf'))$$, '42501', null, 'nor one at AAL1');

-- ===== record_refund: a partial refund, then the rest =====
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.record_refund((select id from refunded), 100000, 'TRF-001', 'Sebagian rombongan batal')$$,
  '22023', null, 'a refund without proof is refused');
select throws_ok($$select public.record_refund((select id from refunded), 100000, 'TRF-001', 'Sebagian rombongan batal',
  null, 'bookings/' || (select id from refunded) || '/belum-diunggah.pdf')$$, 'P0001',
  'no document at bookings/' || (select id from refunded) || '/belum-diunggah.pdf',
  'nor one whose proof the documents bucket does not hold (L7)');
select throws_ok($$select public.record_refund((select id from refunded), 300001, 'TRF-001', 'Sebagian rombongan batal',
  null, pg_temp.doc('bookings/' || (select id from refunded) || '/refund-1.pdf'))$$, 'P0001', null,
  'nor more than the payment holds');
select is(public.record_refund((select id from refunded), 100000, 'TRF-001', 'Sebagian rombongan batal', null,
  pg_temp.doc('bookings/' || (select id from refunded) || '/refund-1.pdf')) ->> 'result', 'recorded',
  'a partial refund is recorded');
reset role;
select is((select status::text || ':' || refunded_amount from public.payments
           where id = pg_temp.payment_of((select id from refunded))), 'partially_refunded:100000',
  'the payment is partly refunded');
select is((select status::text from public.bookings where id = (select id from refunded)), 'paid',
  'and the booking stays paid');
select is((select -sum(amount)::bigint from public.revenue_share_entries
           where booking_id = (select id from refunded) and entry_type = 'reversal'), 100000::bigint,
  'the ledger gives back what was refunded');
select is((select count(*)::int from public.tickets_qr where booking_id = (select id from refunded) and status = 'issued'),
  1, 'the ticket stands');
select is((select count(*)::int from public.notifications
           where booking_id = (select id from refunded) and template = 'refund_processed'), 2,
  'refund_processed is queued for WhatsApp and email');
select isnt((select acknowledged_at from public.security_alerts a join public.payments p
             on a.fingerprint = 'refund_seen:' || p.order_id
             where p.id = pg_temp.payment_of((select id from refunded))), null,
  'and the refund Midtrans was seen making is closed in the superadmin''s name (L5)');

-- L5: Midtrans telling of the refund already recorded raises nothing; telling of more still does.
insert into public.payment_events (order_id, source, event_hash, payload)
select p.order_id, 'webhook', 'uji-refund-seen-1', '{"refund_amount": "100000.00"}'
from public.payments p where p.id = pg_temp.payment_of((select id from refunded));
select is(internal.note_refund_seen((select p from public.payments p
                                     where p.id = pg_temp.payment_of((select id from refunded))),
                                    'partially_refunded') ->> 'processing_result', 'refund_already_recorded',
  'a Midtrans notice of the refund already recorded raises no alert');
insert into public.payment_events (order_id, source, event_hash, payload)
select p.order_id, 'webhook', 'uji-refund-seen-2', '{"refund_amount": "150000.00"}'
from public.payments p where p.id = pg_temp.payment_of((select id from refunded));
select is(internal.note_refund_seen((select p from public.payments p
                                     where p.id = pg_temp.payment_of((select id from refunded))),
                                    'partially_refunded') ->> 'processing_result', 'refund_awaiting_record',
  'one beyond what was recorded still does');
update public.payment_events set processed_at = now() where event_hash in ('uji-refund-seen-1', 'uji-refund-seen-2');

reset role;
select pg_temp.act_as('superadmin_aal2');
select is(public.record_refund((select id from refunded), 100000, 'TRF-001', 'Sebagian rombongan batal', null,
  pg_temp.doc('bookings/' || (select id from refunded) || '/refund-1.pdf')) ->> 'result', 'already_recorded',
  'the same refund retried records nothing again');
select throws_ok($$select public.record_refund((select id from refunded), 99999, 'TRF-001', 'Sebagian rombongan batal',
  null, pg_temp.doc('bookings/' || (select id from refunded) || '/refund-1.pdf'))$$, 'P0001', null,
  'and its reference with another amount is refused');
select is(public.record_refund((select id from refunded), 200000, 'TRF-002', 'Seluruh kunjungan dibatalkan', null,
  pg_temp.doc('bookings/' || (select id from refunded) || '/refund-2.pdf')) ->> 'whole', 'true',
  'the rest is a whole refund');
reset role;
select is((select status::text from public.bookings where id = (select id from refunded)), 'refunded',
  'which refunds the booking, after its first partial refund');
select is((select status::text || ':' || refunded_amount from public.payments
           where id = pg_temp.payment_of((select id from refunded))), 'refunded:300000', 'and the payment');
select is((select count(*)::int from public.tickets_qr where booking_id = (select id from refunded) and status = 'revoked'),
  1, 'revokes the ticket');
select is((select string_agg(status::text, ',') from public.booking_legs where booking_id = (select id from refunded)),
  'released', 'frees the seats of the visit ahead');
select is((select reserved_pax from public.visit_sessions where id = '00000000-0000-4000-8000-0000000f2001'), 40,
  'so only the other four bookings hold seats');
select matches((select status::text || ' ' || credit_note_number from public.invoices
                where booking_id = (select id from refunded)), '^void CN/GSK/[0-9]{4}/[0-9]{4}$',
  'voids the invoice under a credit note');
select is((select sum(amount)::bigint from public.revenue_share_entries where booking_id = (select id from refunded)),
  0::bigint, 'and leaves nothing in the ledger');
select is((select count(*)::int from public.booking_events
           where booking_id = (select id from refunded) and reason = 'refund_recorded'), 2,
  'each refund is a booking event');
select is((select array_agg((params ->> 'refund_amount')::bigint order by (params ->> 'refund_amount')::bigint)
           from public.notifications
           where booking_id = (select id from refunded) and template = 'refund_processed'),
  array[100000, 100000, 200000, 200000]::bigint[], 'and each refund sends its own message with its own amount (L4)');

-- ===== M1: a duplicate payment's refund =====
reset role;
select pg_temp.act_as('superadmin_aal2');
select is(public.record_refund((select id from doubled), 300000, 'TRF-DUP', 'Pembayaran ganda dikembalikan',
  '00000000-0000-4000-8000-0000000f4003',
  pg_temp.doc('bookings/' || (select id from doubled) || '/refund-dup.pdf')) ->> 'result', 'recorded',
  'a duplicate payment is refunded whole');
reset role;
select is((select status::text || ':' || refunded_amount from public.payments
           where id = '00000000-0000-4000-8000-0000000f4003'), 'duplicate:300000',
  'and stays duplicate, its refund in refunded_amount alone');
select is((select b.status::text || ':' || (select sum(e.amount) from public.revenue_share_entries e
                                             where e.booking_id = b.id)
           from public.bookings b where b.id = (select id from doubled)), 'paid:300000',
  'the booking stays paid and its ledger whole');
select is((select count(*)::int from public.notifications
           where booking_id = (select id from doubled) and template = 'refund_processed'), 0,
  'the visitor hears nothing of money that was never the booking''s');
select isnt((select a.acknowledged_at from public.security_alerts a
             where a.fingerprint = 'duplicate_settlement:' || (select order_id from public.payments
                                                              where id = '00000000-0000-4000-8000-0000000f4003')), null,
  'and the duplicate''s alert is closed');
select is((select (now_value ->> 'expected')::bigint - (now_value ->> 'ledger')::bigint || ':'
                  || (now_value ->> 'mismatched_bookings')
           from (select internal.recap_invariant(public.today_jkt(), public.today_jkt()) as now_value) as now_read),
  (select (value ->> 'expected')::bigint - (value ->> 'ledger')::bigint || ':' || (value ->> 'mismatched_bookings')
   from invariant_before),
  'the recap invariant does not count a duplicate''s refund against the ledger');

-- ===== M2: a partial refund needs a ledger =====
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.record_refund('00000000-0000-4000-8000-0000000f3001', 100000, 'TRF-M2A',
  'Sebagian rombongan batal', null,
  pg_temp.doc('bookings/00000000-0000-4000-8000-0000000f3001/refund-m2.pdf'))$$, 'P0001',
  'booking GSK-RF0000M2 has no settlement ledger to take a partial refund from',
  'a partial refund of a booking without a ledger is refused (LEDGER_MISSING)');
select is(public.record_refund('00000000-0000-4000-8000-0000000f3001', 300000, 'TRF-M2B',
  'Seluruh kunjungan dibatalkan', null,
  pg_temp.doc('bookings/00000000-0000-4000-8000-0000000f3001/refund-m2.pdf')) ->> 'whole', 'true',
  'a whole one is recorded, with nothing to reverse');

-- ===== M5: money Midtrans settled while the payment was held for review =====
select throws_ok($$select public.record_refund('00000000-0000-4000-8000-0000000f3002', 300000, 'TRF-M5',
  'Dana masuk saat ditinjau, dikembalikan', null,
  pg_temp.doc('bookings/00000000-0000-4000-8000-0000000f3002/refund-m5.pdf'))$$, 'P0001',
  'a needs_review payment is not refunded', 'a held payment Midtrans has not confirmed is not refunded');
reset role;
insert into public.payment_events (order_id, source, event_hash, payload, transaction_status, fraud_status,
  gross_amount_raw, processed_at)
values ('GSK-RF0000M5-01', 'status_api', 'uji-held-settled', '{}', 'settlement', 'accept', '300000.00', now());
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.record_refund('00000000-0000-4000-8000-0000000f3002', 100000, 'TRF-M5',
  'Dana masuk saat ditinjau, dikembalikan', null,
  pg_temp.doc('bookings/00000000-0000-4000-8000-0000000f3002/refund-m5.pdf'))$$, 'P0001', null,
  'once confirmed, it is refunded whole only');
select is(public.record_refund('00000000-0000-4000-8000-0000000f3002', 300000, 'TRF-M5',
  'Dana masuk saat ditinjau, dikembalikan', null,
  pg_temp.doc('bookings/00000000-0000-4000-8000-0000000f3002/refund-m5.pdf')) ->> 'whole', 'true',
  'and then it is');
reset role;
select is((select b.status::text || ':' || p.status::text || ':'
                  || (select count(*) from public.revenue_share_entries e where e.booking_id = b.id)
           from public.bookings b join public.payments p on p.booking_id = b.id
           where b.id = '00000000-0000-4000-8000-0000000f3002'), 'refunded:refunded:0',
  'the waiting booking and its payment are refunded, with no ledger to reverse');

-- ===== A combo refunded whole =====
reset role;
select pg_temp.act_as('superadmin_aal2');
select is(public.record_refund((select id from combo), 300000, 'TRF-KOMBO', 'Seluruh kunjungan dibatalkan', null,
  pg_temp.doc('bookings/' || (select id from combo) || '/refund-kombo.pdf')) ->> 'whole', 'true',
  'a combo is refunded whole');
reset role;
select is((select string_agg(status::text, ',' order by rw_id) from public.tickets_qr
           where booking_id = (select id from combo)), 'revoked,revoked', 'both its tickets are revoked');
select is((select string_agg(status::text, ',' order by rw_id) || ' ' || coalesce(sum(0), 0)
           from public.booking_legs where booking_id = (select id from combo))
          || ' ' || (select sum(amount) from public.revenue_share_entries where booking_id = (select id from combo)),
  'released,released 0 0', 'both legs free their seats, and the ledger of each RW gives everything back');

-- ===== Adjustments: the workflow =====
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.propose_adjustment('manual_refund', (select id from adjusted),
  pg_temp.payment_of((select id from adjusted)), 50000, 'Biaya tambahan dikembalikan', 'bookings/x/adjustment.pdf')$$,
  '22023', null, 'an adjustment without evidence under its booking is refused');
select throws_ok($$select public.propose_adjustment('manual_mark_paid', (select id from adjusted), null, 50000,
  'Bayar tunai di loket',
  pg_temp.doc('bookings/' || (select id from adjusted) || '/adjustment-' || gen_random_uuid() || '.pdf'))$$,
  'P0001', null, 'manual_mark_paid is not proposed here');
create temporary table proposal on commit drop as
  select ((public.propose_adjustment('manual_refund', (select id from adjusted),
    pg_temp.payment_of((select id from adjusted)), 50000, 'Biaya tambahan dikembalikan',
    pg_temp.doc('bookings/' || (select id from adjusted) || '/adjustment-' || gen_random_uuid() || '.pdf')))
    ->> 'id')::uuid as id;
select is((select status::text from public.payment_adjustments where id = (select id from proposal)), 'proposed',
  'a manual refund is proposed with its evidence');
select throws_ok($$select public.propose_adjustment('manual_refund', (select id from adjusted),
  pg_temp.payment_of((select id from adjusted)), 1000, 'Satu lagi pengembalian dana',
  pg_temp.doc('bookings/' || (select id from adjusted) || '/adjustment-' || gen_random_uuid() || '.pdf'))$$,
  'P0001', null, 'a second open refund of the booking is refused');
select throws_ok($$select public.approve_adjustment((select id from proposal))$$, 'P0001', null,
  'its proposer does not approve it while another superadmin can');
select throws_ok($$update public.payment_adjustments set status = 'approved' where id = (select id from proposal)$$,
  '42501', null, 'and nobody approves it by writing the row');

reset role;
update public.profiles set created_at = now() - interval '2 days' where id = '00000000-0000-4000-8000-00000000f002';
select pg_temp.act_as_super_b();
select throws_ok($$select public.approve_adjustment((select id from proposal))$$, 'P0001', null,
  'an approver whose account is two days old is refused (REC-16)');
reset role;
update public.profiles set created_at = now() - interval '10 days', created_by = '00000000-0000-4000-8000-00000000f001'
where id = '00000000-0000-4000-8000-00000000f002';
select is(internal.approver_is_eligible('00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-00000000f001',
  now()), false, 'one the proposer invited ten days ago may not approve (REC-16, L9)');
update public.profiles set created_at = now() - interval '40 days' where id = '00000000-0000-4000-8000-00000000f002';
select is(internal.approver_is_eligible('00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-00000000f001',
  now()), true, 'one the proposer invited more than 30 days ago may approve');
update public.profiles set created_by = null where id = '00000000-0000-4000-8000-00000000f002';
delete from auth.mfa_factors where user_id = '00000000-0000-4000-8000-00000000f002';
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000f002', 'uji-b-baru', 'totp', 'verified', now(), now());
select is(internal.approver_is_eligible('00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-00000000f001',
  now() - interval '1 hour'), false, 'one whose authenticator is newer than the proposal may not');
update auth.mfa_factors set created_at = now() - interval '39 days'
where user_id = '00000000-0000-4000-8000-00000000f002';

reset role;
select pg_temp.act_as_super_b();
select is((public.approve_adjustment((select id from proposal)) ->> 'status'), 'approved',
  'another eligible superadmin approves it');
select throws_ok($$select public.approve_adjustment((select id from proposal))$$, 'P0001', null,
  'once');

-- L2: an approval is applied as it was given, by an approver who is still an active superadmin.
reset role;
select set_config('app.in_rpc', '1', true);
select throws_ok($$update public.payment_adjustments set status = 'applied', applied_at = now(),
  applied_by = '00000000-0000-4000-8000-00000000f001', approved_by = '00000000-0000-4000-8000-00000000f001'
  where id = (select id from proposal)$$, '42501', 'an approval is applied as it was given',
  'the approval does not change on the way to applied (L2)');
select set_config('app.in_rpc', '', true);
select set_config('request.jwt.claims', '', true);
select set_config('app.privileged_rpc', 'on', true);
update public.profiles set is_active = false where id = '00000000-0000-4000-8000-00000000f002';
select set_config('app.privileged_rpc', '', true);
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.apply_adjustment((select id from proposal))$$, 'P0001',
  'the approver is no longer an active superadmin', 'an approval by a deactivated superadmin does not apply (L2)');
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('app.privileged_rpc', 'on', true);
update public.profiles set is_active = true where id = '00000000-0000-4000-8000-00000000f002';
select set_config('app.privileged_rpc', '', true);
select pg_temp.act_as('superadmin_aal2');
select is((public.apply_adjustment((select id from proposal)) ->> 'status'), 'applied', 'and it is applied');
reset role;
select is((select status::text || ':' || refunded_amount from public.payments
           where id = pg_temp.payment_of((select id from adjusted))), 'partially_refunded:50000',
  'through the refund path, under the adjustment''s own reference');
select is((select count(*)::int from public.revenue_share_entries
           where booking_id = (select id from adjusted) and rule_version ->> 'refund_reference'
                 = 'adjustment:' || (select id from proposal)), 2,
  'whose reversal rows name it');
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.apply_adjustment((select id from proposal))$$, 'P0001', null, 'and only once');
reset role;
select set_config('app.in_rpc', '1', true);
select throws_ok($$update public.payment_adjustments set status = 'approved' where id = (select id from proposal)$$,
  '42501', null, 'an applied adjustment goes back to approved by no path (L9)');
select throws_ok($$update public.payment_adjustments set status = 'rejected', rejected_reason = 'Dibatalkan saja'
  where id = (select id from proposal)$$, '42501', null, 'nor to rejected');
select set_config('app.in_rpc', '', true);

-- ===== The one superadmin: their own approval waits 24 hours =====
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('app.privileged_rpc', 'on', true);
update public.profiles set is_active = false where id = '00000000-0000-4000-8000-00000000f002';
select set_config('app.privileged_rpc', '', true);
reset role;
select pg_temp.act_as('superadmin_aal2');
create temporary table write_off on commit drop as
  select ((public.propose_adjustment('write_off', (select id from adjusted), null, 2500,
    'Selisih pembulatan transfer bank',
    pg_temp.doc('bookings/' || (select id from adjusted) || '/adjustment-' || gen_random_uuid() || '.png')))
    ->> 'id')::uuid as id;
select cmp_ok((public.approve_adjustment((select id from write_off)) ->> 'apply_not_before')::timestamptz, '>=',
  now() + interval '24 hours', 'alone, the proposer approves their own, applying 24 hours later');
select throws_ok($$select public.apply_adjustment((select id from write_off))$$, 'P0001', null,
  'and it does not apply before then');
reset role;
select is((select severity::text from public.security_alerts
           where fingerprint = 'adjustment_self_approved:' || (select id from write_off)), 'high',
  'a high alert tells the kelurahan head');
select set_config('app.in_rpc', '1', true);
select throws_ok($$update public.payment_adjustments set apply_not_before = now()
  where id = (select id from write_off)$$, '42501', 'the delay of an adjustment never shortens',
  'and nobody brings its delay forward (L9)');
select set_config('app.in_rpc', '', true);

reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.reject_adjustment((select id from write_off), 'Salah')$$, 'P0001', null,
  'an approved adjustment is no longer withdrawn');

-- L2: the retention run still prunes, as 0004's trigger lets it.
reset role;
select set_config('app.purge', 'on', true);
select lives_ok($$delete from public.payment_adjustments where id = (select id from write_off)$$,
  'the retention run may still prune an adjustment (L2)');
select set_config('app.purge', '', true);

-- ===== reclassify_share, then a partial and a whole refund =====
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('app.privileged_rpc', 'on', true);
update public.profiles set is_active = true where id = '00000000-0000-4000-8000-00000000f002';
select set_config('app.privileged_rpc', '', true);
create temporary table shared_keys on commit drop as
  select array_agg(distinct beneficiary_key order by beneficiary_key) as keys from public.revenue_share_entries
  where booking_id = (select id from shared) and line_ref = 'package';
grant select on shared_keys to authenticated;
select is(array_length((select keys from shared_keys), 1) >= 2, true, 'the package line pays at least two parties');
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.propose_adjustment('reclassify_share', (select id from shared), null, 99999999,
  'Bagian RW salah dicatat',
  pg_temp.doc('bookings/' || (select id from shared) || '/adjustment-' || gen_random_uuid() || '.pdf'),
  jsonb_build_object('line_ref', 'package', 'from_key', (select keys[1] from shared_keys),
                     'to_key', (select keys[2] from shared_keys)))$$, 'P0001', null,
  'a share is not moved beyond what it holds');
create temporary table reclassified on commit drop as
  select ((public.propose_adjustment('reclassify_share', (select id from shared), null, 1000,
    'Bagian RW salah dicatat',
    pg_temp.doc('bookings/' || (select id from shared) || '/adjustment-' || gen_random_uuid() || '.pdf'),
    jsonb_build_object('line_ref', 'package', 'from_key', (select keys[1] from shared_keys),
                       'to_key', (select keys[2] from shared_keys)))) ->> 'id')::uuid as id;
create temporary table withdrawn on commit drop as
  select ((public.propose_adjustment('write_off', (select id from shared), null, 500, 'Selisih biaya admin bank',
    pg_temp.doc('bookings/' || (select id from shared) || '/adjustment-' || gen_random_uuid() || '.pdf')))
    ->> 'id')::uuid as id;
select is((public.reject_adjustment((select id from withdrawn), 'Ditarik oleh pengusulnya') ->> 'status'),
  'rejected', 'a proposal may be withdrawn');
reset role;
select set_config('app.in_rpc', '1', true);
select throws_ok($$update public.payment_adjustments set status = 'approved', approved_at = now(),
  approved_by = '00000000-0000-4000-8000-00000000f002', apply_not_before = now()
  where id = (select id from withdrawn)$$, 'P0001', null, 'and a rejected one is never approved (L9)');
select set_config('app.in_rpc', '', true);
select pg_temp.act_as_super_b();
select is((public.approve_adjustment((select id from reclassified)) ->> 'status'), 'approved', 'B approves the move');
select is((public.apply_adjustment((select id from reclassified)) ->> 'status'), 'applied', 'and applies it');
reset role;
select is((select array_agg(amount order by amount) from public.revenue_share_entries
           where adjustment_id = (select id from reclassified)), array[-1000, 1000]::bigint[],
  'as two adjustment rows that net to zero');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is(public.record_refund((select id from shared), 100000, 'TRF-003A', 'Sebagian rombongan batal', null,
  pg_temp.doc('bookings/' || (select id from shared) || '/refund-3a.pdf')) ->> 'whole', 'false',
  'a partial refund after the move (L9)');
reset role;
select is((select sum(amount)::bigint from public.revenue_share_entries where booking_id = (select id from shared))
          || ':' || (select bool_and(split_part(held, '=', 2)::bigint >= 0)
                     from unnest(pg_temp.holdings((select id from shared))) as held),
  '200000:true', 'gives back a third of each share as it stands, none below nothing');
select pg_temp.act_as('superadmin_aal2');
select is(public.record_refund((select id from shared), 200000, 'TRF-003', 'Seluruh kunjungan dibatalkan', null,
  pg_temp.doc('bookings/' || (select id from shared) || '/refund-3.pdf')) ->> 'whole', 'true',
  'then the rest, a whole refund');
reset role;
select is((select bool_and(held like '%=0') from unnest(pg_temp.holdings((select id from shared))) as held), true,
  'gives every party back exactly the share it held after the move');

select set_config('request.jwt.claims', '', true);
select set_config('app.privileged_rpc', 'on', true);
update public.profiles set is_active = true where id in (select id from other_supers);
select set_config('app.privileged_rpc', '', true);
select * from finish();
rollback;
