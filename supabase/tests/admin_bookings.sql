-- Task P4.3.10 with the admin booking path of P4.3.08 (20261104220000_admin_channel_pic_phone.sql,
-- 20261104220100_admin_bookings.sql): an officer books a walk-in group through public.create_admin_booking, the PIC's
-- number may be E.164 of another country there only, and an RW admin takes the cash through
-- public.mark_booking_paid_manually. The owner's decisions are pinned here, so a change to them shows: A21 (the
-- officer's check of the number), A22 (today's sessions until they end) and A23 (cash by an RW admin of a booking of
-- one RW, until 23:59 WIB of the visit day, so its hold runs until then).
begin;
select plan(92);
\ir helpers/rls_personas.psql
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: an RW 05 package, a short-lived one, a combo of RW 05 and RW 13, and their sessions =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status, valid_to)
values
  ('00000000-0000-4000-8000-0000000ab001', 5, 'regular', 'uji-loket-paket', 'Paket Loket', 'per_pax', 30000,
   'published', null),
  ('00000000-0000-4000-8000-0000000ab003', 5, 'regular', 'uji-loket-singkat', 'Paket Loket Singkat', 'per_pax',
   30000, 'published', public.today_jkt() + 1);
insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000ab002', 'combo', 'uji-loket-kombo', 'Kombo Loket', 'per_pax', 40000, 'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000ab002', 5, 1), ('00000000-0000-4000-8000-0000000ab002', 13, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000ab002';

-- Today's session runs from an hour ago to an hour from now (kept inside the Jakarta day); one ended yesterday; two in
-- three days; one of five seats; one past booking.max_advance_days.
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
  ('00000000-0000-4000-8000-0000000ab213', 13, public.today_jkt() + 3, '11:00', '12:00', 'Loket lusa 13', 40),
  ('00000000-0000-4000-8000-0000000ab204', 5, public.today_jkt() + 4, '09:00', '10:00', 'Loket kecil', 5),
  ('00000000-0000-4000-8000-0000000ab205', 5, public.today_jkt() + 181, '09:00', '10:00', 'Loket jauh', 40);

-- The quotes as the server hands them to the form (internal.booking_quote_hash), read by the personas below.
create temporary table quotes (name text primary key, hash text) on commit drop;
insert into quotes values
  ('rw05_2', internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000ab001', 2, '[]',
                                                                 array[5]::smallint[]))),
  ('rw05_4', internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000ab001', 4, '[]',
                                                                 array[5]::smallint[]))),
  ('rw05_6', internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000ab001', 6, '[]',
                                                                 array[5]::smallint[]))),
  ('short_4', internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000ab003', 4, '[]',
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
    array['00000000-0000-4000-8000-0000000ab202']::uuid[], 4, pg_temp.booker('+447700900123', true, true), 'loket-x',
    (select hash from quotes where name = 'rw05_4'))$$,
  '42501', 'only an officer of the package''s RW books for a group',
  'an RW 08 officer books no RW 05 package, refused before the session is looked at');
reset role;
select pg_temp.act_as('admin_rw_05_aal1');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4, pg_temp.booker('+447700900123', true, true), 'loket-x',
    (select hash from quotes where name = 'rw05_4'))$$,
  '42501', 'only an officer at AAL2 books for a group', 'their own officer before AAL2 is refused by the AAL2 guard');
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4, pg_temp.booker('+447700900123', true, false), 'loket-x',
    (select hash from quotes where name = 'rw05_4'))$$,
  '42501', 'only an officer at AAL2 books for a group', 'and so is the superadmin before AAL2');
reset role;
select pg_temp.act_as('none');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4, pg_temp.booker('+447700900123', true, true), 'loket-x',
    (select hash from quotes where name = 'rw05_4'))$$,
  '42501', 'only an officer at AAL2 books for a group', 'an account without a role, at AAL2, is no officer');
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab002',
    array['00000000-0000-4000-8000-0000000ab203', '00000000-0000-4000-8000-0000000ab213']::uuid[], 3,
    pg_temp.booker('+447700900123', false, false), 'loket-x', (select hash from quotes where name = 'combo_3'))$$,
  '42501', 'only an officer of the package''s RW books for a group', 'an RW 05 officer books no combo with RW 13');

