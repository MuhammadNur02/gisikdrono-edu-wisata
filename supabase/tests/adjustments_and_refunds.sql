-- Task P4.7.03 (docs/PRD.md §9.2, §10.3; docs/Security.md REC-08, REC-09, REC-16, AUTH-11): a refund is recorded once
-- with its proof, a whole refund refunds the booking, revokes its tickets, frees its seats and voids its invoice under
-- a credit note, and the ledger gives back each party's share as it stands; an adjustment is proposed with evidence,
-- approved by another superadmin who meets REC-16 (or by its proposer alone after 24 hours), and applied once.
-- Review of PR #68: a duplicate payment's refund (M1), a partial refund without a ledger (M2), a refund of money held
-- for review (M5), and the Lows L2, L4, L5 and L9. Re-review: record_refund records only what Midtrans reports (N1),
-- a stuck approval is withdrawn (N2), and N3, N5 to N8. Final re-review: a refund's amount comes from Midtrans' confirmed
-- answer, never the webhook body (N9), what was recorded under Midtrans' word (N11), refunds[] (N13), an applied
-- adjustment is not rejected (N14), and a proof backs one refund or adjustment. Delta review: bank transfers neither
-- count towards nor block what Midtrans refunded (N16), a manual refund Midtrans made under its refund_key, a
-- rejected adjustment's evidence (L2), and an event judged only under its own source (L4). Delta 2: a manual refund
-- counts as Midtrans' once Midtrans lists its key, whenever that answer comes (N17), and only for its own amount (L5).
-- Delta 3 (20261104100200): a key listed with another amount (L6), a reference however written (L7), the notice of a
-- recorded refund closing its alert (I1), and an answer without refunds[] (I2).
begin;
select plan(131);
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
  ('00000000-0000-4000-8000-0000000f2002', 8, public.today_jkt() + 6, '13:00', '14:00', 'Uji refund 08', 200),
  ('00000000-0000-4000-8000-0000000f2003', 5, public.today_jkt() + 7, '09:00', '10:00', 'Uji refund 2', 200);

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

-- A refund's proof as finance-service.ts names it, refund-<uuid>.pdf (N6), with or without the file in the bucket.
create function pg_temp.proof_path(p_booking uuid, p_name text) returns text
  language sql
as $$ select 'bookings/' || p_booking || '/refund-' || md5(p_booking::text || p_name)::uuid || '.pdf' $$;
grant execute on function pg_temp.proof_path(uuid, text) to authenticated;
create function pg_temp.proof(p_booking uuid, p_name text) returns text
  language sql security definer
as $$ select pg_temp.doc(pg_temp.proof_path(p_booking, p_name)) $$;
grant execute on function pg_temp.proof(uuid, text) to authenticated;

-- Midtrans answering the Status API with a refund of p_refunded in all for the payment (N1).
create function pg_temp.midtrans_refund(p_payment uuid, p_refunded bigint) returns void
  language sql
as $$
  insert into public.payment_events (payment_id, order_id, source, event_hash, transaction_status, status_code,
    gross_amount_raw, payload, processed_at)
  select p.id, p.order_id, 'status_api', md5(p.id::text || p_refunded || clock_timestamp()::text),
         case when p_refunded >= p.gross_amount then 'refund' else 'partial_refund' end, '200', p.gross_amount || '.00',
         jsonb_build_object('refund_amount', p_refunded || '.00', 'currency', 'IDR',
                            'refunds', jsonb_build_array(jsonb_build_object('refund_key', 'uji-' || p_refunded,
                                                                            'refund_amount', p_refunded || '.00'))),
         now()
  from public.payments p where p.id = p_payment;
$$;

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
create temporary table seen on commit drop as
  select pg_temp.paid_booking('+6281300002008', '00000000-0000-4000-8000-0000000f1001',
    array['00000000-0000-4000-8000-0000000f2003']::uuid[]) as id;
grant select on refunded, adjusted, shared, doubled, combo, seen to authenticated;

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
insert into public.security_alerts (rule, severity, fingerprint, title, details)
select 'refund_seen', 'high', 'refund_seen:' || p.order_id, 'Refund terlihat di Midtrans',
       '{"refunded_amount": 300000}'
from public.payments p where p.id = pg_temp.payment_of((select id from refunded));
create temporary table invariant_before on commit drop as
  select internal.recap_invariant(public.today_jkt(), public.today_jkt()) as value;

select is((select status::text from public.bookings where id = (select id from refunded)), 'paid',
  'the fixture booking is paid through the real settlement path');

-- ===== record_refund: who =====
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.record_refund((select id from refunded), 100000, 'TRF-001', 'Sebagian rombongan batal',
  null, pg_temp.proof((select id from refunded), '1'))$$, '42501', null,
  'an RW admin records no refund');
