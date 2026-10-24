-- Task P4.4.01 (docs/PRD.md FR-SCAN-03..09; docs/Security.md §9.2; QR-02, QR-07, QR-08, AZ-14, GUEST-04): the gate's
-- staff RPCs. A preview shows the group card to an officer of the ticket's RW and wrong_rw to anyone else; the same
-- attempt returns its stored answer; a commit lets the group in once, counting the unpaid people, moving the leg, the
-- session and the booking and issuing the certificates after the last leg; a second scan reads already_used; a revoked
-- ticket and a wrong day are refused, the day overridable by the superadmin alone; the superadmin undoes a check-in
-- within 15 minutes; a QR nobody can read is found by its code and the phone's last four digits, today only, each
-- lookup logged and capped per officer and per booking (review of PR #53, M1); a QR scan names its payload (L4) and a
-- repeated record of one attempt keeps the first (L1).
begin;
select plan(73);
\ir helpers/rls_personas.psql
-- Since 20261026090000 validate_ticket and check_in_ticket are scan_ticket's alone (review of PR #54, M1); this suite
-- calls them as the officers, so it lends them out inside its own transaction.
grant execute on function public.validate_ticket(uuid, uuid, text, jsonb, text),
  public.check_in_ticket(uuid, uuid, integer, text, jsonb, boolean, text, text, text) to authenticated;
-- The kid the server signs tickets with, which svc_apply_payment_event passes and these direct calls do not.
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: paid bookings of RW 05 and a combo of RW 05 and RW 13 =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000d1001', 5, 'regular', 'uji-gerbang-05', 'Paket Uji Gerbang', 'per_pax', 25000,
   'published');
insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000d1002', 'combo', 'uji-gerbang-kombo', 'Kombo Uji Gerbang', 'per_pax', 30000, 'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000d1002', 5, 1), ('00000000-0000-4000-8000-0000000d1002', 13, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000d1002';
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000d2051', 5, public.today_jkt() + 11, '07:11', '08:11', 'Uji gerbang 05', 200),
  ('00000000-0000-4000-8000-0000000d2052', 5, public.today_jkt() + 11, '09:11', '10:11', 'Uji gerbang lain', 200),
  ('00000000-0000-4000-8000-0000000d2131', 13, public.today_jkt() + 11, '07:11', '08:11', 'Uji gerbang 13', 200);

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

-- A booking held, paid by a confirmed settlement and given its tickets, each booker with their own email so the
-- outbox's daily cap never meets another fixture's.
create function pg_temp.paid(p_package uuid, p_sessions uuid[], p_rws smallint[], p_pax integer, p_phone text)
  returns uuid
  language plpgsql
as $$
declare
  booking_id uuid;
  attempt jsonb;
  answer jsonb;
