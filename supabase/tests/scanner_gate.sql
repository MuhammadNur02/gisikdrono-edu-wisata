-- Task P4.4.02 (docs/PRD.md FR-SCAN-10; docs/Security.md §9.3; QR-06, RL-03) and the re-review of PR #53: the
-- scanner's turn, its limit of 120 requests a minute and its slow-down after 30 distinct bad QR payloads in five
-- minutes, never a lock, with one scanner_lockout event and the superadmin's unlock; the manual lookup's wrong-digits cap
-- counting only officers of the booking's RW and never holding the superadmin (a); the payment behind a ticket checked
-- again at the gate (b); a commit by an officer of another RW (c); and a manual revocation of a certificate an undone
-- check-in had revoked, which sticks (d). scan_ticket and its attestation have scanner_attestation.sql.
begin;
select plan(33);
\ir helpers/rls_personas.psql
select set_config('app.qr_key_id', 'k1', true);
-- Since 20261026090000 the turn, validate_ticket and check_in_ticket are scan_ticket's alone; this suite calls them as
-- the officers, so it lends them out inside its own transaction.
grant usage on schema internal to authenticated;
grant execute on function internal.claim_scanner_turn(), public.validate_ticket(uuid, uuid, text, jsonb, text),
  public.check_in_ticket(uuid, uuid, integer, text, jsonb, boolean, text, text, text) to authenticated;

-- ===== Fixtures: paid bookings of RW 05 whose gates open now =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000c1001', 5, 'regular', 'uji-giliran-05', 'Paket Uji Giliran', 'per_pax', 25000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000c2051', 5, public.today_jkt() + 11, '07:17', '08:17', 'Uji giliran 05', 200);

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

create function pg_temp.paid(p_pax integer, p_phone text) returns uuid
  language plpgsql
as $$
declare
  held uuid;
  attempt jsonb;
  answer jsonb;
begin
  held := (internal.create_booking('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2051']::uuid[], p_pax,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Giliran', 'pic_name', 'Ani Giliran',
                       'pic_phone', p_phone, 'pic_email', 'giliran' || right(p_phone, 4) || '@contoh.test',
                       'notes', null),
    '[]', '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000c1001', p_pax, '[]',
                                                       array[5]::smallint[]))) ->> 'booking_id')::uuid;
  attempt := internal.create_payment_attempt(held, null, null);
  perform internal.attach_snap_token((attempt ->> 'payment_id')::uuid, 'token-' || (attempt ->> 'order_id'),
    'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (attempt ->> 'order_id'));
  answer := jsonb_build_object('order_id', attempt ->> 'order_id', 'status_code', '200',
    'gross_amount', (select b.total_amount from public.bookings b where b.id = held) || '.00',
    'signature_key', repeat('a', 128), 'transaction_status', 'settlement',
    'transaction_id', 'txn-' || (attempt ->> 'order_id'), 'payment_type', 'qris', 'currency', 'IDR',
    'fraud_status', 'accept', 'settlement_time', to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'));
  perform internal.apply_payment_event((internal.record_payment_event('webhook',
    encode(sha256(convert_to(answer::text, 'UTF8')), 'hex'), answer) ->> 'event_id')::bigint, 'webhook', answer, 'k1');
  update public.tickets_qr
  set valid_on = public.today_jkt(), valid_from = now() - interval '1 hour', valid_until = now() + interval '1 hour'
  where booking_id = held;
  return held;
end;
$$;

create temporary table gate on commit drop as select
  pg_temp.paid(5, '+6281300005001') as manual,
  pg_temp.paid(5, '+6281300005002') as refunded,
  pg_temp.paid(5, '+6281300005003') as partly,
  pg_temp.paid(5, '+6281300005004') as other_rw,
  pg_temp.paid(3, '+6281300005005') as undone;
grant select on gate to authenticated;

create function pg_temp.ticket_of(p_booking uuid) returns uuid
  language sql stable security definer
as $$ select t.id from public.tickets_qr t where t.booking_id = p_booking; $$;
create function pg_temp.code_of(p_booking uuid) returns text
  language sql stable security definer
as $$ select b.booking_code from public.bookings b where b.id = p_booking; $$;
grant execute on function pg_temp.ticket_of(uuid), pg_temp.code_of(uuid) to authenticated;

-- n distinct bad QR payloads (or one payload n times) previewed by the current officer.
create function pg_temp.bad_scans(p_count integer, p_prefix text, p_distinct boolean default true) returns integer
  language sql
as $$
  select count(public.validate_ticket(null, gen_random_uuid(),
                                      'GSK.k1.' || p_prefix || case when p_distinct then g::text else '' end, '{}'))::integer
  from generate_series(1, p_count) as g;
$$;
grant execute on function pg_temp.bad_scans(integer, text, boolean) to authenticated;

-- ===== The scanner's turn (FR-SCAN-10) =====
select pg_temp.act_as('admin_rw_05');
select is(internal.claim_scanner_turn(), '{"allowed": true, "retry_after_seconds": null}', 'an officer gets a turn');
select pg_temp.bad_scans(30, 'bad-');
select pg_temp.bad_scans(5, 'bad-1', false);
select count(public.validate_ticket(null, gen_random_uuid(), null, '{}', 'manual')) from generate_series(1, 5);
select is(internal.claim_scanner_turn() ->> 'allowed', 'true',
  'thirty distinct bad payloads, a repeated one and manual lookups that found nothing slow nobody down');
select pg_temp.bad_scans(1, 'bad-31-');
select is(internal.claim_scanner_turn(), '{"allowed": false, "retry_after_seconds": 1}',
  'the 31st distinct bad payload asks for one second');
select pg_temp.bad_scans(1, 'bad-32-');
select is(internal.claim_scanner_turn() ->> 'retry_after_seconds', '2', 'the 32nd for two');
select pg_temp.bad_scans(3, 'bad-35-');
select is(internal.claim_scanner_turn() ->> 'retry_after_seconds', '5', 'and from the 33rd on five, never more');
reset role;
select is((select array_agg((e.severity::text, e.details ->> 'bad_payloads')::text order by e.id)
           from public.security_events e
           where e.event_type = 'scanner_lockout' and e.actor_id = pg_temp.persona_id('admin_rw_05')),
  array[('high', '31')::text], 'one high scanner_lockout event for the whole window');

select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.unlock_scanner_officer('00000000-0000-4000-8000-00000000f005')$$, '42501', null,
  'an officer cannot unlock themselves');
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.unlock_scanner_officer('00000000-0000-4000-8000-0000000cffff')$$, 'P0002', null,
  'the superadmin unlocks staff only');