reset role;
select pg_temp.act_as('superadmin_stale_totp');
select throws_ok($$select public.record_refund((select id from refunded), 100000, 'TRF-001', 'Sebagian rombongan batal',
  null, pg_temp.proof((select id from refunded), '1'))$$, '42501', null,
  'nor a superadmin whose code is two hours old (AUTH-11)');
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select public.record_refund((select id from refunded), 100000, 'TRF-001', 'Sebagian rombongan batal',
  null, pg_temp.proof((select id from refunded), '1'))$$, '42501', null, 'nor one at AAL1');

-- ===== record_refund: a partial refund, then the rest =====
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.record_refund((select id from refunded), 100000, 'TRF-001', 'Sebagian rombongan batal')$$,
  '22023', null, 'a refund without proof is refused');
select throws_ok($$select public.record_refund((select id from refunded), 100000, 'TRF-001', 'Sebagian rombongan batal',
  null, pg_temp.proof_path((select id from refunded), 'belum'))$$, 'P0001',
  'no document at ' || pg_temp.proof_path((select id from refunded), 'belum'),
  'nor one whose proof the documents bucket does not hold (L7)');
select throws_ok($$select public.record_refund((select id from refunded), 100000, 'TRF-001', 'Sebagian rombongan batal',
  null, pg_temp.doc('bookings/' || (select id from refunded) || '/.refund-1.pdf'))$$, '22023', null,
  'nor one whose proof is not a refund-<uuid> file (N6)');
select throws_ok($$select public.record_refund((select id from refunded), 300001, 'TRF-001', 'Sebagian rombongan batal',
  null, pg_temp.proof((select id from refunded), '1'))$$, 'P0001', null,
  'nor more than the payment holds');
select is(public.record_refund((select id from refunded), 100000, 'TRF-001', 'Sebagian rombongan batal', null,
  pg_temp.proof((select id from refunded), '1')) ->> 'result', 'recorded',
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
select is((select (a.acknowledged_at is null) || ':' || (a.details ->> 'recorded_amount')
           from public.security_alerts a join public.payments p on a.fingerprint = 'refund_seen:' || p.order_id
           where p.id = pg_temp.payment_of((select id from refunded))), 'true:100000',
  'the alert of the whole refund Midtrans made stays open, noting what is recorded so far (N5)');

-- L5: Midtrans telling of the refund already recorded raises nothing; telling of more still does.
select is(internal.note_refund_seen((select p from public.payments p
                                     where p.id = pg_temp.payment_of((select id from refunded))),
                                    'partially_refunded', '{"refund_amount": "100000.00"}') ->> 'processing_result',
  'refund_already_recorded', 'a Midtrans notice of the refund already recorded raises no alert');
select is(internal.note_refund_seen((select p from public.payments p
                                     where p.id = pg_temp.payment_of((select id from refunded))),
                                    'partially_refunded', '{"refund_amount": "150000.00"}') ->> 'processing_result',
  'refund_awaiting_record', 'one beyond what was recorded still does');
-- N13: refunds[] is summed when the answer lists it; the top-level field counts only without it.
select is(internal.midtrans_refund_total('{"refund_amount": "999999.00",
  "refunds": [{"refund_amount": "1000.00"}, {"refund_amount": "2000.00"}]}'), 3000::bigint,
  'a refunded total is the sum of the refunds Midtrans lists (N13)');
select is(internal.midtrans_refund_total('{"refund_amount": "5000.00"}'), 5000::bigint,
  'and its top-level refund_amount when it lists none');
select pg_temp.midtrans_refund(pg_temp.payment_of((select id from refunded)), 300000);

reset role;
select pg_temp.act_as('superadmin_aal2');
select is(public.record_refund((select id from refunded), 100000, 'TRF-001', 'Sebagian rombongan batal', null,
  pg_temp.proof((select id from refunded), '1')) ->> 'result', 'already_recorded',
  'the same refund retried records nothing again');
select throws_ok($$select public.record_refund((select id from refunded), 99999, 'TRF-001', 'Sebagian rombongan batal',
  null, pg_temp.proof((select id from refunded), '1'))$$, 'P0001', null,
  'and its reference with another amount is refused');
select is(public.record_refund((select id from refunded), 200000, 'TRF-002', 'Seluruh kunjungan dibatalkan', null,
  pg_temp.proof((select id from refunded), '2')) ->> 'whole', 'true',
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
select isnt((select a.acknowledged_at from public.security_alerts a join public.payments p
             on a.fingerprint = 'refund_seen:' || p.order_id
             where p.id = pg_temp.payment_of((select id from refunded))), null,
  'and once all of it is recorded, the refund Midtrans was seen making is closed in the superadmin''s name (L5, N5)');
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.record_refund((select id from refunded), 1000, 'TRF-REUSE', 'Bukti dipakai ulang',
  null, pg_temp.proof((select id from refunded), '1'))$$, 'P0001',
  'the file ' || pg_temp.proof_path((select id from refunded), '1') || ' already backs another refund or adjustment',
  'a proof that backs one refund backs no other (PROOF_REUSED)');
reset role;
select set_config('app.in_rpc', '1', true);
select throws_ok($$update public.payments set refunded_amount = gross_amount + 1
  where id = pg_temp.payment_of((select id from refunded))$$, '23514', null,
  'a payment never gives back more than it took (N7)');
select set_config('app.in_rpc', '', true);

-- ===== M1: a duplicate payment's refund =====
reset role;
select pg_temp.midtrans_refund('00000000-0000-4000-8000-0000000f4003', 300000);
select pg_temp.act_as('superadmin_aal2');
select is(public.record_refund((select id from doubled), 300000, 'TRF-DUP', 'Pembayaran ganda dikembalikan',
  '00000000-0000-4000-8000-0000000f4003',
  pg_temp.proof((select id from doubled), 'dup')) ->> 'result', 'recorded',
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
select pg_temp.midtrans_refund('00000000-0000-4000-8000-0000000f4001', 300000);
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.record_refund('00000000-0000-4000-8000-0000000f3001', 100000, 'TRF-M2A',
  'Sebagian rombongan batal', null,
  pg_temp.proof('00000000-0000-4000-8000-0000000f3001', 'm2'))$$, 'P0001',
  'booking GSK-RF0000M2 has no settlement ledger to take a partial refund from',
  'a partial refund of a booking without a ledger is refused (LEDGER_MISSING)');
select is(public.record_refund('00000000-0000-4000-8000-0000000f3001', 300000, 'TRF-M2B',
  'Seluruh kunjungan dibatalkan', null,
  pg_temp.proof('00000000-0000-4000-8000-0000000f3001', 'm2')) ->> 'whole', 'true',
  'a whole one is recorded, with nothing to reverse');

-- ===== M5: money Midtrans settled while the payment was held for review =====
select throws_ok($$select public.record_refund('00000000-0000-4000-8000-0000000f3002', 300000, 'TRF-M5',
  'Dana masuk saat ditinjau, dikembalikan', null,
  pg_temp.proof('00000000-0000-4000-8000-0000000f3002', 'm5'))$$, 'P0001',
  'a needs_review payment is not refunded', 'a held payment Midtrans has not confirmed is not refunded');
reset role;
insert into public.payment_events (payment_id, order_id, source, event_hash, payload, transaction_status,
  fraud_status, gross_amount_raw, processed_at)
values ('00000000-0000-4000-8000-0000000f4002', 'GSK-RF0000M5-01', 'status_api', 'uji-held-settled-short',
        '{"currency": "IDR"}', 'settlement', 'accept', '299000.00', now());
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.record_refund('00000000-0000-4000-8000-0000000f3002', 300000, 'TRF-M5',
  'Dana masuk saat ditinjau, dikembalikan', null,
  pg_temp.proof('00000000-0000-4000-8000-0000000f3002', 'm5'))$$, 'P0001',
  'a needs_review payment is not refunded', 'a settlement of another amount confirms nothing (N3)');