-- ===== A22: the sessions an officer books =====
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab202']::uuid[], 4, pg_temp.booker('+447700900123', true, true), 'loket-x',
    (select hash from quotes where name = 'rw05_4'))$$,
  'P0001', 'a session that has ended takes no booking', 'a session that has ended is refused');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab205']::uuid[], 4, pg_temp.booker('+447700900123', true, true), 'loket-x',
    (select hash from quotes where name = 'rw05_4'))$$,
  'P0001', 'a session is booked at most 180 days ahead', 'booking.max_advance_days still applies');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab003',
    array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4, pg_temp.booker('+447700900123', true, true), 'loket-x',
    (select hash from quotes where name = 'short_4'))$$,
  'P0001', null, 'and so does the package''s validity');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab204']::uuid[], 6, pg_temp.booker('+447700900123', true, true), 'loket-x',
    (select hash from quotes where name = 'rw05_6'))$$,
  'P0001', null, 'and the quota: six visitors do not fit five seats');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4, pg_temp.booker('+447700900123', true, true), 'loket-x',
    repeat('0', 64))$$,
  'P0001', 'the price changed since the summary was shown', 'the quote is checked as on the web');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4, pg_temp.booker('12345', true, true), 'loket-x',
    (select hash from quotes where name = 'rw05_4'))$$,
  '23514', null, 'a number that is not E.164 is refused');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4, pg_temp.booker('+6224761', true, true), 'loket-x',
    (select hash from quotes where name = 'rw05_4'))$$,
  '23514', null, 'and so is a +62 number too short to be Indonesian, which the foreign branch does not take');

create temporary table walk_in on commit drop as
  select pg_temp.book('00000000-0000-4000-8000-0000000ab001', array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4,
                      pg_temp.booker('+447700900123', true, true), 'loket-1',
                      (select hash from quotes where name = 'rw05_4')) as reply;
select is((select (reply ->> 'result', reply ->> 'total_amount') from walk_in)::text, '(created,120000)',
  'the RW 05 officer books a session in three days, and hears its total');
select is((select (pg_temp.book('00000000-0000-4000-8000-0000000ab001',
                   array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4,
                   pg_temp.booker('+447700900123', true, true), 'loket-1',
                   (select hash from quotes where name = 'rw05_4'))) ->> 'booking_id'),
  (select reply ->> 'booking_id' from walk_in), 'the same form sent twice books once');
create temporary table later on commit drop as
  select pg_temp.book('00000000-0000-4000-8000-0000000ab001', array['00000000-0000-4000-8000-0000000ab203']::uuid[], 2,
                      pg_temp.booker('+6281300000903', true, true), 'loket-3',
                      (select hash from quotes where name = 'rw05_2')) as reply;
create temporary table today_walk_in on commit drop as
  select pg_temp.book('00000000-0000-4000-8000-0000000ab001', array['00000000-0000-4000-8000-0000000ab201']::uuid[],
                      2, pg_temp.booker('+447700900127', true, true), 'loket-5',
                      (select hash from quotes where name = 'rw05_2')) as reply
  where (now() at time zone 'Asia/Jakarta')::time < time '23:30';
select case when exists (select 1 from today_walk_in)
  then is((select reply ->> 'result' from today_walk_in), 'created',
          'A22: today''s session that has started is booked until it ends')
  else skip('too late in the Jakarta day to pay for a session of today', 1) end;
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table walk_in_booking on commit drop as
  select b.* from public.bookings b where b.id = (select (reply ->> 'booking_id')::uuid from walk_in);
select is((select (channel, status, created_by, pic_phone, total_amount)::text from walk_in_booking),
  '(admin,pending_payment,00000000-0000-4000-8000-00000000f005,+447700900123,120000)',
  'an admin booking of the officer, with the foreign number and the catalogue''s price');
select is((select expires_at from walk_in_booking), (public.today_jkt() + 3 + time '23:59') at time zone 'Asia/Jakarta',
  'A23: a booking of one RW is held until 23:59 WIB of its visit day, as long as cash may be taken');
select is((select reserved_pax from public.visit_sessions where id = '00000000-0000-4000-8000-0000000ab203'), 6,
  'its seats are reserved as on the web, beside the two the next booking took');
select is((select consent_version from walk_in_booking), '2026-10-18', 'with the privacy notice the server shows');
select ok((select phone_verified_at is not null from walk_in_booking), 'A21: the officer''s check verifies the number');
select is((select count(*)::int from public.booking_events
           where booking_id = (select id from walk_in_booking) and reason = 'admin_phone_confirmed'
             and actor_id = '00000000-0000-4000-8000-00000000f005'), 1, 'which booking_events names');