select lives_ok($$select public.unlock_scanner_officer('00000000-0000-4000-8000-00000000f005')$$,
  'the superadmin unlocks the officer');
reset role;
select pg_temp.act_as('admin_rw_05');
select is(internal.claim_scanner_turn() ->> 'allowed', 'true', 'whose earlier bad payloads no longer count');
reset role;
select is((select count(*)::int from public.audit_logs a
           where a.action = 'scanner.unlock' and a.entity_id = pg_temp.persona_id('admin_rw_05')::text
             and a.actor_id = pg_temp.persona_id('superadmin_aal2')),
  1, 'the unlock is audited under the superadmin');

select pg_temp.act_as('none');
select throws_ok($$select internal.claim_scanner_turn()$$, '42501', null, 'an account without a role gets no turn');
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select internal.claim_scanner_turn()$$, '42501', null, 'nor does a session without its authenticator');
reset role;
-- admin_rw_13 has used its 120 requests this minute.
select count(*) from generate_series(1, 120)
where internal.rate_limit_hit('scanner:user:' || pg_temp.persona_id('admin_rw_13'), 120, 60);
select pg_temp.act_as('admin_rw_13');
select ok((select (t ->> 'allowed') = 'false' and (t ->> 'retry_after_seconds')::int between 1 and 60
           from (select internal.claim_scanner_turn() as t) as turn),
  'past 120 requests a minute the officer waits for the next minute');
reset role;
select is((select p.provolatile::text from pg_proc p where p.oid = 'internal.claim_scanner_turn()'::regprocedure), 'v',
  'claim_scanner_turn is volatile: it counts every request');

-- ===== (a) the wrong-digits cap, the booking's own officers only =====
select pg_temp.act_as('admin_rw_13');
select is((select array_agg(distinct public.find_manual_ticket(pg_temp.code_of((select manual from gate)), d)::text)
           from unnest(array['1111', '2222', '3333', '4444', '5555', '6666']) as d),
  array['{"ticket_id": null, "rate_limited": false}'],
  'an officer of another RW is never held by the booking''s cap');
reset role;
select is((select count(*)::int from public.rate_limit_buckets r
           where r.key = 'manual_lookup:booking:' || (select manual from gate)::text),
  0, 'and their wrong digits are not counted against it');
select pg_temp.act_as('superadmin_aal2');
select is((select array_agg(distinct public.find_manual_ticket(pg_temp.code_of((select manual from gate)), d)::text)
           from unnest(array['1111', '2222', '3333', '4444', '5555', '6666']) as d),
  array['{"ticket_id": null, "rate_limited": false}'], 'nor is the superadmin');
