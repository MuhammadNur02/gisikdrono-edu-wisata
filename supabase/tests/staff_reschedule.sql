-- 20261114080000_staff_reschedule.sql (decision of 2026-11-14): an officer moves one leg of a paid booking to another
-- open session of the same RW, free, at most twice per booking, until the day before the visit.
begin;
select plan(27);
\ir helpers/rls_personas.psql
-- The hint a statement is refused with, or null when it runs.
create function pg_temp.hint_of(p_sql text) returns text
  language plpgsql
as $$
declare
  raised_hint text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics raised_hint = pg_exception_hint;
  return raised_hint;
end;
$$;
grant execute on function pg_temp.hint_of(text) to authenticated;
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: an RW 05 package, a combo of RW 05 and RW 13, their sessions, and officers' bookings =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000be001', 5, 'regular', 'uji-pindah-paket', 'Paket Pindah', 'per_pax', 30000,
   'published');
insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000be002', 'combo', 'uji-pindah-kombo', 'Kombo Pindah', 'per_pax', 40000, 'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000be002', 5, 1), ('00000000-0000-4000-8000-0000000be002', 13, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000be002';
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000be503', 5, public.today_jkt() + 3, '09:00', '10:00', 'Pindah 05 a', 40),
  ('00000000-0000-4000-8000-0000000be505', 5, public.today_jkt() + 5, '09:00', '10:00', 'Pindah 05 b', 40),
  ('00000000-0000-4000-8000-0000000be506', 5, public.today_jkt() + 6, '09:00', '10:00', 'Pindah 05 kecil', 1),
  ('00000000-0000-4000-8000-0000000be507', 5, public.today_jkt() + 7, '09:00', '10:00', 'Pindah 05 tutup', 40),
  ('00000000-0000-4000-8000-0000000be500', 5, public.today_jkt(), '23:58', '23:59', 'Pindah 05 hari ini', 40),
  ('00000000-0000-4000-8000-0000000be513', 13, public.today_jkt() + 3, '11:00', '12:00', 'Pindah 13 a', 40),
  ('00000000-0000-4000-8000-0000000be514', 13, public.today_jkt() + 4, '11:00', '12:00', 'Pindah 13 b', 40);
update public.visit_sessions set status = 'closed' where id = '00000000-0000-4000-8000-0000000be507';

-- An officer's booking as create_admin_booking makes it, for the officer p_actor.
create function pg_temp.book(p_package uuid, p_sessions uuid[], p_pax integer, p_actor uuid, p_key text)
  returns uuid
  language sql
as $$
  select (internal.create_booking(p_package, p_sessions, p_pax,
    jsonb_build_object('booker_type', 'individual', 'institution_name', null, 'pic_name', 'Sari Pindah',
                       'pic_phone', '+6281300008' || right(p_key, 3), 'pic_email', 'pindah-' || p_key || '@example.test',
                       'notes', null, 'admin', jsonb_build_object('phone_confirmed', true, 'cash_on_the_spot', false)),
    '[]', '[]', 'pay', 'admin', p_key, null,
    jsonb_build_object('version', '2026-10-18', 'attested_by', p_actor::text), p_actor, '{}',
    internal.booking_quote_hash(internal.booking_quote(p_package, p_pax, '[]',
      (select array_agg(l.rw_id order by l.leg_order) from public.tour_package_legs l where l.package_id = p_package))))
    ->> 'booking_id')::uuid;
$$;

-- A hold paid by a confirmed Midtrans settlement, as the webhook applies it.
create function pg_temp.settle(p_booking uuid) returns void
  language plpgsql
as $$
declare
  attempt jsonb := internal.create_payment_attempt(p_booking, null, null);
  answer jsonb;