select is((select count(*)::int from public.audit_logs
           where entity_type = 'bookings' and entity_id = (select id::text from walk_in_booking)
             and action = 'bookings.phone_confirmed' and actor_id = '00000000-0000-4000-8000-00000000f005'), 1,
  'and the audit log');
select is((select count(*)::int from public.notifications
           where booking_id = (select id from walk_in_booking) and template = 'booking_created'), 0,
  'no pay link while the cash is about to be taken');

-- ===== The phone CHECK and the form key across channels =====
select set_config('app.in_rpc', '1', true);
select throws_ok($$insert into public.bookings (booking_code, status, channel, package_id, package_snapshot, rw_ids,
    booker_type, pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
    consent_version, consented_at)
  values ('GSK-WEB0FRN1', 'quoted', 'web', '00000000-0000-4000-8000-0000000ab001', '{}', '{5}', 'individual', 'Web',
          '+447700900124', 'web@example.test', 1, public.today_jkt() + 3, public.today_jkt() + 3, 30000, 30000, 'v1',
          now())$$,
  '23514', null, 'a web booking with a foreign number is refused by the CHECK');
insert into public.bookings (booking_code, status, channel, package_id, package_snapshot, rw_ids, booker_type,
  pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  consent_version, consented_at, expires_at, idempotency_key)
values ('GSK-WEB0DNA1', 'pending_payment', 'web', '00000000-0000-4000-8000-0000000ab001', '{}', '{5}', 'individual',
        'Web', '+6281300000901', 'web@example.test', 1, public.today_jkt() + 3, public.today_jkt() + 3, 30000, 30000,
        'v1', now(), now() + interval '2 hours', 'loket-bersama');
select ok(exists (select 1 from public.bookings where booking_code = 'GSK-WEB0DNA1'), 'and an Indonesian one is taken');
-- An officer's booking of yesterday's visit whose hold still runs, for the end of the cash day.
insert into public.bookings (booking_code, status, channel, package_id, package_snapshot, rw_ids, booker_type,
  pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  consent_version, consented_at, expires_at, created_by)
values ('GSK-ADM0KMRN', 'pending_payment', 'admin', '00000000-0000-4000-8000-0000000ab001', '{}', '{5}', 'individual',
        'Kemarin', '+447700900126', 'kemarin@example.test', 1, public.today_jkt() - 1, public.today_jkt() - 1, 30000,
        30000, 'v1', now(), now() + interval '1 hour', '00000000-0000-4000-8000-00000000f005');
select set_config('app.in_rpc', '', true);
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4, pg_temp.booker('+447700900125', true, false),
    'loket-bersama', (select hash from quotes where name = 'rw05_4'))$$,
  '23505', null, 'a form key a web booking used is never an officer''s');

-- ===== A23: only an RW admin takes the cash =====
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4, pg_temp.booker('+447700900125', true, true), 'loket-x',
    (select hash from quotes where name = 'rw05_4'))$$,
  '42501', 'only an RW admin takes cash, for a package of their own RW', 'the superadmin books no cash on the spot');
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
select ok((select phone_verified_at is null from combo_booking), 'A21: unchecked, the number stays unverified');
select ok((select expires_at <= (public.today_jkt() + 3 + time '09:00') at time zone 'Asia/Jakarta'
                  and expires_at > now() + interval '23 hours' from combo_booking),
  'A23: a combo, paid through its link, keeps the institution hold up to its first session');
select is((select array_agg(channel::text order by channel::text) from public.notifications
           where booking_id = (select id from combo_booking) and template = 'booking_created'),
  array['email'], 'A21: and its pay link goes by email only');

-- ===== Cash at the counter =====
create temporary table bookings_to_pay (name text primary key, id uuid) on commit drop;
insert into bookings_to_pay
select 'walk_in', id from walk_in_booking
union all select 'combo', id from combo_booking
union all select 'later', (reply ->> 'booking_id')::uuid from later
union all select 'web', id from public.bookings where booking_code = 'GSK-WEB0DNA1'
union all select 'yesterday', id from public.bookings where booking_code = 'GSK-ADM0KMRN'
union all select 'today', (reply ->> 'booking_id')::uuid from today_walk_in;
grant select on bookings_to_pay to authenticated;
create function pg_temp.pay(p_name text, p_amount bigint, p_key text) returns jsonb
  language sql
as $$
  select public.mark_booking_paid_manually((select id from bookings_to_pay where name = p_name), 'cash', p_amount,
                                           p_key, 'Kuitansi 001');