select is(public.find_manual_ticket(pg_temp.code_of((select manual from gate)), '5001'),
  jsonb_build_object('ticket_id', pg_temp.ticket_of((select manual from gate)), 'rate_limited', false),
  'who still finds the ticket with the right digits');
reset role;
select pg_temp.act_as('admin_rw_05');
select is((select array_agg(public.find_manual_ticket(pg_temp.code_of((select manual from gate)), d) ->> 'rate_limited')
           from unnest(array['1111', '2222', '3333', '4444', '5555', '5001']) as d),
  array['false', 'false', 'false', 'false', 'false', 'true'],
  'an officer of the booking''s RW is still held after five wrong digits');
reset role;

-- ===== (b) the payment behind the ticket =====
select set_config('app.in_rpc', '1', true);
update public.payments set status = 'refunded' where booking_id = (select refunded from gate);
update public.payments set status = 'partially_refunded' where booking_id = (select partly from gate);
select set_config('app.in_rpc', '', true);
select pg_temp.act_as('admin_rw_05');
select is(public.validate_ticket(pg_temp.ticket_of((select refunded from gate)), gen_random_uuid(), 'GSK.k1.r', '{}')
          ->> 'result', 'booking_not_paid', 'a paid booking whose payment was refunded previews booking_not_paid');
select is(public.check_in_ticket(pg_temp.ticket_of((select refunded from gate)), gen_random_uuid(), 5,
                                 p_raw => 'GSK.k1.r') ->> 'result',
  'booking_not_paid', 'and its commit is refused (L2)');
select is(public.check_in_ticket(pg_temp.ticket_of((select partly from gate)), gen_random_uuid(), 5,
                                 p_raw => 'GSK.k1.p') ->> 'result',
  'ok', 'a partly refunded payment still lets the group in');
reset role;
select is((select t.status::text from public.tickets_qr t where t.id = pg_temp.ticket_of((select refunded from gate))),
  'issued', 'the refused ticket stays issued');

-- ===== (c) a commit by an officer of another RW =====
select pg_temp.act_as('admin_rw_13');
select is(public.check_in_ticket(pg_temp.ticket_of((select other_rw from gate)), gen_random_uuid(), 5,
                                 p_raw => 'GSK.k1.o'),
  '{"result": "wrong_rw", "ticket": null, "used_at": null, "used_by": null, "checked_in_pax": null, "unpaid_pax": null}',
  'an officer of another RW commits nothing and sees nothing of the group');
reset role;
select is((select (t.status::text, l.status::text, b.status::text)::text
           from public.tickets_qr t
           join public.booking_legs l on l.id = t.booking_leg_id
           join public.bookings b on b.id = t.booking_id
           where t.id = pg_temp.ticket_of((select other_rw from gate))),
  ('issued', 'reserved', 'paid')::text, 'the ticket, its leg and its booking are as they were');

-- ===== (d) a revocation that sticks =====
select pg_temp.act_as('admin_rw_05');
select is(public.check_in_ticket(pg_temp.ticket_of((select undone from gate)), gen_random_uuid(), 3,
                                 p_raw => 'GSK.k1.u') ->> 'result', 'ok', 'a group of three is let in');
reset role;
select pg_temp.act_as('superadmin_aal2');
select lives_ok($$select public.undo_check_in(pg_temp.ticket_of((select undone from gate)), 'Salah rombongan')$$,
  'the superadmin undoes it, which revokes the group certificate under the undo''s flag');
select lives_ok($$select public.revoke_certificate((select c.id from public.certificates c
                                                    where c.booking_id = (select undone from gate)), 'Nama sekolah salah')$$,
  'and revokes that certificate again for a reason of their own');
reset role;
select is((select (c.status::text, c.revoke_reason, c.revoked_by_undo)::text from public.certificates c
           where c.booking_id = (select undone from gate)),
  ('revoked', 'Nama sekolah salah', false)::text, 'which clears the flag');
select pg_temp.act_as('admin_rw_05');
select is(public.check_in_ticket(pg_temp.ticket_of((select undone from gate)), gen_random_uuid(), 3,
                                 p_raw => 'GSK.k1.u') ->> 'result', 'ok', 'the group is let in again');
reset role;
select is((select (count(*), count(*) filter (where c.status = 'revoked'))::text from public.certificates c
           where c.booking_id = (select undone from gate)),
  '(1,1)', 'and the superadmin''s revocation sticks');
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.revoke_certificate((select c.id from public.certificates c
                                                     where c.booking_id = (select undone from gate)), 'Lagi')$$,
  'P0001', null, 'a certificate the superadmin revoked is not revoked twice');
reset role;

select * from finish();
rollback;