reset role;
insert into public.payment_events (payment_id, order_id, source, event_hash, payload, transaction_status,
  fraud_status, gross_amount_raw, processed_at)
values ('00000000-0000-4000-8000-0000000f4002', 'GSK-RF0000M5-01', 'status_api', 'uji-held-settled',
        '{"currency": "IDR"}', 'settlement', 'accept', '300000.00', now());
select pg_temp.midtrans_refund('00000000-0000-4000-8000-0000000f4002', 300000);
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.record_refund('00000000-0000-4000-8000-0000000f3002', 100000, 'TRF-M5',
  'Dana masuk saat ditinjau, dikembalikan', null,
  pg_temp.proof('00000000-0000-4000-8000-0000000f3002', 'm5'))$$, 'P0001', null,
  'once confirmed, it is refunded whole only');
select is(public.record_refund('00000000-0000-4000-8000-0000000f3002', 300000, 'TRF-M5',
  'Dana masuk saat ditinjau, dikembalikan', null,
  pg_temp.proof('00000000-0000-4000-8000-0000000f3002', 'm5')) ->> 'whole', 'true',
  'and then it is');
reset role;
select is((select b.status::text || ':' || p.status::text || ':'
                  || (select count(*) from public.revenue_share_entries e where e.booking_id = b.id)
           from public.bookings b join public.payments p on p.booking_id = b.id
           where b.id = '00000000-0000-4000-8000-0000000f3002'), 'refunded:refunded:0',
  'the waiting booking and its payment are refunded, with no ledger to reverse');

-- ===== A combo refunded whole =====
reset role;
select pg_temp.midtrans_refund(pg_temp.payment_of((select id from combo)), 300000);
select pg_temp.act_as('superadmin_aal2');
select is(public.record_refund((select id from combo), 300000, 'TRF-KOMBO', 'Seluruh kunjungan dibatalkan', null,
  pg_temp.proof((select id from combo), 'kombo')) ->> 'whole', 'true',
  'a combo is refunded whole');
reset role;
select is((select string_agg(status::text, ',' order by rw_id) from public.tickets_qr
           where booking_id = (select id from combo)), 'revoked,revoked', 'both its tickets are revoked');
select is((select string_agg(status::text, ',' order by rw_id) || ' ' || coalesce(sum(0), 0)
           from public.booking_legs where booking_id = (select id from combo))
          || ' ' || (select sum(amount) from public.revenue_share_entries where booking_id = (select id from combo)),
  'released,released 0 0', 'both legs free their seats, and the ledger of each RW gives everything back');