$$;
-- The cash of a group already at the counter, counted in (A23 addendum).
create function pg_temp.pay_present(p_name text, p_amount bigint, p_count integer) returns jsonb
  language sql
as $$
  select public.mark_booking_paid_manually((select id from bookings_to_pay where name = p_name), 'cash', p_amount,
                                           'k1', 'Kuitansi 002', null, p_count);
$$;
grant execute on function pg_temp.pay(text, bigint, text), pg_temp.pay_present(text, bigint, integer)
  to authenticated;

select pg_temp.act_as('superadmin_stale_totp');
select throws_ok($$select pg_temp.pay('walk_in', 120000, 'k1')$$, '42501',
  'confirm with a fresh authenticator code first', 'cash needs a fresh authenticator code');
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select pg_temp.pay('walk_in', 120000, 'k1')$$, 'P0002', null,
  'A23: cash is the RW admin''s, not the superadmin''s');
reset role;
select pg_temp.act_as('admin_rw_08');
select throws_ok($$select pg_temp.pay('walk_in', 120000, 'k1')$$, 'P0002', null,
  'an RW 08 officer does not take the RW 05 booking''s cash');
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select pg_temp.pay('combo', 120000, 'k1')$$, 'P0002', null,
  'nor does the RW 05 officer take a combo''s cash: it is paid through its link');
select throws_ok($$select public.mark_booking_paid_manually((select id from bookings_to_pay where name = 'walk_in'),
    'manual_transfer', 120000, 'k1')$$,
  'P0001', 'only cash for an officer''s booking is recorded here', 'a transfer is not recorded here');
select throws_ok($$select pg_temp.pay('walk_in', 120000, 'k9')$$, 'P0001',
  'the QR key id is not one tickets are signed with', 'a QR key id off the allow-list is refused');
select throws_ok($$select pg_temp.pay('web', 30000, 'k1')$$, 'P0001', 'this booking takes no cash now',
  'a web booking takes no cash');
select throws_ok($$select pg_temp.pay('yesterday', 30000, 'k1')$$, 'P0001', 'this booking takes no cash now',
  'A23: nor one whose visit day ended at 23:59 WIB, however long its hold runs');
select throws_ok($$select pg_temp.pay('walk_in', 100000, 'k1')$$, 'P0001', 'the cash is the booking''s whole total',
  'the cash is the whole total');
reset role;
select set_config('request.jwt.claims', '', true);

-- A Midtrans attempt the PIC opened and a booking under review take no cash.
create temporary table open_attempt on commit drop as
  select internal.create_payment_attempt((select id from walk_in_booking), null, null) as reply;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select pg_temp.pay('walk_in', 120000, 'k1')$$, 'P0001', 'this booking takes no cash now',
  'cash waits while a Midtrans order is open, which the server ends first');
reset role;
select set_config('request.jwt.claims', '', true);
select internal.record_payment_failure((select (reply ->> 'payment_id')::uuid from open_attempt), 'expired', null);
select set_config('app.in_rpc', '1', true);
update public.bookings set needs_review = true, review_reason = 'UJI' where id = (select id from walk_in_booking);
select set_config('app.in_rpc', '', true);
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select pg_temp.pay('walk_in', 120000, 'k1')$$, 'P0001', 'this booking takes no cash now',
  'a booking under review takes no cash');
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('app.in_rpc', '1', true);
update public.bookings set needs_review = false, review_reason = null where id = (select id from walk_in_booking);
select set_config('app.in_rpc', '', true);

select pg_temp.act_as('admin_rw_05');
select throws_ok($$select pg_temp.pay_present('walk_in', 120000, 4)$$, 'P0001',
  'cash after the session started counts the group in, and only then',
  'nobody is counted in before the session starts');
select is((pg_temp.pay('walk_in', 120000, 'k1')) ->> 'result', 'applied', 'the RW admin takes the cash');
select throws_ok($$select pg_temp.pay('walk_in', 120000, 'k1')$$, 'P0001', 'this booking takes no cash now',
  'once');
select case when exists (select 1 from today_walk_in)
  then throws_ok($$select pg_temp.pay('today', 60000, 'k1')$$, 'P0001',
                 'cash after the session started counts the group in, and only then',
                 'A23: cash after the session started asks for the group to be counted in')
  else skip('too late in the Jakarta day to pay for a session of today', 1) end;