begin
  booking_id := (internal.create_booking(p_package, p_sessions, p_pax,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Gerbang', 'pic_name', 'Ani Gerbang',
                       'pic_phone', p_phone, 'pic_email', 'gerbang' || right(p_phone, 4) || '@contoh.test',
                       'notes', null),
    '[]', '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote(p_package, p_pax, '[]', p_rws))) ->> 'booking_id')::uuid;
  attempt := internal.create_payment_attempt(booking_id, null, null);
  perform internal.attach_snap_token((attempt ->> 'payment_id')::uuid, 'token-' || (attempt ->> 'order_id'),
    'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (attempt ->> 'order_id'));
  answer := jsonb_build_object('order_id', attempt ->> 'order_id', 'status_code', '200',
    'gross_amount', (select b.total_amount from public.bookings b where b.id = booking_id) || '.00',
    'signature_key', repeat('a', 128), 'transaction_status', 'settlement',
    'transaction_id', 'txn-' || (attempt ->> 'order_id'), 'payment_type', 'qris', 'currency', 'IDR',
    'fraud_status', 'accept', 'settlement_time', to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'));
  perform internal.apply_payment_event((internal.record_payment_event('webhook',
    encode(sha256(convert_to(answer::text, 'UTF8')), 'hex'), answer) ->> 'event_id')::bigint, 'webhook', answer, 'k1');
  return booking_id;
end;
$$;

-- Opens the gate of the tickets of these bookings now: create_booking never books a session that starts within the lead
-- time, and the verdict reads the ticket's own day and window, never the session's.
create function pg_temp.open_gate(p_bookings uuid[]) returns void
  language sql
as $$
  update public.tickets_qr
  set valid_on = public.today_jkt(), valid_from = now() - interval '1 hour', valid_until = now() + interval '1 hour'
  where booking_id = any (p_bookings);
$$;

create temporary table gate on commit drop as select
  pg_temp.paid('00000000-0000-4000-8000-0000000d1001', array['00000000-0000-4000-8000-0000000d2051']::uuid[],
               array[5]::smallint[], 20, '+6281300002001') as a,
  pg_temp.paid('00000000-0000-4000-8000-0000000d1002',
               array['00000000-0000-4000-8000-0000000d2051', '00000000-0000-4000-8000-0000000d2131']::uuid[],
               array[5, 13]::smallint[], 10, '+6281300002002') as b,
  pg_temp.paid('00000000-0000-4000-8000-0000000d1001', array['00000000-0000-4000-8000-0000000d2051']::uuid[],
               array[5]::smallint[], 5, '+6281300002003') as c,
  pg_temp.paid('00000000-0000-4000-8000-0000000d1001', array['00000000-0000-4000-8000-0000000d2052']::uuid[],
               array[5]::smallint[], 5, '+6281300002004') as d,
  pg_temp.paid('00000000-0000-4000-8000-0000000d1001', array['00000000-0000-4000-8000-0000000d2051']::uuid[],
               array[5]::smallint[], 8, '+6281300002005') as e;
select pg_temp.open_gate(array[(select a from gate), (select b from gate), (select c from gate), (select e from gate)]);
-- Booking C is refunded: record_refund revokes its tickets inside its own transition (Task P4.7.03).
select set_config('app.in_rpc', '1', true);
select internal.revoke_booking_tickets((select c from gate), 'pgTAP refund', null);
select set_config('app.in_rpc', '', true);

-- The tickets by name (booking letter and RW) and the answers the personas get, readable by every persona.
create temporary table gate_tickets on commit drop as
  select lower(g.letter) || lpad(t.rw_id::text, 2, '0') as name, t.id, t.ticket_code as code, b.booking_code
  from (select a as booking_id, 'a' as letter from gate union all select b, 'b' from gate union all
        select c, 'c' from gate union all select d, 'd' from gate union all select e, 'e' from gate) g
  join public.tickets_qr t on t.booking_id = g.booking_id
  join public.bookings b on b.id = t.booking_id;
create temporary table answers (name text primary key, answer jsonb) on commit drop;
grant select on gate_tickets to authenticated;
grant select, insert on answers to authenticated;
create function pg_temp.ticket(p_name text) returns uuid
  language sql stable
as $$ select id from gate_tickets where name = p_name; $$;
create function pg_temp.answer(p_name text) returns jsonb
  language sql stable
as $$ select answer from answers where name = p_name; $$;
grant execute on function pg_temp.ticket(text), pg_temp.answer(text) to authenticated;

-- ===== Preview =====
select pg_temp.act_as('admin_rw_05');
insert into answers values ('a_preview', public.validate_ticket(pg_temp.ticket('a05'),
  '00000000-0000-4000-8000-0000000de001', 'GSK.k1.preview-a', '{"user_agent": "pgTAP", "ip": "203.0.113.5"}'));
select is(pg_temp.answer('a_preview') ->> 'result', 'ok', 'an officer of the ticket''s RW previews it as ok');
select ok(pg_temp.answer('a_preview') -> 'ticket' @> jsonb_build_object('ticket_code',
  (select code from gate_tickets where name = 'a05'), 'institution_name', 'SD Negeri Gerbang', 'pic_first_name', 'Ani',
  'package_name', 'Paket Uji Gerbang', 'pax_count', 20, 'participant_count', 0, 'addons', '[]'::jsonb),
  'with the group card: code, institution, first name, package, pax');
select ok(not (pg_temp.answer('a_preview') -> 'ticket' ?| array['pic_name', 'pic_phone', 'pic_email']),
  'and no contact');
select is(public.validate_ticket(pg_temp.ticket('a05'), '00000000-0000-4000-8000-0000000de001', 'GSK.k1.preview-a',
                                 '{"user_agent": "pgTAP"}'),
  pg_temp.answer('a_preview'), 'the same attempt again gets the stored answer');
select is(public.validate_ticket(null, '00000000-0000-4000-8000-0000000de002', 'GSK.k1.forged', '{}') ->> 'result',
  'invalid_signature', 'a QR whose signature failed reads invalid_signature');
select is(public.validate_ticket('00000000-0000-4000-8000-0000000dffff', '00000000-0000-4000-8000-0000000de003',
                                 'GSK.k1.unknown', '{}'),
  '{"result": "not_found", "ticket": null, "used_at": null, "used_by": null, "checked_in_pax": null, "unpaid_pax": null}',
  'a ticket that does not exist reads not_found, with nothing else');
select is(public.validate_ticket(null, '00000000-0000-4000-8000-0000000de004', null, '{}', 'manual') ->> 'result',
  'not_found', 'and so does a manual lookup that found no ticket');
select is(public.validate_ticket(pg_temp.ticket('c05'), '00000000-0000-4000-8000-0000000de005', 'GSK.k1.c', '{}')
          ->> 'result', 'revoked', 'a refunded group''s ticket reads revoked (QR-07)');
select is(public.validate_ticket(pg_temp.ticket('d05'), '00000000-0000-4000-8000-0000000de006', 'GSK.k1.d', '{}')
          ->> 'result', 'wrong_date', 'a ticket for another day reads wrong_date');
select throws_ok($$select public.validate_ticket(pg_temp.ticket('a05'), '00000000-0000-4000-8000-0000000de007', 'x',
                    '{}', 'paper')$$, '22023', null, 'a scan comes from a QR or a manual lookup');
select throws_ok($$select public.validate_ticket(pg_temp.ticket('a05'), '00000000-0000-4000-8000-0000000df001', ' ',
                    '{}')$$, '22023', null, 'a QR preview without its payload is refused (review of PR #53, L4)');

reset role;
select pg_temp.act_as('admin_rw_08');
select is(public.validate_ticket(pg_temp.ticket('a05'), '00000000-0000-4000-8000-0000000de008', 'GSK.k1.a', '{}'),
  '{"result": "wrong_rw", "ticket": null, "used_at": null, "used_by": null, "checked_in_pax": null, "unpaid_pax": null}',
  'an officer of another RW reads wrong_rw and sees nothing of the group (AZ-14)');
select throws_ok($$select public.validate_ticket(pg_temp.ticket('a05'), '00000000-0000-4000-8000-0000000de001',
                    'GSK.k1.preview-a', '{}')$$,
  '23505', null, 'and cannot take over another officer''s attempt');
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select public.validate_ticket(pg_temp.ticket('a05'), '00000000-0000-4000-8000-0000000de009', 'x',
                    '{}')$$, '42501', null, 'a session without its authenticator scans nothing');
reset role;
select pg_temp.act_as('none');
select throws_ok($$select public.validate_ticket(pg_temp.ticket('a05'), '00000000-0000-4000-8000-0000000de010', 'x',
                    '{}')$$, '42501', null, 'nor does an account without a role');
reset role;

select is((select (s.raw_payload, s.device_info, s.ip, s.rw_id, s.source, s.phase::text)::text
           from public.ticket_scans s where s.attempt_id = '00000000-0000-4000-8000-0000000de001'),
  (encode(sha256(convert_to('GSK.k1.preview-a', 'UTF8')), 'hex'), '{"user_agent": "pgTAP"}'::jsonb,
   '203.0.113.5'::inet, 5::smallint, 'qr', 'validate')::text,
  'the scan keeps the payload''s hash, never the token, with the device, IP and the officer''s RW');
select is((select count(*)::int from public.ticket_scans s
           where s.attempt_id between '00000000-0000-4000-8000-0000000de001' and '00000000-0000-4000-8000-0000000de010'),
  7, 'one row per attempt answered, none for a refused caller or a repeat');
-- Review of PR #53, L1: two requests of one attempt that both missed the stored row both record it; the slower one
-- leaves the row as it is and reads it back instead of raising 23505.
select lives_ok($$select internal.record_scan('00000000-0000-4000-8000-0000000df002', pg_temp.ticket('a05'), 'validate',
                    'ok', 'qr', null, null, 'GSK.k1.race', '{}', null);
                  select internal.record_scan('00000000-0000-4000-8000-0000000df002', pg_temp.ticket('a05'), 'validate',
                    'wrong_date', 'qr', null, null, 'GSK.k1.race', '{}', null)$$,
  'a second record of the same attempt and phase does not raise');
select is((select array_agg(s.result::text) from public.ticket_scans s
           where s.attempt_id = '00000000-0000-4000-8000-0000000df002'),
  array['ok'], 'and keeps the first answer');

-- ===== Commit =====
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.check_in_ticket(pg_temp.ticket('a05'), '00000000-0000-4000-8000-0000000de001', 41,
                    p_raw => 'GSK.k1.preview-a')$$,
  '22023', null, 'more than twice the booking cannot come in (QR-08)');
select throws_ok($$select public.check_in_ticket(pg_temp.ticket('a05'), '00000000-0000-4000-8000-0000000de001', 22)$$,
  '22023', null, 'a QR commit without its payload is refused (review of PR #53, L4)');
insert into answers values ('a_commit', public.check_in_ticket(pg_temp.ticket('a05'),
  '00000000-0000-4000-8000-0000000de001', 22, 'Dua guru tambahan', '{"user_agent": "pgTAP"}',
  p_raw => 'GSK.k1.preview-a'));
select is(pg_temp.answer('a_commit') - 'used_at' - 'ticket',
  '{"result": "ok", "used_by": "Admin RLS 05", "checked_in_pax": 22, "unpaid_pax": 2}',
  'the commit lets 22 in on a ticket for 20, the two above recorded as unpaid');
select is(public.check_in_ticket(pg_temp.ticket('a05'), '00000000-0000-4000-8000-0000000de001', 22,
                                 p_raw => 'GSK.k1.preview-a'),
  pg_temp.answer('a_commit'), 'the same commit again gets the stored answer and changes nothing');
insert into answers values ('a_again', public.check_in_ticket(pg_temp.ticket('a05'),
  '00000000-0000-4000-8000-0000000de011', 20, p_raw => 'GSK.k1.again'));
select is(pg_temp.answer('a_again') ->> 'result', 'already_used', 'a second scan of the ticket reads already_used');
select ok(pg_temp.answer('a_again') ->> 'used_at' is not null and pg_temp.answer('a_again') ->> 'used_by' = 'Admin RLS 05',
  'with when and by whom');
reset role;

select is((select (t.status::text, t.checked_in_pax, t.unpaid_pax, t.check_in_note, l.status::text, b.status::text)::text
           from public.tickets_qr t
           join public.booking_legs l on l.id = t.booking_leg_id
           join public.bookings b on b.id = t.booking_id
           where t.id = pg_temp.ticket('a05')),
  ('used', 22, 2, 'Dua guru tambahan', 'checked_in', 'checked_in')::text,
  'the ticket is used, its leg and booking checked in');
select is((select count(*)::int from public.ticket_scans s where s.attempt_id = '00000000-0000-4000-8000-0000000de001'),
  2, 'the attempt holds its preview and its commit, once each');
select is((select count(*)::int from public.booking_events e
           where e.booking_id = (select a from gate) and e.from_status = 'paid' and e.to_status = 'checked_in'
             and e.actor_type = 'admin' and e.actor_id = pg_temp.persona_id('admin_rw_05')),
  1, 'the booking event names the officer');
select is((select array_agg(n.channel::text order by n.channel::text) from public.notifications n
           where n.booking_id = (select a from gate) and n.template = 'checked_in_thanks'),
  array['email', 'whatsapp'], 'checked_in_thanks is queued on both channels');
select is((select (count(*), count(c.released_at))::text from public.certificates c
           where c.booking_id = (select a from gate) and c.kind = 'group'),
  '(1,0)', 'the last leg issues the group certificate, held back while people came unpaid');
select is((select count(*)::int from public.notifications n
           where n.booking_id = (select a from gate) and n.template = 'certificate_ready'),
  0, 'so certificate_ready waits');

-- ===== Override (FR-SCAN-09) =====
select pg_temp.act_as('admin_rw_05');
select is(public.check_in_ticket(pg_temp.ticket('d05'), '00000000-0000-4000-8000-0000000de006', 5, null, '{}', true,
                                 'Rombongan datang lebih awal', p_raw => 'GSK.k1.d') ->> 'result',
  'wrong_date', 'an officer''s override is ignored');
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.check_in_ticket(pg_temp.ticket('d05'), '00000000-0000-4000-8000-0000000de012', 5, null,
                    '{}', true, ' ', p_raw => 'GSK.k1.d')$$, '22023', null, 'the superadmin''s override needs a reason');
