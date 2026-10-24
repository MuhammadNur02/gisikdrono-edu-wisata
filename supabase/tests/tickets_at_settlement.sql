-- Task P3.10.02 and P3.10.04 (docs/PRD.md §9.2, §9.3; docs/Security.md §3.6, §9.1; WH-12, QR-01): a settlement issues
-- one ticket per leg with its code, day and window and the kid it is signed with; it needs that kid; a poll of a paid
-- booking whose ticket went missing issues it again, once; a chargeback suspends the tickets of a visit ahead, and a
-- refund or cancellation revokes them all.
begin;
select plan(16);

-- ===== Fixtures: a combo of RW 05 and RW 13 =====
insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000a1002', 'combo', 'uji-tiket-kombo', 'Kombo Uji Tiket', 'per_pax', 30000, 'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000a1002', 5, 1), ('00000000-0000-4000-8000-0000000a1002', 13, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000a1002';
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000a2005', 5, public.today_jkt() + 5, '09:00', '10:00', 'Uji tiket 05', 200),
  ('00000000-0000-4000-8000-0000000a2013', 13, public.today_jkt() + 5, '13:00', '14:30', 'Uji tiket 13', 200);

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

create function pg_temp.combo(p_phone text) returns uuid
  language sql
as $$
  select (internal.create_booking('00000000-0000-4000-8000-0000000a1002',
    array['00000000-0000-4000-8000-0000000a2005', '00000000-0000-4000-8000-0000000a2013']::uuid[], 20,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Tiket', 'pic_name', 'Ani Tiket',
                       'pic_phone', p_phone, 'pic_email', 'tiket@contoh.test', 'notes', null),
    '[]', '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000a1002', 20, '[]',
                                                       array[5, 13]::smallint[]))) ->> 'booking_id')::uuid;
$$;

create function pg_temp.attempt(p_booking uuid) returns text
  language plpgsql
as $$
declare
  reply jsonb := internal.create_payment_attempt(p_booking, null, null);