select case when exists (select 1 from today_walk_in)
  then is((pg_temp.pay_present('today', 60000, 2)) ->> 'result', 'applied', 'and with the count it is taken')
  else skip('too late in the Jakarta day to pay for a session of today', 1) end;
reset role;
select set_config('request.jwt.claims', '', true);
select case when exists (select 1 from today_walk_in)
  then is((select status::text from public.bookings where id = (select id from bookings_to_pay where name = 'today')),
          'checked_in', 'the group is checked in, so the booking never becomes no_show')
  else skip('too late in the Jakarta day to pay for a session of today', 1) end;
select case when exists (select 1 from today_walk_in)
  then is((select (status, checked_in_pax)::text from public.tickets_qr
           where booking_id = (select id from bookings_to_pay where name = 'today')),
          '(used,2)', 'through its ticket, with the count')
  else skip('too late in the Jakarta day to pay for a session of today', 1) end;
select case when exists (select 1 from today_walk_in)
  then is((select count(*)::int from public.ticket_scans s join public.tickets_qr t on t.id = s.ticket_id
           where t.booking_id = (select id from bookings_to_pay where name = 'today')
             and s.phase = 'check_in' and s.result = 'ok' and s.source = 'manual' and s.attendee_count = 2
             and s.scanned_by = '00000000-0000-4000-8000-00000000f005'), 1, 'as a manual check-in by the officer')
  else skip('too late in the Jakarta day to pay for a session of today', 1) end;
select case when exists (select 1 from today_walk_in)
  then is((select count(*)::int from public.notifications
           where booking_id = (select id from bookings_to_pay where name = 'today')
             and template = 'payment_received_ticket' and channel = 'whatsapp' and status = 'queued'), 0,
          'and no WhatsApp ticket message goes out as if the ticket were still to use (L-B)')
  else skip('too late in the Jakarta day to pay for a session of today', 1) end;

select is((select (status, amount_paid)::text from public.bookings where id = (select id from walk_in_booking)),
  '(paid,120000)', 'the booking is paid');
select is((select (provider, method, status, recorded_by, manual_reference)::text from public.payments
           where booking_id = (select id from walk_in_booking) and provider = 'manual'),
  '(manual,cash,settled,00000000-0000-4000-8000-00000000f005,"Kuitansi 001")', 'as a cash payment the officer recorded');
select is((select count(*)::int from public.tickets_qr where booking_id = (select id from walk_in_booking)
           and status = 'issued' and key_id = 'k1'), 1, 'with its ticket');
select is((select count(*)::int from public.invoices where booking_id = (select id from walk_in_booking)
           and receipt_number is not null), 1, 'its invoice and receipt numbers');
select ok(exists (select 1 from public.revenue_share_entries where booking_id = (select id from walk_in_booking)),
  'its ledger');
select is((select array_agg(channel::text order by channel::text) from public.notifications
           where booking_id = (select id from walk_in_booking) and template = 'payment_received_ticket'),
  array['email', 'whatsapp'], 'and the ticket by WhatsApp, the officer having checked the number, and email');
select is((select status::text from public.notifications
           where template = 'admin_new_paid_booking' and recipient = 'rls-admin05@example.test'
             and dedupe_key like 'booking:' || (select id from walk_in_booking) || ':%'),
  'cancelled', 'the officer who took the cash gets no email that it was paid');
select is((select count(*)::int from public.booking_events where booking_id = (select id from walk_in_booking)
           and reason = 'payment_settled' and to_status = 'paid'), 1, 'the payment is on the booking''s timeline');
select ok(exists (select 1 from public.audit_logs where entity_type = 'payments'
                  and actor_id = '00000000-0000-4000-8000-00000000f005'), 'and in the audit log');

-- ===== The pay link when the cash is left for later =====
select pg_temp.act_as('admin_rw_05');
select lives_ok($$select public.send_admin_booking_link((select id from bookings_to_pay where name = 'later'))$$,
  'the officer leaves the cash for later and sends the pay link');
select lives_ok($$select public.send_admin_booking_link((select id from bookings_to_pay where name = 'later'))$$,
  'twice, which sends nothing twice');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select array_agg(channel::text order by channel::text) from public.notifications
           where booking_id = (select id from bookings_to_pay where name = 'later') and template = 'booking_created'),
  array['email', 'whatsapp'], 'the PIC gets the pay link once on each channel');
select is((select count(*)::int from public.booking_events
           where booking_id = (select id from bookings_to_pay where name = 'later') and reason = 'admin_pay_link_sent'),
  1, 'only a sending that queued a message is on the timeline');