-- ===== N9: what Midtrans refunded is its confirmed answer, never the webhook body =====
reset role;
create temporary table seen_order on commit drop as
  select order_id from public.payments where id = pg_temp.payment_of((select id from seen));
grant select on seen_order to authenticated;
select internal.apply_payment_event((internal.record_payment_event('webhook', encode(extensions.digest('uji-n9-body', 'sha256'), 'hex'),
    jsonb_build_object('order_id', (select order_id from seen_order), 'status_code', '200',
      'gross_amount', '300000.00', 'currency', 'IDR', 'transaction_status', 'partial_refund',
      'refund_amount', '300000.00', 'signature_key', repeat('a', 128))) ->> 'event_id')::bigint,
  'webhook',
  jsonb_build_object('order_id', (select order_id from seen_order), 'status_code', '200',
    'gross_amount', '300000.00', 'currency', 'IDR', 'transaction_status', 'partial_refund', 'refund_amount', '1000.00',
    'refunds', jsonb_build_array(jsonb_build_object('refund_amount', '1000.00'))),
  'k1');
select is((select (details ->> 'refunded_amount')::bigint from public.security_alerts
           where fingerprint = 'refund_seen:' || (select order_id from seen_order) and acknowledged_at is null),
  1000::bigint, 'a body claiming the whole payment leaves the alert with the 1000 Midtrans confirmed (N9)');
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.record_refund((select id from seen), 300000, 'TRF-N9', 'Seluruh dana dikembalikan',
  null, pg_temp.proof((select id from seen), 'n9'))$$, 'P0001',
  'Midtrans reports no refund of 300000 on order ' || (select order_id from seen_order),
  'so the whole payment cannot be recorded as refunded (REFUND_NOT_AT_MIDTRANS)');
select is(public.record_refund((select id from seen), 1000, 'TRF-N9', 'Sebagian dana dikembalikan', null,
  pg_temp.proof((select id from seen), 'n9')) ->> 'result', 'recorded', 'only the 1000 Midtrans refunded');

reset role;
select throws_ok($$select internal.apply_payment_event((internal.record_payment_event('webhook',
    encode(extensions.digest('uji-l4-body', 'sha256'), 'hex'),
    jsonb_build_object('order_id', (select order_id from seen_order), 'status_code', '200',
      'gross_amount', '300000.00', 'currency', 'IDR', 'transaction_status', 'settlement',
      'signature_key', repeat('a', 128))) ->> 'event_id')::bigint, 'poll', null, 'k1')$$, '22023', null,
  'a webhook body is never judged as the poll''s own answer (L4)');

-- ===== N17: a manual refund Midtrans made under its refund_key is booked once, whenever its answer comes =====
select pg_temp.act_as('superadmin_aal2');
create temporary table keyed_late on commit drop as
  select ((public.propose_adjustment('manual_refund', (select id from seen), 2000, 'Refund QRIS dari dasbor Midtrans', pg_temp.doc('bookings/' || (select id from seen) || '/adjustment-' || gen_random_uuid() || '.pdf'), '{}', pg_temp.payment_of((select id from seen))))
    ->> 'id')::uuid as id;
reset role;
select pg_temp.act_as_super_b();
select is((public.approve_adjustment((select id from keyed_late)) ->> 'status'), 'approved',
  'a manual refund executed at Midtrans under the adjustment''s id is approved');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is((public.apply_adjustment((select id from keyed_late)) ->> 'status'), 'applied',
  'and applied before Midtrans'' answer naming its key has arrived');
reset role;
create temporary table keyed_answer on commit drop as
  select jsonb_build_object('order_id', (select order_id from seen_order), 'status_code', '200',
    'gross_amount', '300000.00', 'currency', 'IDR', 'transaction_status', 'partial_refund', 'refund_amount', '3000.00',
    'refunds', jsonb_build_array(jsonb_build_object('refund_key', 'TRF-N9', 'refund_amount', '1000.00'),
                                 jsonb_build_object('refund_key', (select id from keyed_late)::text,
                                                    'refund_amount', '2000.00'))) as answer;
select is(internal.note_refund_seen((select p from public.payments p where p.id = pg_temp.payment_of((select id from seen))),
  'partially_refunded', (select answer from keyed_answer)) ->> 'processing_result', 'refund_awaiting_record',
  'the confirmed answer comes first and alerts, its key not stored yet');
insert into public.payment_events (payment_id, order_id, source, event_hash, transaction_status, status_code,
  gross_amount_raw, payload, processed_at)
select pg_temp.payment_of((select id from seen)), (select order_id from seen_order), 'status_api',
       md5('uji-keyed-late'), 'partial_refund', '200', '300000.00', (select answer from keyed_answer), now();
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.record_refund((select id from seen), 2000, 'TRF-N17', 'Refund QRIS dicatat lagi', null,
  pg_temp.proof((select id from seen), 'n17'))$$, 'P0001',
  'Midtrans reports no refund of 5000 on order ' || (select order_id from seen_order),
  'once Midtrans lists the key, the same money cannot be recorded again (N17, REFUND_NOT_AT_MIDTRANS)');