begin
  perform internal.attach_snap_token((reply ->> 'payment_id')::uuid, 'token-' || (reply ->> 'order_id'),
                                     'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (reply ->> 'order_id'));
  return reply ->> 'order_id';
end;
$$;

create function pg_temp.answer(p_order text, p_status text) returns jsonb
  language sql
as $$
  select jsonb_build_object('order_id', p_order, 'status_code', '200', 'gross_amount', '600000.00',
    'signature_key', repeat('a', 128), 'transaction_status', p_status, 'transaction_id', 'txn-' || p_order,
    'payment_type', 'qris', 'currency', 'IDR', 'fraud_status', 'accept', 'settlement_time', '2026-10-24 09:05:00');
$$;

-- An event of the given source, applied with the key the server passes.
create function pg_temp.apply(p_order text, p_status text, p_source text, p_key text) returns jsonb
  language sql
as $$
  select internal.apply_payment_event((internal.record_payment_event(p_source,
    encode(extensions.digest(pg_temp.answer(p_order, p_status)::text || p_source || clock_timestamp()::text, 'sha256'),
           'hex'), pg_temp.answer(p_order, p_status)) ->> 'event_id')::bigint, p_source,
    case when p_source = 'webhook' then pg_temp.answer(p_order, p_status) end, p_key);
$$;

-- ===== A settlement needs the kid its tickets are signed with =====
create temporary table keyless on commit drop as select pg_temp.combo('+6281300001001') as id;
create temporary table keyless_order on commit drop as select pg_temp.attempt((select id from keyless)) as order_id;
select throws_ok($$select pg_temp.apply((select order_id from keyless_order), 'settlement', 'webhook', null)$$,
  '22023', null, 'with no QR kid, a settlement fails whole rather than paying without tickets');
select throws_ok($$select pg_temp.apply((select order_id from keyless_order), 'settlement', 'webhook', 'K1')$$,
  '22023', null, 'and a kid outside the grammar is refused');

-- ===== One ticket per leg =====
create temporary table combo on commit drop as select pg_temp.combo('+6281300001002') as id;
create temporary table combo_order on commit drop as select pg_temp.attempt((select id from combo)) as order_id;
select is(pg_temp.apply((select order_id from combo_order), 'settlement', 'webhook', 'k1') ->> 'booking_status', 'paid',
  'the combo is paid');
select is((select array_agg(t.ticket_code order by t.ticket_code) from public.tickets_qr t
           where t.booking_id = (select id from combo)),
  (select array[b.booking_code || '-05', b.booking_code || '-13'] from public.bookings b where b.id = (select id from combo)),
  'with one ticket per leg, coded by its RW');
select is((select (t.valid_on = s.session_date,
                   t.valid_from = (s.session_date + s.start_time) at time zone 'Asia/Jakarta' - interval '60 minutes',
                   t.valid_until = (s.session_date + s.end_time) at time zone 'Asia/Jakarta' + interval '120 minutes',
                   t.pax_count, t.key_id, t.status::text)
           from public.tickets_qr t join public.visit_sessions s on s.id = t.visit_session_id
           where t.booking_id = (select id from combo) and t.rw_id = 13)::text,
  (true, true, true, 20, 'k1', 'issued')::text,
  'valid on the leg''s day, from an hour before its session to two hours after, with its kid');

-- ===== The poll writes a missing ticket again, once (Task P3.10.04) =====
delete from public.tickets_qr where booking_id = (select id from combo) and rw_id = 13;
select is(pg_temp.apply((select order_id from combo_order), 'settlement', 'poll', 'k1') ->> 'processing_result',
  'completed_paid_booking', 'a poll of the paid booking completes it');
select is((select count(*)::int from public.tickets_qr where booking_id = (select id from combo)), 2,
  'with the missing leg''s ticket back');
select is(pg_temp.apply((select order_id from combo_order), 'settlement', 'poll', 'k1') ->> 'result', 'ignored',
  'and a further poll changes nothing');
select is((select count(*)::int from public.tickets_qr where booking_id = (select id from combo)), 2,
  'so no leg has two tickets');
select throws_ok($$insert into public.tickets_qr (booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code,
    valid_on, valid_from, valid_until, pax_count, key_id)
  select t.booking_id, t.booking_leg_id, t.rw_id, t.visit_session_id, t.ticket_code || 'x', t.valid_on, t.valid_from,
         t.valid_until, t.pax_count, t.key_id
  from public.tickets_qr t where t.booking_id = (select id from combo) limit 1$$, null, null,
  'a second ticket for a leg is refused');

-- ===== Chargeback, refund =====
select is(pg_temp.apply((select order_id from combo_order), 'chargeback', 'webhook', 'k1') ->> 'payment_status',
  'disputed', 'a chargeback disputes the payment');
select is((select array_agg(distinct status::text) from public.tickets_qr where booking_id = (select id from combo)),
  array['suspended'], 'and suspends the tickets of a visit still ahead');
-- record_refund and cancel_booking call it inside their own transition (Tasks P4.7.03, P3.12.02).
select set_config('app.in_rpc', '1', true);
select is(internal.revoke_booking_tickets((select id from combo), 'pgTAP refund', null), 2,
  'a refund or cancellation revokes every ticket of the booking');
select set_config('app.in_rpc', '', true);
select is((select array_agg(distinct status::text) from public.tickets_qr where booking_id = (select id from combo)),
  array['revoked'], 'both gates of the combo');

-- ===== Tickets need money behind them (0004) =====
create temporary table unpaid on commit drop as select pg_temp.combo('+6281300001003') as id;
select set_config('app.qr_key_id', 'k1', true);
select throws_ok($$select internal.issue_booking_tickets((select id from unpaid))$$, 'P0001', null,
  'an unpaid booking gets no ticket');
select is((select count(*)::int from public.tickets_qr where booking_id = (select id from unpaid)), 0,
  'so it has none');

select * from finish();
rollback;