select pg_temp.act_as('admin_rw_08');
select throws_ok($$select public.send_admin_booking_link((select id from bookings_to_pay where name = 'later'))$$,
  'P0002', null, 'another RW''s officer sends no pay link');
reset role;
select pg_temp.act_as('admin_rw_05_aal1');
select throws_ok($$select public.send_admin_booking_link((select id from bookings_to_pay where name = 'later'))$$,
  '42501', 'only an officer at AAL2 sends a pay link', 'nor their own officer before AAL2');
reset role;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.send_admin_booking_link((select id from bookings_to_pay where name = 'web'))$$,
  'P0001', 'this booking takes no pay link now', 'a web booking gets its links on its own path');
select throws_ok($$select public.send_admin_booking_link((select id from bookings_to_pay where name = 'walk_in'))$$,
  'P0001', 'this booking takes no pay link now', 'and a paid booking none');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select expires_at from public.bookings where id = (select id from bookings_to_pay where name = 'later')),
  (public.today_jkt() + 3 + time '23:59') at time zone 'Asia/Jakarta',
  'A23: held until 23:59 WIB of the visit day, so the cash can still be taken that day');

-- ===== A lapsed officer's hold frees its seats, and takes no cash after =====
select set_config('app.hold_extension', '1', true);
select set_config('app.in_rpc', '1', true);
update public.bookings set expires_at = now() - interval '10 minutes'
where id = (select id from bookings_to_pay where name = 'later');
select set_config('app.hold_extension', '', true);
select set_config('app.in_rpc', '', true);
select internal.expire_stale_bookings();
select is((select status::text from public.bookings where id = (select id from bookings_to_pay where name = 'later')),
  'expired', 'expire_stale_bookings ends a lapsed officer''s hold');
select is((select reserved_pax from public.visit_sessions where id = '00000000-0000-4000-8000-0000000ab203'), 7,
  'and gives its two seats back, the paid booking and the combo keeping theirs');
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select pg_temp.pay('later', 60000, 'k1')$$, 'P0001', 'this booking takes no cash now',
  'and a lapsed hold takes no cash, so no seat is taken again past the capacity');
select throws_ok($$select public.send_admin_booking_link((select id from bookings_to_pay where name = 'later'))$$,
  'P0001', 'this booking takes no pay link now', 'nor a pay link');
reset role;
select set_config('request.jwt.claims', '', true);

-- ===== A23 addendum: an officer's hold unpaid for a week =====
select set_config('app.in_rpc', '1', true);
insert into public.bookings (booking_code, status, channel, package_id, package_snapshot, rw_ids, booker_type,
  pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  consent_version, consented_at, expires_at, created_by, created_at)
values ('GSK-ADM0TAMA', 'pending_payment', 'admin', '00000000-0000-4000-8000-0000000ab001', '{}', '{5}', 'individual',
        'Lama', '+447700900128', 'lama@example.test', 1, public.today_jkt() + 3, public.today_jkt() + 3, 30000, 30000,
        'v1', now() - interval '8 days', now() + interval '1 day', '00000000-0000-4000-8000-00000000f005',
        now() - interval '8 days');
select set_config('app.in_rpc', '', true);
select internal.payments_housekeeping();
select is((select (rule, severity)::text from public.security_alerts
           where fingerprint = 'admin_hold_unpaid_long:' || (select id from public.bookings
                                                             where booking_code = 'GSK-ADM0TAMA')),
  '(admin_hold_unpaid_long,medium)', 'an officer''s hold unpaid for a week raises a medium alert');
select internal.payments_housekeeping();
select is((select count(*)::int from public.security_alerts where rule = 'admin_hold_unpaid_long'
           and fingerprint = 'admin_hold_unpaid_long:' || (select id from public.bookings
                                                           where booking_code = 'GSK-ADM0TAMA')), 1,
  'L-D: a second run raises no second alert');

-- ===== Delta review of PR #91, L-F: internal.close_attempt_for_cash =====
create temporary table tama_order on commit drop as select gen_random_uuid() as id;
select set_config('app.in_rpc', '1', true);
insert into public.payments (id, booking_id, attempt_no, provider, method, status, order_id, gross_amount)
select (select id from tama_order), b.id, 1, 'midtrans', 'qris', 'pending', b.booking_code || '-01', 30000
from public.bookings b where b.booking_code = 'GSK-ADM0TAMA';
select set_config('app.in_rpc', '', true);
select internal.close_attempt_for_cash((select id from tama_order), '00000000-0000-4000-8000-00000000f005');
select is((select status::text from public.payments where id = (select id from tama_order)), 'expired',
  'L-F: the PIC''s open order is closed as expired');