select is(public.check_in_ticket(pg_temp.ticket('d05'), '00000000-0000-4000-8000-0000000de012', 5, null, '{}', true,
                                 'Rombongan datang lebih awal', p_raw => 'GSK.k1.d') ->> 'result',
  'ok', 'and with one lets the group in on another day');
reset role;
select is((select a.metadata from public.audit_logs a
           where a.action = 'check_in_override' and a.entity_id = pg_temp.ticket('d05')::text),
  '{"reason": "Rombongan datang lebih awal", "overridden": "wrong_date"}',
  'the override is audited with what it overrode and why');
select is((select s.override_reason from public.ticket_scans s
           where s.attempt_id = '00000000-0000-4000-8000-0000000de012' and s.phase = 'check_in'),
  'Rombongan datang lebih awal', 'and kept on the scan');

-- ===== A combo's two gates =====
select pg_temp.act_as('admin_rw_05');
select is(public.check_in_ticket(pg_temp.ticket('b05'), '00000000-0000-4000-8000-0000000de013', 10,
                                 p_raw => 'GSK.k1.b05') ->> 'result', 'ok',
  'the first gate of a combo lets the group in');
reset role;
select is((select (b.status::text, (select count(*) from public.certificates c where c.booking_id = b.id))::text
           from public.bookings b where b.id = (select b from gate)),
  '(checked_in,0)', 'the booking is checked in, its certificates wait for the second gate');