begin
  perform internal.attach_snap_token((attempt ->> 'payment_id')::uuid, 'token-' || (attempt ->> 'order_id'),
    'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (attempt ->> 'order_id'));
  answer := jsonb_build_object('order_id', attempt ->> 'order_id', 'status_code', '200',
    'gross_amount', (select b.total_amount from public.bookings b where b.id = p_booking) || '.00',
    'signature_key', repeat('a', 128), 'transaction_status', 'settlement',
    'transaction_id', 'txn-' || (attempt ->> 'order_id'), 'payment_type', 'qris', 'currency', 'IDR',
    'fraud_status', 'accept', 'settlement_time', to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'));
  perform internal.apply_payment_event((internal.record_payment_event('webhook',
    encode(sha256(convert_to(answer::text, 'UTF8')), 'hex'), answer) ->> 'event_id')::bigint, 'webhook', answer, 'k1');
end;
$$;

create temporary table booking (name text primary key, id uuid) on commit drop;
insert into booking values
  ('unpaid', pg_temp.book('00000000-0000-4000-8000-0000000be001', array['00000000-0000-4000-8000-0000000be503']::uuid[],
                          2, '00000000-0000-4000-8000-00000000f005', 'pindah-001')),
  ('paid', pg_temp.book('00000000-0000-4000-8000-0000000be001', array['00000000-0000-4000-8000-0000000be503']::uuid[],
                        2, '00000000-0000-4000-8000-00000000f005', 'pindah-002')),
  ('today', pg_temp.book('00000000-0000-4000-8000-0000000be001', array['00000000-0000-4000-8000-0000000be500']::uuid[],
                         1, '00000000-0000-4000-8000-00000000f005', 'pindah-003')),
  ('combo', pg_temp.book('00000000-0000-4000-8000-0000000be002',
                         array['00000000-0000-4000-8000-0000000be503', '00000000-0000-4000-8000-0000000be513']::uuid[],
                         1, '00000000-0000-4000-8000-00000000f001', 'pindah-004'));
grant select on booking to authenticated;

select pg_temp.act_as('admin_rw_05');
select public.mark_booking_paid_manually((select id from booking where name = 'paid'), 'cash', 60000, 'k1');
select public.mark_booking_paid_manually((select id from booking where name = 'today'), 'cash', 30000, 'k1');
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.settle((select id from booking where name = 'combo'));

-- ===== Who may move =====
select pg_temp.act_as('admin_rw_13');
select throws_ok($$select public.reschedule_booking((select id from booking where name = 'paid'),
    '00000000-0000-4000-8000-0000000be505', 'Sekolah minta pindah hari')$$,
  'P0002', null, 'an RW 13 officer moves no RW 05 booking');
reset role;
select pg_temp.act_as('admin_rw_05_aal1');
select throws_ok($$select public.reschedule_booking((select id from booking where name = 'paid'),
    '00000000-0000-4000-8000-0000000be505', 'Sekolah minta pindah hari')$$,
  '42501', 'only staff at AAL2 take this step', 'nor does their own officer before AAL2');
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.reschedule_booking((select id from booking where name = 'combo'),
    '00000000-0000-4000-8000-0000000be505', 'Rombongan minta pindah hari')$$,
  'P0002', null, 'an RW 05 officer moves no combo that also visits RW 13');

-- ===== What may move, and where to =====
select throws_ok($$select public.reschedule_booking((select id from booking where name = 'paid'),
    '00000000-0000-4000-8000-0000000be505', 'pindah')$$,
  '22023', null, 'a move names its reason');
select is(pg_temp.hint_of($$select public.reschedule_booking((select id from booking where name = 'unpaid'),
    '00000000-0000-4000-8000-0000000be505', 'Sekolah minta pindah hari')$$),
  'STATE_INVALID', 'an unpaid booking is not moved this way');
select is(pg_temp.hint_of($$select public.reschedule_booking((select id from booking where name = 'paid'),
    '00000000-0000-4000-8000-0000000be503', 'Sekolah minta pindah hari')$$),
  'STATE_INVALID', 'not to the session it is in');
select is(pg_temp.hint_of($$select public.reschedule_booking((select id from booking where name = 'paid'),
    '00000000-0000-4000-8000-0000000be514', 'Sekolah minta pindah hari')$$),
  'STATE_INVALID', 'not to another RW''s session');
select is(pg_temp.hint_of($$select public.reschedule_booking((select id from booking where name = 'paid'),
    '00000000-0000-4000-8000-0000000be507', 'Sekolah minta pindah hari')$$),
  'STATE_INVALID', 'not to a closed session');
select is(pg_temp.hint_of($$select public.reschedule_booking((select id from booking where name = 'paid'),
    '00000000-0000-4000-8000-0000000be506', 'Sekolah minta pindah hari')$$),
  'QUOTA_UNAVAILABLE', 'not to a session without room for the group');
select is(pg_temp.hint_of($$select public.reschedule_booking((select id from booking where name = 'today'),
    '00000000-0000-4000-8000-0000000be505', 'Sekolah minta pindah hari')$$),
  'RESCHEDULE_TOO_LATE', 'not on the visit day itself');

-- ===== The first move =====
select is((public.reschedule_booking((select id from booking where name = 'paid'),
            '00000000-0000-4000-8000-0000000be505', 'Sekolah minta pindah hari')) ->> 'moves_left', '1',
  'the officer moves their RW''s paid booking, one move left');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select array_agg(reserved_pax order by id) from public.visit_sessions
           where id in ('00000000-0000-4000-8000-0000000be503', '00000000-0000-4000-8000-0000000be505')),
  array[3, 2], 'the seats leave the old session and are taken in the new one');