select is((select (actor_type, actor_id)::text from public.booking_events
           where booking_id = (select id from public.bookings where booking_code = 'GSK-ADM0TAMA')
             and reason = 'payment_expired_for_cash'),
  '(admin,00000000-0000-4000-8000-00000000f005)', 'with the officer as the event''s actor');
select internal.close_attempt_for_cash((select p.id from public.payments p
                                        join public.bookings b on b.id = p.booking_id
                                        where b.id = (select id from bookings_to_pay where name = 'walk_in')
                                          and p.status = 'settled'), '00000000-0000-4000-8000-00000000f005');
select is((select count(*)::int from public.payments p
           where p.booking_id = (select id from bookings_to_pay where name = 'walk_in') and p.status = 'settled'), 1,
  'a settled payment is left as it is');
select is((select count(*)::int from public.booking_events
           where booking_id = (select id from bookings_to_pay where name = 'walk_in')
             and reason = 'payment_expired_for_cash'), 0, 'and writes no event');
create temporary table tama_review on commit drop as select gen_random_uuid() as id;
select set_config('app.in_rpc', '1', true);
insert into public.payments (id, booking_id, attempt_no, provider, method, status, order_id, gross_amount)
select (select id from tama_review), b.id, 2, 'midtrans', 'qris', 'needs_review', b.booking_code || '-02', 30000
from public.bookings b where b.booking_code = 'GSK-ADM0TAMA';
select set_config('app.in_rpc', '', true);
select internal.close_attempt_for_cash((select id from tama_review), '00000000-0000-4000-8000-00000000f005');
select is((select status::text from public.payments where id = (select id from tama_review)), 'needs_review',
  'nor does it close a payment under review');
select ok(not has_function_privilege('authenticated', 'internal.close_attempt_for_cash(uuid, uuid)', 'execute')
          and not has_function_privilege('anon', 'internal.close_attempt_for_cash(uuid, uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.svc_close_attempt_for_cash(uuid, uuid)', 'execute')
          and not has_function_privilege('anon', 'public.svc_close_attempt_for_cash(uuid, uuid)', 'execute')
          and has_function_privilege('service_role', 'public.svc_close_attempt_for_cash(uuid, uuid)', 'execute'),
  'only the service role closes an order for cash');
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.svc_close_attempt_for_cash(gen_random_uuid(), auth.uid())$$, '42501', null,
  'an officer''s session cannot call it');
reset role;
select set_config('request.jwt.claims', '', true);

-- ===== L-C and the reminder of an officer's hold: before its first session, after its pay link went out =====
create temporary table soon on commit drop as
  select (now() + interval '3 hours') at time zone 'Asia/Jakarta' as starts_local;
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity)
select '00000000-0000-4000-8000-0000000ab209', 5, starts_local::date, starts_local::time(0),
       starts_local::time(0) + interval '30 minutes', 'Segera', 10
from soon where starts_local::time < time '23:00';
select set_config('app.in_rpc', '1', true);
insert into public.bookings (booking_code, status, channel, package_id, package_snapshot, rw_ids, booker_type,
  pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount,
  consent_version, consented_at, expires_at, created_by)
select code, 'pending_payment', 'admin', '00000000-0000-4000-8000-0000000ab001', '{}', '{5}', 'individual', 'Segera',
       phone, lower(code) || '@example.test', 1, (select starts_local::date from soon),
       (select starts_local::date from soon), 30000, 30000, 'v1', now(), now() + interval '20 hours',
       '00000000-0000-4000-8000-00000000f005'