select pg_temp.act_as('admin_rw_13');
select is(public.check_in_ticket(pg_temp.ticket('b13'), '00000000-0000-4000-8000-0000000de014', 10,
                                 p_raw => 'GSK.k1.b13') ->> 'result', 'ok',
  'the second gate lets them in');
reset role;
select is((select (count(*), count(c.released_at), min(c.rw_ids::text))::text from public.certificates c
           where c.booking_id = (select b from gate)),
  '(1,1,"{5,13}")', 'one group certificate covers both RWs, released since nobody came unpaid');
select is((select array_agg(n.channel::text order by n.channel::text) from public.notifications n
           where n.booking_id = (select b from gate) and n.template = 'certificate_ready'),
  array['email', 'whatsapp'], 'and certificate_ready is queued on both channels');
select is((select count(*)::int from public.notifications n
           where n.booking_id = (select b from gate) and n.template = 'checked_in_thanks' and n.channel = 'whatsapp'),
  1, 'checked_in_thanks went out once for both gates');

-- ===== Undo (FR-SCAN-08) =====
select pg_temp.act_as('admin_rw_13');
select throws_ok($$select public.undo_check_in(pg_temp.ticket('b13'), 'Salah rombongan')$$, '42501', null,
  'an RW officer cannot undo a check-in');
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select public.undo_check_in(pg_temp.ticket('b13'), 'Salah rombongan')$$, '42501', null,
  'nor can the superadmin without the authenticator');
