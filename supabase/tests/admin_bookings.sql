-- Task P4.3.10 with the admin booking path of P4.3.08 (20261104150100_admin_channel_pic_phone.sql,
-- 20261104150200_admin_bookings.sql): an officer books a walk-in group through public.create_admin_booking, the PIC's
-- number may be E.164 of any country there only, and the officer takes the cash through
-- public.mark_booking_paid_manually. The product defaults A (the officer's check of the number) and C (today's sessions
-- until they end, the 30-minute cash hold, the officer's attestation) are pinned here, so a change to them shows.
begin;
select plan(46);
\ir helpers/rls_personas.psql
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: an RW 05 package, a combo of RW 05 and RW 13, and their sessions =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000ab001', 5, 'regular', 'uji-loket-paket', 'Paket Loket', 'per_pax', 30000,
   'published');
insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000ab002', 'combo', 'uji-loket-kombo', 'Kombo Loket', 'per_pax', 40000, 'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000ab002', 5, 1), ('00000000-0000-4000-8000-0000000ab002', 13, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000ab002';

-- Today's session runs from an hour ago to an hour from now (kept inside the Jakarta day), one ended yesterday, and
-- two in three days.
create temporary table clock on commit drop as
  select (now() at time zone 'Asia/Jakarta')::time as now_jkt;
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity)
select '00000000-0000-4000-8000-0000000ab201'::uuid, 5::smallint, public.today_jkt(),
       case when now_jkt < time '01:00' then time '00:00' else now_jkt - interval '1 hour' end,
       case when now_jkt > time '22:59' then time '23:59:59' else now_jkt + interval '1 hour' end, 'Loket hari ini', 40
from clock;
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000ab202', 5, public.today_jkt() - 1, '09:00', '10:00', 'Loket kemarin', 40),
  ('00000000-0000-4000-8000-0000000ab203', 5, public.today_jkt() + 3, '09:00', '10:00', 'Loket lusa 05', 40),
  ('00000000-0000-4000-8000-0000000ab213', 13, public.today_jkt() + 3, '11:00', '12:00', 'Loket lusa 13', 40);

-- The quotes as the server hands them to the form (internal.booking_quote_hash), read by the personas below.
create temporary table quotes (name text primary key, hash text) on commit drop;
insert into quotes values
  ('rw05_4', internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000ab001', 4, '[]',
                                                                 array[5]::smallint[]))),
  ('combo_3', internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000ab002', 3, '[]',
                                                                  array[5, 13]::smallint[])));
grant select on quotes to authenticated;

create function pg_temp.booker(p_phone text, p_confirmed boolean, p_cash boolean) returns jsonb
  language sql immutable
as $$
  select jsonb_build_object('booker_type', 'individual', 'institution_name', null, 'pic_name', 'John Walker',
                            'pic_phone', p_phone, 'pic_email', 'john.walker@example.test', 'notes', null,
                            'admin', jsonb_build_object('phone_confirmed', p_confirmed, 'cash_on_the_spot', p_cash));
$$;
create function pg_temp.book(p_package uuid, p_sessions uuid[], p_pax integer, p_booker jsonb, p_key text,
  p_hash text) returns jsonb
  language sql
as $$
  select public.create_admin_booking(p_package, p_sessions, p_pax, p_booker, p_key, '2026-10-18', p_hash);
$$;
-- Functions are executable by nobody by default here; the personas call these two.
grant execute on function pg_temp.booker(text, boolean, boolean),
  pg_temp.book(uuid, uuid[], integer, jsonb, text, text) to authenticated;

-- ===== Who books =====
select pg_temp.act_as('admin_rw_08');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4, pg_temp.booker('+447700900123', true, true), 'loket-x',
    (select hash from quotes where name = 'rw05_4'))$$,
  '42501', 'only an officer of the package''s RW books for a group', 'an RW 08 officer books no RW 05 package');
reset role;
select pg_temp.act_as('admin_rw_05_aal1');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4, pg_temp.booker('+447700900123', true, true), 'loket-x',
    (select hash from quotes where name = 'rw05_4'))$$,
  '42501', 'only an officer at AAL2 books for a group', 'nor does their own officer before AAL2');