select throws_ok($$select public.record_refund((select id from seen), 2000, (select id from keyed_late)::text,
  'Refund QRIS dicatat lagi', null, pg_temp.proof((select id from seen), 'n17b'))$$, 'P0001',
  'refund ' || (select id from keyed_late) || ' was recorded when its adjustment was applied',
  'nor under the refund_key the adjustment already booked');
select throws_ok($$select public.record_refund((select id from seen), 2000,
  '  Adjustment:{' || upper((select id from keyed_late)::text) || '} ', 'Refund QRIS dicatat lagi', null,
  pg_temp.proof((select id from seen), 'n17c'))$$, 'P0001', null,
  'nor under that key written in capitals, with braces and spaces (L7)');
reset role;
select is(internal.note_refund_seen((select p from public.payments p where p.id = pg_temp.payment_of((select id from seen))),
  'partially_refunded', (select answer from keyed_answer)) ->> 'processing_result', 'refund_already_recorded',
  'Midtrans telling again of the refunds now recorded raises nothing');
select isnt((select acknowledged_by from public.security_alerts
             where fingerprint = 'refund_seen:' || (select order_id from seen_order)
             order by created_at desc limit 1), null,
  'and closes the open alert in the name of whoever recorded them (I1)');
select is(internal.midtrans_refunded_under_key(pg_temp.payment_of((select id from seen)), (select id from keyed_late)::text,
  2000), true, 'the key''s refunds add up to the adjustment''s amount');
select is(internal.midtrans_refunded_under_key(pg_temp.payment_of((select id from seen)), (select id from keyed_late)::text,
  1500), false, 'and another amount under that key is not its refund (L5)');
insert into public.payment_events (payment_id, order_id, source, event_hash, transaction_status, status_code,
  gross_amount_raw, payload, processed_at)
select pg_temp.payment_of((select id from seen)), (select order_id from seen_order), 'status_api', md5('uji-key-mismatch'),
       'partial_refund', '200', '300000.00',
       jsonb_build_object('order_id', (select order_id from seen_order), 'currency', 'IDR', 'refund_amount', '2500.00',
         'refunds', jsonb_build_array(jsonb_build_object('refund_key', 'TRF-N9', 'refund_amount', '1000.00'),
                                      jsonb_build_object('refund_key', (select id from keyed_late)::text,
                                                         'refund_amount', '1500.00'))), now();
select internal.note_refund_seen((select p from public.payments p where p.id = pg_temp.payment_of((select id from seen))),
  'partially_refunded', null);
select is((select severity::text from public.security_alerts
           where fingerprint = 'refund_key_mismatch:' || (select id from keyed_late) and acknowledged_at is null), 'high',
  'Midtrans listing the adjustment''s key with another amount raises a high alert (L6)');
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.record_refund((select id from seen), 500, 'TRF-L6', 'Refund QRIS lain dicatat', null,
  pg_temp.proof((select id from seen), 'l6'))$$, 'P0001',
  'Midtrans lists the refund of adjustment ' || (select id from keyed_late) || ' with another amount',
  'and nothing is recorded against Midtrans while that mismatch stands (REFUND_KEY_MISMATCH)');
reset role;

-- ===== Adjustments: the workflow =====
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.propose_adjustment('manual_refund', (select id from adjusted), 50000, 'Biaya tambahan dikembalikan', 'bookings/x/adjustment.pdf', '{}', pg_temp.payment_of((select id from adjusted)))$$,
  '22023', null, 'an adjustment without evidence under its booking is refused');
select throws_ok($$select public.propose_adjustment('manual_mark_paid', (select id from adjusted), 50000, 'Bayar tunai di loket', pg_temp.doc('bookings/' || (select id from adjusted) || '/adjustment-' || gen_random_uuid() || '.pdf'), '{}', null)$$,
  'P0001', null, 'manual_mark_paid is not proposed here');
create temporary table proposal on commit drop as
  select ((public.propose_adjustment('manual_refund', (select id from adjusted), 50000, 'Biaya tambahan dikembalikan', pg_temp.doc('bookings/' || (select id from adjusted) || '/adjustment-' || gen_random_uuid() || '.pdf'), '{}', pg_temp.payment_of((select id from adjusted))))
    ->> 'id')::uuid as id;
select is((select status::text from public.payment_adjustments where id = (select id from proposal)), 'proposed',
  'a manual refund is proposed with its evidence');