reset role;
create temporary table combo_certificate on commit drop as
  select c.id, c.certificate_number from public.certificates c where c.booking_id = (select b from gate);
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.undo_check_in(pg_temp.ticket('b13'), ' ')$$, '22023', null, 'an undo needs a reason');
select lives_ok($$select public.undo_check_in(pg_temp.ticket('b13'), 'Salah rombongan')$$,
  'the superadmin undoes the second gate within 15 minutes');
reset role;
select is((select (t.status::text, t.checked_in_pax, l.status::text, s.checked_in_pax, b.status::text)::text
           from public.tickets_qr t
           join public.booking_legs l on l.id = t.booking_leg_id
           join public.visit_sessions s on s.id = t.visit_session_id
           join public.bookings b on b.id = t.booking_id
           where t.id = pg_temp.ticket('b13')),
  ('issued', null, 'reserved', 0, 'checked_in')::text,
  'the ticket, its leg and its session count go back; the booking stays in through its first gate');
select is((select (c.status::text, c.revoke_reason, c.revoked_by_undo)::text from public.certificates c
           where c.booking_id = (select b from gate)),
  '(revoked,undo_check_in,t)', 'the certificate waits again for every leg, flagged as the undo''s');
select is((select count(*)::int from public.security_events e
           where e.event_type = 'undo_check_in' and e.entity_id = pg_temp.ticket('b13')::text
             and e.details ->> 'reason' = 'Salah rombongan'),
  1, 'the undo is a security event with its reason');