reset role;
select pg_temp.act_as('none');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4, pg_temp.booker('+447700900123', true, true), 'loket-x',
    (select hash from quotes where name = 'rw05_4'))$$,
  '42501', null, 'nor an account without a role');
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab002',
    array['00000000-0000-4000-8000-0000000ab203', '00000000-0000-4000-8000-0000000ab213']::uuid[], 3,
    pg_temp.booker('+447700900123', false, false), 'loket-x', (select hash from quotes where name = 'combo_3'))$$,
  '42501', 'only an officer of the package''s RW books for a group', 'and an RW 05 officer books no combo with RW 13');

-- ===== C: today's session, until it ends =====
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab202']::uuid[], 4, pg_temp.booker('+447700900123', true, true), 'loket-x',
    (select hash from quotes where name = 'rw05_4'))$$,
  'P0001', 'a session that has ended takes no booking', 'a session that has ended is refused');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab201']::uuid[], 4, pg_temp.booker('+447700900123', true, false), 'loket-x',
    (select hash from quotes where name = 'rw05_4'))$$,
  'P0001', 'the session has started: take the cash on the spot',
  'a session that has started is booked only with the cash taken on the spot');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab201']::uuid[], 4, pg_temp.booker('+447700900123', true, true), 'loket-x',
    repeat('0', 64))$$,
  'P0001', 'the price changed since the summary was shown', 'the quote is checked as on the web');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab201']::uuid[], 4, pg_temp.booker('12345', true, true), 'loket-x',
    (select hash from quotes where name = 'rw05_4'))$$,
  '23514', null, 'a number that is not E.164 is refused');

create temporary table walk_in on commit drop as
  select pg_temp.book('00000000-0000-4000-8000-0000000ab001', array['00000000-0000-4000-8000-0000000ab201']::uuid[], 4,
                      pg_temp.booker('+447700900123', true, true), 'loket-1',
                      (select hash from quotes where name = 'rw05_4')) as reply;
select is((select reply ->> 'result' from walk_in), 'created', 'the RW 05 officer books today''s session');
select is((select (pg_temp.book('00000000-0000-4000-8000-0000000ab001',
                   array['00000000-0000-4000-8000-0000000ab201']::uuid[], 4,
                   pg_temp.booker('+447700900123', true, true), 'loket-1',
                   (select hash from quotes where name = 'rw05_4'))) ->> 'booking_id'),
  (select reply ->> 'booking_id' from walk_in), 'the same form sent twice books once');
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table walk_in_booking on commit drop as
  select b.* from public.bookings b where b.id = (select (reply ->> 'booking_id')::uuid from walk_in);
select is((select (channel, status, created_by, pic_phone, total_amount)::text from walk_in_booking),
  '(admin,pending_payment,00000000-0000-4000-8000-00000000f005,+447700900123,120000)',
  'an admin booking of the officer, with the foreign number and the catalogue''s price');
select ok((select expires_at between now() + interval '29 minutes' and now() + interval '31 minutes'
           from walk_in_booking), 'held for 30 minutes while the cash is taken');
select is((select reserved_pax from public.visit_sessions where id = '00000000-0000-4000-8000-0000000ab201'), 4,
  'its seats are reserved as on the web');
select is((select consent_version from walk_in_booking), '2026-10-18', 'with the privacy notice the server shows');
select ok((select phone_verified_at is not null from walk_in_booking), 'A: the officer''s check verifies the number');
select is((select count(*)::int from public.booking_events
           where booking_id = (select id from walk_in_booking) and reason = 'admin_phone_confirmed'
             and actor_id = '00000000-0000-4000-8000-00000000f005'), 1, 'which booking_events names');
select is((select count(*)::int from public.audit_logs
           where entity_type = 'bookings' and entity_id = (select id::text from walk_in_booking)
             and action = 'bookings.phone_confirmed' and actor_id = '00000000-0000-4000-8000-00000000f005'), 1,
  'and the audit log');
select is((select count(*)::int from public.notifications
           where booking_id = (select id from walk_in_booking) and template = 'booking_created'), 0,
  'no booking_created message while the cash is taken at once');