from (values ('GSK-ADM0SEGA', '+447700900131'), ('GSK-ADM0SEGB', '+447700900132')) as v(code, phone)
where exists (select 1 from public.visit_sessions where id = '00000000-0000-4000-8000-0000000ab209');
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at)
select b.id, 5, '00000000-0000-4000-8000-0000000ab209', 1, 1, 'reserved', now()
from public.bookings b where b.booking_code in ('GSK-ADM0SEGA', 'GSK-ADM0SEGB');
insert into public.notifications (booking_id, channel, template, recipient, dedupe_key, status, sent_at)
select b.id, 'email', 'booking_created', b.pic_email, 'booking:' || b.id || ':booking_created:email:', 'sent', now()
from public.bookings b where b.booking_code = 'GSK-ADM0SEGA';
select set_config('app.in_rpc', '', true);
select internal.payments_housekeeping();
select case when exists (select 1 from public.visit_sessions where id = '00000000-0000-4000-8000-0000000ab209')
  then is((select count(*)::int from public.notifications n join public.bookings b on b.id = n.booking_id
           where b.booking_code = 'GSK-ADM0SEGA' and n.template = 'payment_reminder'), 1,
          'L-2b: an officer''s hold held for 20 hours is reminded before its session three hours ahead')
  else skip('too late in the Jakarta day for a session three hours ahead', 1) end;
select case when exists (select 1 from public.visit_sessions where id = '00000000-0000-4000-8000-0000000ab209')
  then is((select count(*)::int from public.notifications n join public.bookings b on b.id = n.booking_id
           where b.booking_code = 'GSK-ADM0SEGB' and n.template = 'payment_reminder'), 0,
          'L-C: but not before its pay link went out')
  else skip('too late in the Jakarta day for a session three hours ahead', 1) end;

-- L-D: once the booking is no longer waiting for its payment, its alert closes.
select set_config('app.in_rpc', '1', true);
update public.bookings set status = 'expired' where booking_code = 'GSK-ADM0TAMA';
select set_config('app.in_rpc', '', true);
select internal.payments_housekeeping();
select ok((select acknowledged_at is not null from public.security_alerts
           where fingerprint = 'admin_hold_unpaid_long:' || (select id from public.bookings
                                                             where booking_code = 'GSK-ADM0TAMA')),
  'L-D: an officer''s hold no longer unpaid closes its alert');

-- ===== The web path is unchanged =====
select throws_ok($$select internal.create_booking('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab201']::uuid[], 2, pg_temp.booker('+6281300000904', true, true), '[]', '[]',
    'pay', 'web', 'loket-web', null, '{"version": "2026-10-18"}', null, '{}',
    (select hash from quotes where name = 'rw05_2'))$$,
  'P0001', 'a session is booked at least 12 hours before it starts', 'the web keeps its lead time for today''s session');
select throws_ok($$select internal.create_booking('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4, pg_temp.booker('+447700900125', true, false), '[]', '[]',
    'pay', 'admin', 'loket-4', null, '{"version": "2026-10-18"}', '00000000-0000-4000-8000-00000000f005', '{}',
    (select hash from quotes where name = 'rw05_4'))$$,
  '22023', 'the officer attests the PIC''s consent to the privacy notice',
  'A22: an officer''s booking carries the officer''s attestation');
select throws_ok($$select internal.create_booking('00000000-0000-4000-8000-0000000ab001',
    array['00000000-0000-4000-8000-0000000ab203']::uuid[], 4, pg_temp.booker('+447700900125', true, false), '[]', '[]',
    'quote', 'admin', 'loket-4', null, '{"version": "2026-10-18"}', '00000000-0000-4000-8000-00000000f005', '{}',
    (select hash from quotes where name = 'rw05_4'))$$,
  '22023', 'an officer''s booking is a hold', 'and is a hold, not a quotation');
select is(internal.cash_deadline('2026-10-30'), '2026-10-30 16:59:00+00'::timestamptz,
  'A23: the last moment for cash is 23:59 WIB of the visit day');

-- ===== Grants =====
select ok(not has_function_privilege('anon', 'public.create_admin_booking(uuid, uuid[], integer, jsonb, text, text, text)',
                                     'execute')
          and not has_function_privilege('service_role',
                                         'public.create_admin_booking(uuid, uuid[], integer, jsonb, text, text, text)',
                                         'execute'),
  'only a signed-in officer books for a group');
select ok(not has_function_privilege('anon',
            'public.mark_booking_paid_manually(uuid, public.payment_method, bigint, text, text, text, integer)',
            'execute')
          and not has_function_privilege('anon', 'public.send_admin_booking_link(uuid)', 'execute')
          and not has_function_privilege('authenticated',
            'internal.create_admin_booking(uuid, uuid[], integer, jsonb, text, text, jsonb, uuid, jsonb, text)',
            'execute'),
  'and the internal path is no API role''s');
select ok(has_function_privilege('authenticated',
            'public.mark_booking_paid_manually(uuid, public.payment_method, bigint, text, text, text, integer)',
            'execute'),
  'the cash is recorded through the officer''s session');

select * from finish();
rollback;