select pg_temp.act_as('admin_rw_13');
select is(public.check_in_ticket(pg_temp.ticket('b13'), '00000000-0000-4000-8000-0000000de015', 10,
                                 p_raw => 'GSK.k1.b13') ->> 'result', 'ok',
  'the group is let in again');
reset role;
select is((select (c.id, c.certificate_number, c.status::text, c.revoked_by_undo)::text from public.certificates c
           where c.booking_id = (select b from gate)),
  (select (id, certificate_number, 'issued', false)::text from combo_certificate),
  'and gets the same certificate back, number included, without the flag');
-- A check-in 16 minutes old.
update public.tickets_qr set checked_in_at = now() - interval '16 minutes' where id = pg_temp.ticket('a05');
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.undo_check_in(pg_temp.ticket('a05'), 'Terlambat dibatalkan')$$, 'P0001', null,
  'after 15 minutes a check-in stays');
select throws_ok($$select public.undo_check_in(pg_temp.ticket('c05'), 'Bukan check-in')$$, 'P0001', null,
  'and a ticket that was never used has nothing to undo');
select throws_ok($$update public.tickets_qr set status = 'issued' where id = pg_temp.ticket('a05')$$, '42501', null,
  'no one sets a ticket''s status around the RPCs');
reset role;

-- ===== A QR nobody can read (FR-SCAN-07) =====
-- The officer's lookup of a fixture booking, as the route sends it.
create function pg_temp.lookup(p_name text, p_digits text) returns jsonb
  language sql
as $$ select public.find_manual_ticket((select booking_code from gate_tickets where name = p_name), p_digits); $$;
grant execute on function pg_temp.lookup(text, text) to authenticated;
create function pg_temp.booking_of(p_name text) returns text
  language sql stable
as $$ select t.booking_id::text from public.tickets_qr t where t.id = pg_temp.ticket(p_name); $$;

select pg_temp.act_as('admin_rw_05');
select is(public.find_manual_ticket((select lower(booking_code) from gate_tickets where name = 'e05'), '2005'),
  jsonb_build_object('ticket_id', pg_temp.ticket('e05'), 'rate_limited', false),
  'the code and the phone''s last four digits find today''s ticket of the officer''s RW');
select is(pg_temp.lookup('e05', '2006'), '{"ticket_id": null, "rate_limited": false}',
  'a wrong phone finds nothing');
select is(pg_temp.lookup('d05', '2004'), '{"ticket_id": null, "rate_limited": false}',
  'nor does a ticket of another day');
insert into answers values ('e_preview', public.validate_ticket(pg_temp.ticket('e05'),
  '00000000-0000-4000-8000-0000000de016', null, '{}', 'manual'));
select is(pg_temp.answer('e_preview') ->> 'result', 'ok', 'the manual preview shows the group');
select is(public.check_in_ticket(pg_temp.ticket('e05'), '00000000-0000-4000-8000-0000000de016', 8, null, '{}', false,
                                 null, 'manual') ->> 'result',
  'ok', 'and the manual commit lets it in');
reset role;
select pg_temp.act_as('admin_rw_13');
select is(pg_temp.lookup('e05', '2005'), '{"ticket_id": null, "rate_limited": false}',
  'an officer of another RW finds nothing');