-- ===== A web booking keeps +62 =====
select set_config('app.in_rpc', '1', true);
select throws_ok($$insert into public.bookings (booking_code, status, channel, package_id, package_snapshot, rw_ids,
    booker_type, pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
    consent_version, consented_at)
  values ('GSK-WEB0FRN1', 'quoted', 'web', '00000000-0000-4000-8000-0000000ab001', '{}', '{5}', 'individual', 'Web',
          '+447700900124', 'web@example.test', 1, public.today_jkt() + 3, public.today_jkt() + 3, 30000, 30000, 'v1',
          now())$$,
  '23514', null, 'a web booking with a foreign number is refused by the CHECK');
select lives_ok($$insert into public.bookings (booking_code, status, channel, package_id, package_snapshot, rw_ids,
    booker_type, pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
    consent_version, consented_at)
  values ('GSK-WEB0IDN1', 'quoted', 'web', '00000000-0000-4000-8000-0000000ab001', '{}', '{5}', 'individual', 'Web',
          '+6281300000901', 'web@example.test', 1, public.today_jkt() + 3, public.today_jkt() + 3, 30000, 30000, 'v1',
          now())$$,
  'and an Indonesian one is taken');
select set_config('app.in_rpc', '', true);

-- ===== The superadmin books a combo for later, the number unchecked =====
select pg_temp.act_as('superadmin_aal2');
create temporary table combo on commit drop as
  select pg_temp.book('00000000-0000-4000-8000-0000000ab002',
                      array['00000000-0000-4000-8000-0000000ab203', '00000000-0000-4000-8000-0000000ab213']::uuid[], 3,
                      pg_temp.booker('+6281300000902', false, false), 'loket-2',
                      (select hash from quotes where name = 'combo_3')) as reply;
reset role;
select set_config('request.jwt.claims', '', true);
create temporary table combo_booking on commit drop as
  select b.* from public.bookings b where b.id = (select (reply ->> 'booking_id')::uuid from combo);
select is((select (channel, rw_ids, created_by)::text from combo_booking),
  '(admin,"{5,13}",00000000-0000-4000-8000-00000000f001)', 'the superadmin books a combo of two RWs');
select ok((select phone_verified_at is null from combo_booking), 'A: unchecked, the number stays unverified');
select ok((select expires_at <= (public.today_jkt() + 3 + time '09:00') at time zone 'Asia/Jakarta'
                  and expires_at > now() + interval '23 hours' from combo_booking),
  'C: held as an institution''s booking, up to the first session');
select is((select array_agg(channel::text order by channel) from public.notifications
           where booking_id = (select id from combo_booking) and template = 'booking_created'),
  array['email'], 'A: and its booking_created message goes by email only');

-- ===== Cash at the counter =====
create temporary table bookings_to_pay (name text primary key, id uuid) on commit drop;
insert into bookings_to_pay values ('walk_in', (select id from walk_in_booking)), ('combo', (select id from combo_booking));
grant select on bookings_to_pay to authenticated;
create function pg_temp.pay(p_name text, p_method public.payment_method, p_amount bigint) returns jsonb
  language sql
as $$
  select public.mark_booking_paid_manually((select id from bookings_to_pay where name = p_name), p_method, p_amount,
                                           'k1', 'Kuitansi 001');
$$;
grant execute on function pg_temp.pay(text, public.payment_method, bigint) to authenticated;

reset role;
select pg_temp.act_as('superadmin_stale_totp');
select throws_ok($$select pg_temp.pay('walk_in', 'cash', 120000)$$, '42501',
  'confirm with a fresh authenticator code first', 'cash needs a fresh authenticator code');
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($select pg_temp.pay('walk_in', 'cash', 120000)$, 'P0002', null,
  'A9: cash is the RW admin''s, not the superadmin''s');
reset role;
select pg_temp.act_as('admin_rw_08');
select throws_ok($select pg_temp.pay('walk_in', 'cash', 120000)$, 'P0002', null,
  'an RW 08 officer does not see the RW 05 booking');
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select pg_temp.pay('combo', 'cash', 120000)$$, 'P0002', null,
  'nor does the RW 05 officer take the combo''s cash');
select throws_ok($$select pg_temp.pay('walk_in', 'manual_transfer', 120000)$$, 'P0001',
  'only cash for an officer''s booking is recorded here', 'a transfer is not recorded here');
select throws_ok($$select pg_temp.pay('walk_in', 'cash', 100000)$$, 'P0001', 'the cash is the booking''s whole total',
  'the cash is the whole total');