select is((select visit_date from public.bookings where id = (select id from booking where name = 'paid')),
  public.today_jkt() + 5, 'the booking''s visit day follows');
select is((select (t.valid_on, t.visit_session_id)::text from public.tickets_qr t
           where t.booking_id = (select id from booking where name = 'paid')),
  (public.today_jkt() + 5, '00000000-0000-4000-8000-0000000be505')::text, 'and so does its ticket');
select ok(exists (select 1 from public.booking_events where booking_id = (select id from booking where name = 'paid')
                  and reason = 'staff_reschedule' and actor_id = '00000000-0000-4000-8000-00000000f005'
                  and payload ->> 'reason' = 'Sekolah minta pindah hari'), 'the timeline names the officer and why');
select ok(exists (select 1 from public.audit_logs where action = 'bookings.rescheduled'
                  and entity_id = (select id::text from booking where name = 'paid')), 'audited');
select ok(exists (select 1 from public.notifications where booking_id = (select id from booking where name = 'paid')
                  and template = 'payment_received_ticket' and dedupe_key like '%:staff_move_1'),
  'the PIC gets the ticket again');

-- ===== The cap =====
select pg_temp.act_as('admin_rw_05');
select is((public.reschedule_booking((select id from booking where name = 'paid'),
            '00000000-0000-4000-8000-0000000be503', 'Sekolah kembali ke hari semula')) ->> 'moves_left', '0',
  'a second move, none left');
select is(pg_temp.hint_of($$select public.reschedule_booking((select id from booking where name = 'paid'),
    '00000000-0000-4000-8000-0000000be505', 'Sekolah minta pindah lagi')$$),
  'RESCHEDULE_LIMIT', 'a third is refused');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select reserved_pax from public.visit_sessions where id = '00000000-0000-4000-8000-0000000be503'), 5,
  'the seats came back to the first session');

-- ===== A combo, by the superadmin, one leg at a time =====
select pg_temp.act_as('superadmin_aal2');
select is((public.reschedule_booking((select id from booking where name = 'combo'),
            '00000000-0000-4000-8000-0000000be514', 'Rombongan minta pindah hari')) ->> 'result', 'rescheduled',
  'the superadmin moves the RW 13 leg of a combo');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select array_agg(l.visit_session_id::text order by l.rw_id) from public.booking_legs l
           where l.booking_id = (select id from booking where name = 'combo')),
  array['00000000-0000-4000-8000-0000000be503', '00000000-0000-4000-8000-0000000be514'],
  'the RW 05 leg keeps its day');
select is((select (visit_date, visit_date_end)::text from public.bookings
           where id = (select id from booking where name = 'combo')),
  (public.today_jkt() + 3, public.today_jkt() + 4)::text, 'the booking now spans both days');

-- ===== A leg under an open weather notice moves through the PIC's weather right =====
select pg_temp.act_as('admin_rw_05');
select public.declare_weather_disruption('00000000-0000-4000-8000-0000000be503', 'Hujan deras dan banjir di lokasi');
select is(pg_temp.hint_of($$select public.reschedule_booking((select id from booking where name = 'paid'),
    '00000000-0000-4000-8000-0000000be505', 'Sekolah minta pindah hari')$$),
  'WEATHER_LINK_OPEN', 'a leg with an open weather notice is the PIC''s to move');
reset role;
select set_config('request.jwt.claims', '', true);

-- ===== Grants =====
select ok(not has_function_privilege('anon', 'public.reschedule_booking(uuid, uuid, text)', 'execute'),
  'anon cannot call it');
select ok(has_function_privilege('authenticated', 'public.reschedule_booking(uuid, uuid, text)', 'execute'),
  'staff call it from their own session');
select ok(not has_function_privilege('authenticated', 'internal.move_leg_to_session(uuid, public.booking_legs, public.visit_sessions)',
  'execute'), 'the move itself is internal');

select * from finish();
rollback;