select is(pg_temp.lookup('b13', '2002'), jsonb_build_object('ticket_id', pg_temp.ticket('b13'), 'rate_limited', false),
  'but finds their own gate''s ticket of a combo');
reset role;
select is((select (s.source, e.event_type, e.severity::text)::text
           from public.ticket_scans s
           join public.security_events e on e.entity_id = s.ticket_id::text and e.event_type = 'manual_checkin'
           where s.attempt_id = '00000000-0000-4000-8000-0000000de016' and s.phase = 'check_in'),
  ('manual', 'manual_checkin', 'medium')::text, 'a manual check-in is recorded as such and is a security event');

-- ===== Manual lookups are logged and capped (review of PR #53, M1) =====
select is((select p.provolatile::text from pg_proc p where p.oid = 'public.find_manual_ticket(text, text)'::regprocedure),
  'v', 'find_manual_ticket is volatile: it counts and logs every call');
select is((select array_agg((e.details, e.severity::text, e.entity_id, e.rw_id)::text order by e.id)
           from public.security_events e
           where e.event_type = 'manual_lookup' and e.actor_id = pg_temp.persona_id('admin_rw_05')),
  array[('{"outcome": "found"}'::jsonb, 'info', pg_temp.booking_of('e05'), 5::smallint)::text,
        ('{"outcome": "wrong_digits"}'::jsonb, 'medium', pg_temp.booking_of('e05'), 5::smallint)::text,
        ('{"outcome": "not_found"}'::jsonb, 'medium', pg_temp.booking_of('d05'), 5::smallint)::text],
  'every lookup is a manual_lookup event naming the booking and the outcome, never the digits tried');

select pg_temp.act_as('admin_rw_05');
select is((select array_agg(pg_temp.lookup('e05', d) ->> 'rate_limited')
           from unnest(array['1111', '2222', '3333', '4444']) as d),
  array['false', 'false', 'false', 'false'], 'four more wrong last-four make five for the booking today');
select is(pg_temp.lookup('e05', '2005'), '{"ticket_id": null, "rate_limited": true}',
  'past five the booking answers rate_limited, even to the right digits');
select is(pg_temp.lookup('e05', '2005'), '{"ticket_id": null, "rate_limited": true}', 'and keeps doing so');
reset role;
select is((select array_agg((e.severity::text, e.details ->> 'limit', e.actor_id)::text)
           from public.security_events e
           where e.event_type = 'rate_limited' and e.entity_id = pg_temp.booking_of('e05')),
  array[('high', 'manual_lookup_booking', pg_temp.persona_id('admin_rw_05'))::text],
  'the first refusal is one high rate_limited event, the next one none');

select pg_temp.act_as('none');
select throws_ok($$select pg_temp.lookup('e05', '2005')$$, '42501', null, 'an account without a role looks up nothing');
reset role;
-- admin_rw_13 has looked up twice this hour; 28 more reach the officer's cap of 30.
select count(*) from generate_series(1, 28)
where internal.rate_limit_hit('manual_lookup:officer:' || pg_temp.persona_id('admin_rw_13'), 30, 3600);
select pg_temp.act_as('admin_rw_13');
select is(pg_temp.lookup('b13', '2002'), '{"ticket_id": null, "rate_limited": true}',
  'past 30 lookups an hour the officer gets rate_limited, even for a ticket of their own gate');
select is(pg_temp.lookup('b13', '2002') ->> 'rate_limited', 'true', 'and again');
reset role;
select is((select array_agg((e.severity::text, e.details ->> 'limit')::text)
           from public.security_events e
           where e.event_type = 'rate_limited' and e.actor_id = pg_temp.persona_id('admin_rw_13')),
  array[('high', 'manual_lookup_officer')::text], 'the officer''s first refusal is one high rate_limited event');
select is((select array_agg(e.details ->> 'outcome' order by e.id) from public.security_events e
           where e.event_type = 'manual_lookup' and e.actor_id = pg_temp.persona_id('admin_rw_13')),
  array['not_found', 'found', 'rate_limited', 'rate_limited'], 'and each refused lookup is still logged');

select * from finish();
rollback;