select is((pg_temp.pay('walk_in', 'cash', 120000)) ->> 'result', 'applied', 'the officer takes the cash');
select throws_ok($$select pg_temp.pay('walk_in', 'cash', 120000)$$, 'P0001', 'this booking takes no cash now',
  'once');
reset role;
select set_config('request.jwt.claims', '', true);

select is((select (status, amount_paid)::text from public.bookings where id = (select id from walk_in_booking)),
  '(paid,120000)', 'the booking is paid');
select is((select (provider, method, status, recorded_by, manual_reference)::text from public.payments
           where booking_id = (select id from walk_in_booking)),
  '(manual,cash,settled,00000000-0000-4000-8000-00000000f005,"Kuitansi 001")', 'as a cash payment the officer recorded');
select is((select count(*)::int from public.tickets_qr where booking_id = (select id from walk_in_booking)
           and status = 'issued' and key_id = 'k1'), 1, 'with its ticket');
select is((select count(*)::int from public.invoices where booking_id = (select id from walk_in_booking)
           and receipt_number is not null), 1, 'its invoice and receipt numbers');
select ok(exists (select 1 from public.revenue_share_entries where booking_id = (select id from walk_in_booking)),
  'its ledger');
select is((select array_agg(channel::text order by channel) from public.notifications
           where booking_id = (select id from walk_in_booking) and template = 'payment_received_ticket'),
  array['email', 'whatsapp'], 'and the ticket by WhatsApp, the officer having checked the number, and email');
select is((select count(*)::int from public.booking_events where booking_id = (select id from walk_in_booking)
           and reason = 'payment_settled' and to_status = 'paid'), 1, 'the payment is on the booking''s timeline');
select ok(exists (select 1 from public.audit_logs where entity_type = 'payments'
                  and actor_id = '00000000-0000-4000-8000-00000000f005'), 'and in the audit log');

-- ===== The web path is unchanged =====
select throws_ok($$select internal.create_booking('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab201']::uuid[], 2, pg_temp.booker('+6281300000903', true, true), '[]', '[]',
    'pay', 'web', 'loket-web', null, '{"version": "2026-10-18"}', null, '{}',
    (select hash from quotes where name = 'rw05_4'))$$,
  'P0001', 'a session is booked at least 12 hours before it starts', 'the web keeps its lead time for today''s session');
select throws_ok($$select internal.create_booking('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4, pg_temp.booker('+447700900125', true, true), '[]', '[]',
    'pay', 'admin', 'loket-3', null, '{"version": "2026-10-18"}', '00000000-0000-4000-8000-00000000f005', '{}',
    (select hash from quotes where name = 'rw05_4'))$$,
  '22023', 'the officer attests the PIC''s consent to the privacy notice',
  'C: an officer''s booking carries the officer''s attestation');
select throws_ok($$select internal.create_booking('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4, pg_temp.booker('+447700900125', true, true), '[]', '[]',
    'quote', 'admin', 'loket-3', null, '{"version": "2026-10-18"}', '00000000-0000-4000-8000-00000000f005', '{}',
    (select hash from quotes where name = 'rw05_4'))$$,
  '22023', 'an officer''s booking is a hold', 'and is a hold, not a quotation');

-- ===== Grants =====
select ok(not has_function_privilege('anon', 'public.create_admin_booking(uuid, uuid[], integer, jsonb, text, text, text)',
                                     'execute')
          and not has_function_privilege('service_role',
                                         'public.create_admin_booking(uuid, uuid[], integer, jsonb, text, text, text)',
                                         'execute'),
  'only a signed-in officer books for a group');
select ok(not has_function_privilege('anon',
            'public.mark_booking_paid_manually(uuid, public.payment_method, bigint, text, text, text)', 'execute')
          and not has_function_privilege('authenticated',
            'internal.create_admin_booking(uuid, uuid[], integer, jsonb, text, text, jsonb, uuid, jsonb, text)',
            'execute'),
  'and the internal path is no API role''s');
select ok(has_function_privilege('authenticated',
            'public.mark_booking_paid_manually(uuid, public.payment_method, bigint, text, text, text)', 'execute'),
  'the cash is recorded through the officer''s session');

select * from finish();
rollback;