select throws_ok($$select public.propose_adjustment('manual_refund', (select id from adjusted), 1000, 'Satu lagi pengembalian dana', pg_temp.doc('bookings/' || (select id from adjusted) || '/adjustment-' || gen_random_uuid() || '.pdf'), '{}', pg_temp.payment_of((select id from adjusted)))$$,
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
select throws_ok($$select public.reject_adjustment((select id from proposal), 'Ditarik setelah diterapkan')$$, 'P0001',
  null, 'nor is an applied adjustment rejected or withdrawn (N14)');
reset role;
select is(internal.note_refund_seen((select p from public.payments p
                                     where p.id = pg_temp.payment_of((select id from adjusted))),
                                    'partially_refunded', '{"refund_amount": "50000.00"}') ->> 'processing_result',
  'refund_awaiting_record',
  'a Midtrans refund still alerts when only a bank transfer of that amount was recorded (N11)');
select is(internal.record_refund_core((select id from adjusted), pg_temp.payment_of((select id from adjusted)), 10000,
  'TRF-BANK-N16', 'Transfer bank sebagian dana', pg_temp.proof((select id from adjusted), 'bank16'),
  '00000000-0000-4000-8000-00000000f001', false) ->> 'result', 'recorded', 'then a bank transfer is recorded');
select is((select count(*)::int from public.security_alerts a join public.payments p
           on a.fingerprint = 'refund_seen:' || p.order_id
           where p.id = pg_temp.payment_of((select id from adjusted)) and a.acknowledged_at is null), 1,
  'and the alert of the refund Midtrans made stays open: a bank transfer does not answer it (N16)');
select pg_temp.act_as('superadmin_aal2');
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
  select ((public.propose_adjustment('write_off', (select id from adjusted), 2500, 'Selisih pembulatan transfer bank', pg_temp.doc('bookings/' || (select id from adjusted) || '/adjustment-' || gen_random_uuid() || '.png'), '{}', null))
    ->> 'id')::uuid as id;
select isnt((select id from public.security_alerts
              where fingerprint = 'adjustment_proposed_alone:' || (select id from write_off)), null,
  'the sole superadmin''s proposal is reported to the kelurahan head (N8)');
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
select throws_ok($$select public.reject_adjustment((select id from write_off), 'Salah')$$, '22023', null,
  'an approval is withdrawn only with a reason of ten characters or more (N2)');

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
select throws_ok($$select public.propose_adjustment('reclassify_share', (select id from shared), 99999999, 'Bagian RW salah dicatat', pg_temp.doc('bookings/' || (select id from shared) || '/adjustment-' || gen_random_uuid() || '.pdf'), jsonb_build_object('line_ref', 'package', 'from_key', (select keys[1] from shared_keys),
                     'to_key', (select keys[2] from shared_keys)), null)$$, 'P0001', null,
  'a share is not moved beyond what it holds');
create temporary table reclassified on commit drop as
  select ((public.propose_adjustment('reclassify_share', (select id from shared), 1000, 'Bagian RW salah dicatat', pg_temp.doc('bookings/' || (select id from shared) || '/adjustment-' || gen_random_uuid() || '.pdf'), jsonb_build_object('line_ref', 'package', 'from_key', (select keys[1] from shared_keys),
                       'to_key', (select keys[2] from shared_keys)), null)) ->> 'id')::uuid as id;
create temporary table withdrawn on commit drop as
  select ((public.propose_adjustment('write_off', (select id from shared), 500, 'Selisih biaya admin bank', pg_temp.doc('bookings/' || (select id from shared) || '/adjustment-' || gen_random_uuid() || '.pdf'), '{}', null))
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
select throws_ok($$select public.record_refund((select id from shared), 100000, 'TRF-003A', 'Sebagian rombongan batal',
  null, pg_temp.proof((select id from shared), '3a'))$$, 'P0001', null,
  'a refund Midtrans does not report is refused: a transfer goes through a manual_refund adjustment (N1)');
reset role;
select pg_temp.midtrans_refund(pg_temp.payment_of((select id from shared)), 100000);
select pg_temp.act_as('superadmin_aal2');
select is(public.record_refund((select id from shared), 100000, 'TRF-003A', 'Sebagian rombongan batal', null,
  pg_temp.proof((select id from shared), '3a')) ->> 'whole', 'false',
  'a partial refund after the move (L9)');
reset role;
select is((select sum(amount)::bigint from public.revenue_share_entries where booking_id = (select id from shared))
          || ':' || (select bool_and(split_part(held, '=', 2)::bigint >= 0)
                     from unnest(pg_temp.holdings((select id from shared))) as held),
  '200000:true', 'gives back a third of each share as it stands, none below nothing');
select pg_temp.midtrans_refund(pg_temp.payment_of((select id from shared)), 300000);
select pg_temp.act_as('superadmin_aal2');
select is(public.record_refund((select id from shared), 200000, 'TRF-003', 'Seluruh kunjungan dibatalkan', null,
  pg_temp.proof((select id from shared), '3')) ->> 'whole', 'true',
  'then the rest, a whole refund');
reset role;
select is((select bool_and(held like '%=0') from unnest(pg_temp.holdings((select id from shared))) as held), true,
  'gives every party back exactly the share it held after the move');

-- ===== N2: an approval that can no longer apply is withdrawn, so the next proposal is free =====
-- Terms that stopped holding: the payment refunded in between (REFUND_TOO_LARGE).
reset role;
select pg_temp.act_as('superadmin_aal2');
create temporary table stuck_refund on commit drop as
  select ((public.propose_adjustment('manual_refund', (select id from adjusted), 200000, 'Sisa dana dikembalikan', pg_temp.doc('bookings/' || (select id from adjusted) || '/adjustment-' || gen_random_uuid() || '.pdf'), '{}', pg_temp.payment_of((select id from adjusted))))
    ->> 'id')::uuid as id;
reset role;
select pg_temp.act_as_super_b();
select is((public.approve_adjustment((select id from stuck_refund)) ->> 'status'), 'approved',
  'a manual refund of 200000 is approved');
reset role;
select pg_temp.midtrans_refund(pg_temp.payment_of((select id from adjusted)), 100000);
select pg_temp.act_as('superadmin_aal2');
select is(public.record_refund((select id from adjusted), 100000, 'TRF-ADJ-B', 'Sebagian rombongan batal', null,
  pg_temp.proof((select id from adjusted), 'adj-b')) ->> 'result', 'recorded',
  'then the 100000 Midtrans refunded is recorded, whatever bank transfers came before it (N16)');
select throws_ok($$select public.apply_adjustment((select id from stuck_refund))$$, 'P0001', null,
  'so the approval no longer applies (REFUND_TOO_LARGE)');
select is((public.reject_adjustment((select id from stuck_refund), 'Sebagian dana sudah dikembalikan lewat Midtrans')
           ->> 'status'), 'rejected', 'and any superadmin withdraws it, saying why (N2)');
select isnt(((public.propose_adjustment('manual_refund', (select id from adjusted), 1000, 'Selisih kecil dikembalikan', pg_temp.doc('bookings/' || (select id from adjusted) || '/adjustment-' || gen_random_uuid() || '.pdf'), '{}', pg_temp.payment_of((select id from adjusted)))) ->> 'id'),
  null,
  'which frees the booking for the next proposal of its kind');

select is((select severity::text from public.security_alerts
           where fingerprint = 'adjustment_withdrawn:' || (select id from stuck_refund)), 'medium',
  'a withdrawn approval raises a medium alert');
select throws_ok($$select public.propose_adjustment('write_off', (select id from adjusted), 500, 'Selisih biaya admin bank', (select evidence_path from public.payment_adjustments where id = (select id from proposal)), '{}', null)$$,
  'P0001', null, 'and an evidence file that backs one adjustment backs no other (PROOF_REUSED)');

-- A share that stopped holding: the booking refunded whole after the move was approved (SHARE_TOO_LARGE).
reset role;
create temporary table doubled_keys on commit drop as
  select array_agg(distinct beneficiary_key order by beneficiary_key) as keys from public.revenue_share_entries
  where booking_id = (select id from doubled) and line_ref = 'package';
grant select on doubled_keys to authenticated;
select pg_temp.act_as('superadmin_aal2');
create temporary table stuck_move on commit drop as
  select ((public.propose_adjustment('reclassify_share', (select id from doubled), 1000, 'Bagian RW salah dicatat', pg_temp.doc('bookings/' || (select id from doubled) || '/adjustment-' || gen_random_uuid() || '.pdf'), jsonb_build_object('line_ref', 'package', 'from_key', (select keys[1] from doubled_keys),
                       'to_key', (select keys[2] from doubled_keys)), null)) ->> 'id')::uuid as id;
reset role;
select pg_temp.act_as_super_b();
select is((public.approve_adjustment((select id from stuck_move)) ->> 'status'), 'approved', 'a move is approved');
reset role;
select pg_temp.midtrans_refund(pg_temp.payment_of((select id from doubled)), 300000);
select pg_temp.act_as('superadmin_aal2');
select is(public.record_refund((select id from doubled), 300000, 'TRF-DBL', 'Seluruh kunjungan dibatalkan', null,
  pg_temp.proof((select id from doubled), 'dbl')) ->> 'whole', 'true', 'then the booking is refunded whole');
select throws_ok($$select public.apply_adjustment((select id from stuck_move))$$, 'P0001', null,
  'so the share it moves is gone (SHARE_TOO_LARGE)');
select is((public.reject_adjustment((select id from stuck_move), 'Pemesanan sudah dikembalikan seluruhnya')
           ->> 'status'), 'rejected', 'and it is withdrawn too');

-- A manual refund Midtrans carried out under its refund_key counts as one Midtrans reports (decision of the delta
-- review).
reset role;
create temporary table keyed_refund on commit drop as
  select id from public.payment_adjustments
  where booking_id = (select id from adjusted) and type = 'manual_refund' and status = 'proposed';
grant select on keyed_refund to authenticated;
insert into public.payment_events (payment_id, order_id, source, event_hash, transaction_status, status_code,
  gross_amount_raw, payload, processed_at)
select p.id, p.order_id, 'status_api', md5('uji-keyed-refund'), 'partial_refund', '200', '300000.00',
       jsonb_build_object('currency', 'IDR', 'refund_amount', '101000.00', 'refunds', jsonb_build_array(
         jsonb_build_object('refund_key', 'TRF-ADJ-B', 'refund_amount', '100000.00'),
         jsonb_build_object('refund_key', (select id from keyed_refund)::text, 'refund_amount', '1000.00'))), now()
from public.payments p where p.id = pg_temp.payment_of((select id from adjusted));
select pg_temp.act_as_super_b();
select is((public.approve_adjustment((select id from keyed_refund)) ->> 'status'), 'approved',
  'B approves a manual refund Midtrans made under the adjustment''s id');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is((public.apply_adjustment((select id from keyed_refund)) ->> 'status'), 'applied', 'it is applied');
reset role;
select is((select (payload ->> 'reported')::boolean from public.booking_events
           where reason = 'refund_recorded' and payload ->> 'refund_reference' = 'adjustment:' || (select id from keyed_refund)),
  true, 'and recorded under Midtrans'' word, since Midtrans reports it under that refund_key');
select pg_temp.act_as('superadmin_aal2');
select isnt(((public.propose_adjustment('manual_refund', (select id from adjusted), 1000, 'Selisih kecil dikembalikan', (select evidence_path from public.payment_adjustments where id = (select id from stuck_refund)), '{}', pg_temp.payment_of((select id from adjusted)))) ->> 'id'), null,
  'a rejected adjustment''s evidence may back the next proposal (L2)');

-- An approver who left: B deactivated after approving.
create temporary table stuck_write_off on commit drop as
  select ((public.propose_adjustment('write_off', (select id from combo), 1500, 'Selisih biaya admin bank', pg_temp.doc('bookings/' || (select id from combo) || '/adjustment-' || gen_random_uuid() || '.pdf'), '{}', null))
    ->> 'id')::uuid as id;
reset role;
select pg_temp.act_as_super_b();
select is((public.approve_adjustment((select id from stuck_write_off)) ->> 'status'), 'approved',
  'B approves a write-off');
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('app.privileged_rpc', 'on', true);
update public.profiles set is_active = false where id = '00000000-0000-4000-8000-00000000f002';
select set_config('app.privileged_rpc', '', true);
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.apply_adjustment((select id from stuck_write_off))$$, 'P0001',
  'the approver is no longer an active superadmin', 'and leaves before it is applied');
select is((public.reject_adjustment((select id from stuck_write_off), 'Penyetuju sudah tidak aktif lagi')
           ->> 'status'), 'rejected', 'so the remaining superadmin withdraws it');
reset role;
select is((select count(*)::int from public.audit_logs
           where action = 'adjustment.withdrawn'
             and entity_id in ((select id from stuck_refund)::text, (select id from stuck_move)::text,
                               (select id from stuck_write_off)::text)), 3,
  'each withdrawal is in the audit log');

-- ===== N8: a self-approved adjustment applied is reported =====
reset role;
select set_config('app.in_rpc', '1', true);
insert into public.payment_adjustments (id, booking_id, type, amount, reason, evidence_path, proposed_by)
select '00000000-0000-4000-8000-0000000f5001', (select id from shared), 'write_off', 700, 'Selisih biaya admin bank',
       'bookings/' || (select id from shared) || '/adjustment-00000000-0000-4000-8000-0000000f5002.pdf',
       '00000000-0000-4000-8000-00000000f001';
update public.payment_adjustments
set status = 'approved', approved_by = '00000000-0000-4000-8000-00000000f001', approved_at = now() - interval '25 hours',
    apply_not_before = now() - interval '1 hour'
where id = '00000000-0000-4000-8000-0000000f5001';
select set_config('app.in_rpc', '', true);
select pg_temp.act_as('superadmin_aal2');
select is((public.apply_adjustment('00000000-0000-4000-8000-0000000f5001') ->> 'status'), 'applied',
  'a self-approved write-off whose 24 hours have passed is applied');
reset role;
select is((select severity::text from public.security_alerts
           where fingerprint = 'adjustment_self_applied:00000000-0000-4000-8000-0000000f5001'), 'high',
  'and the kelurahan head hears of it on apply as well (N8)');

-- ===== I2: an answer without refunds[] while a manual refund is not yet counted =====
reset role;
insert into public.payment_events (payment_id, order_id, source, event_hash, transaction_status, status_code,
  gross_amount_raw, payload, processed_at)
select p.id, p.order_id, 'status_api', md5('uji-no-refund-list'), 'partial_refund', '200', '300000.00',
       '{"currency": "IDR", "refund_amount": "200000.00"}', now()
from public.payments p where p.id = pg_temp.payment_of((select id from adjusted));
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.record_refund((select id from adjusted), 1000, 'TRF-I2', 'Refund QRIS lain dicatat', null,
  pg_temp.proof((select id from adjusted), 'i2'))$$, 'P0001', null,
  'an answer that lists no refunds cannot be told apart from a bank transfer, so nothing is recorded (REFUND_LIST_MISSING)');
reset role;

select set_config('request.jwt.claims', '', true);
select set_config('app.privileged_rpc', 'on', true);
update public.profiles set is_active = true where id in (select id from other_supers);
select set_config('app.privileged_rpc', '', true);
select * from finish();
rollback;
