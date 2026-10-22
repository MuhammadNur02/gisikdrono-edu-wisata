-- internal.create_booking (Task P3.4.01, P3.4.02; decisions of 2026-10-22, Q1–Q7): what it refuses before anything is
-- written, the verified contact it requires and consumes, the hold it makes (quota, deadline, snapshots, events,
-- outbox) or the quotation it leaves without quota, a combo's legs both or neither, the caps per phone and email, the
-- duplicate and idempotent repeats, the unpaid share of a session, the large-group flag and the deadline that is
-- written once.
begin;
select plan(88);

-- ===== Fixtures =====
insert into public.umkm_vendors (id, rw_id, slug, name) values
  ('00000000-0000-4000-8000-0000000c0051', 5, 'uji-buat-vendor-05', 'Vendor Uji 05');
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price, unit_label, is_addon_eligible,
  status) values
  ('00000000-0000-4000-8000-0000000c0a05', 5, '00000000-0000-4000-8000-0000000c0051', 'uji-buat-kompos', 'Kompos Uji',
   'compost', 15000, 'kantong', true, 'published');
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000c1001', 5, 'regular', 'uji-buat-paket-05', 'Paket Uji 05', 'per_pax', 30000,
   'published'),
  ('00000000-0000-4000-8000-0000000c1002', 5, 'regular', 'uji-buat-paket-draf', 'Paket Draf', 'per_pax', 30000,
   'draft');
insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000c1003', 'combo', 'uji-buat-kombo', 'Kombo Uji', 'per_pax', 50000, 'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000c1003', 5, 1), ('00000000-0000-4000-8000-0000000c1003', 13, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000c1003';

create function pg_temp.visit_day() returns date language sql as $$ select public.today_jkt() + 5 $$;
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity, status) values
  ('00000000-0000-4000-8000-0000000c2001', 5, pg_temp.visit_day(), '09:05', '10:05', 'Uji 1', 40, 'open'),
  ('00000000-0000-4000-8000-0000000c2002', 5, pg_temp.visit_day(), '10:15', '11:15', 'Uji 2', 40, 'open'),
  ('00000000-0000-4000-8000-0000000c2003', 5, pg_temp.visit_day(), '11:25', '12:25', 'Uji 3', 40, 'open'),
  ('00000000-0000-4000-8000-0000000c2004', 5, pg_temp.visit_day(), '12:35', '13:35', 'Uji 4', 40, 'open'),
  ('00000000-0000-4000-8000-0000000c2005', 5, pg_temp.visit_day(), '14:45', '15:45', 'Uji kecil', 10, 'open'),
  ('00000000-0000-4000-8000-0000000c2006', 5, pg_temp.visit_day(), '16:55', '17:55', 'Uji tutup', 40, 'closed'),
  ('00000000-0000-4000-8000-0000000c2007', 5, public.today_jkt() + 181, '09:05', '10:05', 'Uji jauh', 40, 'open'),
  ('00000000-0000-4000-8000-0000000c2009', 5, pg_temp.visit_day(), '18:05', '19:05', 'Uji 9', 40, 'open'),
  ('00000000-0000-4000-8000-0000000c2010', 5, pg_temp.visit_day(), '19:15', '20:15', 'Uji 10', 40, 'open'),
  ('00000000-0000-4000-8000-0000000c2011', 5, pg_temp.visit_day(), '20:25', '21:25', 'Uji besar', 200, 'open'),
  ('00000000-0000-4000-8000-0000000c2012', 5, pg_temp.visit_day(), '21:35', '22:35', 'Uji sekolah', 100, 'open'),
  ('00000000-0000-4000-8000-0000000c2131', 13, pg_temp.visit_day(), '09:05', '10:05', 'Uji 13', 40, 'open'),
  ('00000000-0000-4000-8000-0000000c2132', 13, pg_temp.visit_day(), '10:15', '11:15', 'Uji 13 penuh', 10, 'open');
-- A session that starts six hours from now, wherever the Jakarta clock stands.
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity)
select '00000000-0000-4000-8000-0000000c2008', 5, (soon at time zone 'Asia/Jakarta')::date,
       (soon at time zone 'Asia/Jakarta')::time, (soon at time zone 'Asia/Jakarta')::time + interval '30 minutes',
       'Uji segera', 40
from (select date_trunc('hour', now() + interval '6 hours') as soon) as start;
-- Seats taken by bookings outside this test: a transition function writes the counter.
select set_config('app.in_rpc', '1', true);
update public.visit_sessions set reserved_pax = 10 where id = '00000000-0000-4000-8000-0000000c2132';
select set_config('app.in_rpc', '', true);

-- A code verified a minute ago for this number (or, with p_email, this address) in a browser of its own.
create function pg_temp.otp(p_phone text, p_email text default null, p_verified_ago interval default '1 minute',
  p_purpose public.otp_purpose default 'booking_phone') returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, email, code_hash, browser_hash, expires_at, verified_at, created_at)
  values (p_purpose, case when p_email is null then p_phone end, p_email, repeat('a', 64), repeat('b', 64),
          now() + interval '5 minutes', now() - p_verified_ago, now() - p_verified_ago - interval '1 minute')
  returning id;
$$;

-- A booking as booking-service.ts asks for it, priced with the hash its summary would show unless one is given.
create function pg_temp.book(p_package uuid, p_sessions uuid[], p_pax integer, p_otp uuid, p_phone text,
  p_email text default 'tamu@contoh.test', p_mode text default 'pay', p_booker_type text default 'individual',
  p_addons jsonb default '[]', p_form_id text default null, p_participants jsonb default '[]', p_hash text default null,
  p_channel public.booking_channel default 'web') returns jsonb
  language sql
as $$
  select internal.create_booking(
    p_package, p_sessions, p_pax,
    jsonb_build_object('booker_type', p_booker_type, 'institution_name',
                       case when p_booker_type = 'individual' then null else 'Sekolah Uji' end,
                       'pic_name', 'Tamu Uji', 'pic_phone', p_phone, 'pic_email', p_email, 'notes', null),
    p_addons, p_participants, p_mode, p_channel, p_form_id, p_otp, '{"version": "2026-10-15"}', null,
    '{"ip": "203.0.113.7", "user_agent": "pgTAP"}',
    coalesce(p_hash, internal.booking_quote_hash(internal.booking_quote(p_package, p_pax, p_addons,
      array(select l.rw_id from public.tour_package_legs l where l.package_id = p_package order by l.leg_order)))));
$$;

create function pg_temp.reserved(p_session uuid) returns integer
  language sql
as $$ select reserved_pax from public.visit_sessions where id = p_session $$;

-- ===== Refused before anything is written =====
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1002',
    array['00000000-0000-4000-8000-0000000c2001']::uuid[], 2, pg_temp.otp('+6281300000001'), '+6281300000001')$$,
  'P0001', 'package 00000000-0000-4000-8000-0000000c1002 is not on sale', 'a draft package is not on sale');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2006']::uuid[], 2, pg_temp.otp('+6281300000002'), '+6281300000002')$$,
  'P0001', 'session 00000000-0000-4000-8000-0000000c2006 is not open for booking', 'nor is a closed session');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2131']::uuid[], 2, pg_temp.otp('+6281300000003'), '+6281300000003')$$,
  'P0001', 'a booking takes one session for each RW the package visits',
  'a session of an RW the package does not visit is refused');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1003',
    array['00000000-0000-4000-8000-0000000c2001']::uuid[], 2, pg_temp.otp('+6281300000004'), '+6281300000004')$$,
  'P0001', 'a booking takes one session for each RW the package visits', 'so is a combo missing one of its legs');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1003',
    array['00000000-0000-4000-8000-0000000c2001', '00000000-0000-4000-8000-0000000c2002']::uuid[], 2,
    pg_temp.otp('+6281300000005'), '+6281300000005')$$,
  'P0001', 'a booking takes one session for each RW the package visits', 'or one with two sessions of one RW');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2001', '00000000-0000-4000-8000-0000000c2002']::uuid[], 2,
    pg_temp.otp('+6281300000006'), '+6281300000006')$$,
  'P0001', 'a booking takes one session for each RW the package visits', 'and a package of one RW takes one session');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2008']::uuid[], 2, pg_temp.otp('+6281300000007'), '+6281300000007')$$,
  'P0001', 'a session is booked at least 12 hours before it starts', 'a session starting in six hours is too soon');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2007']::uuid[], 2, pg_temp.otp('+6281300000008'), '+6281300000008')$$,
  'P0001', 'a session is booked at most 180 days ahead', 'one 181 days ahead is too far');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2001']::uuid[], 1, pg_temp.otp('+6281300000009'), '+6281300000009',
    p_participants => '[{"full_name": "Anak Satu"}, {"full_name": "Anak Dua"}]')$$,
  'P0001', 'a booking lists no more participants than visitors', 'more participants than visitors are refused');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2001']::uuid[], 2, pg_temp.otp('+6281300000010'), '+6281300000010',
    p_hash => repeat('0', 64))$$,
  'P0001', 'the price changed since the summary was shown', 'a quote that differs from the summary is refused');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2001']::uuid[], 2, pg_temp.otp('+6281300000011'), '+6281300000011',
    p_mode => 'book')$$,
  '22023', null, 'a booking is either paid for or quoted');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2001']::uuid[], 2, pg_temp.otp('+6281300000012'), '+6281300000012',
    p_channel => 'admin')$$,
  'P0001', 'an officer''s booking is not taken here yet (Task P4.3.10)',
  'an officer''s walk-in booking waits for its own task');
select is(pg_temp.reserved('00000000-0000-4000-8000-0000000c2001'), 0, 'none of them reserved a seat');
select is((select count(*)::int from public.bookings where pic_phone like '+6281300000%'), 0, 'or wrote a booking');

-- ===== The verified contact (BOOK-12, GUEST-08; decision of 2026-10-22, Q7) =====
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2001']::uuid[], 2, null, '+6281300000020')$$,
  'P0001', 'the PIC''s contact is not verified', 'a hold without a code is refused');
select pg_temp.otp('+6281300000021');
update public.guest_otps set verified_at = null where phone = '+6281300000021';
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2001']::uuid[], 2,
    (select id from public.guest_otps where phone = '+6281300000021'), '+6281300000021')$$,
  'P0001', 'the PIC''s contact is not verified', 'so is one with a code never verified');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2001']::uuid[], 2, pg_temp.otp('+6281300000022', p_verified_ago => '11 minutes'),
    '+6281300000022')$$,
  'P0001', 'the PIC''s contact is not verified', 'or verified more than ten minutes ago');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2001']::uuid[], 2, pg_temp.otp('+6281300000023'), '+6281300000024')$$,
  'P0001', 'the PIC''s contact is not verified', 'or a code that proved another number');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2001']::uuid[], 2,
    pg_temp.otp('+6281300000025', p_purpose => 'dsr_identity'), '+6281300000025')$$,
  'P0001', 'the PIC''s contact is not verified', 'or a code issued to prove a data request');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2001']::uuid[], 2,
    pg_temp.otp('+6281300000026', p_email => 'surel26@contoh.test'), '+6281300000026', 'surel26@contoh.test')$$,
  'P0001', 'the PIC''s contact is not verified', 'an email code counts only while WhatsApp codes are degraded');

update public.site_settings set value = 'false' where key = 'whatsapp_enabled';
select lives_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2009']::uuid[], 2,
    pg_temp.otp('+6281300000027', p_email => 'surel27@contoh.test'), '+6281300000027', 'surel27@contoh.test')$$,
  'while they are, an email code verified for this address opens the hold');
update public.site_settings set value = 'true' where key = 'whatsapp_enabled';
select is((select (phone_verified_at is null, email_verified_at is not null) from public.bookings
           where pic_phone = '+6281300000027'), (true, true),
  'it proves the address, never the phone');
select is((select array_agg(n.channel::text order by n.channel::text) from public.notifications n
           join public.bookings b on b.id = n.booking_id where b.pic_phone = '+6281300000027'),
  array['email'], 'so the booking gets no WhatsApp message');

-- ===== A hold (mode pay) =====
select is(pg_temp.book('00000000-0000-4000-8000-0000000c1001', array['00000000-0000-4000-8000-0000000c2001']::uuid[],
    10, pg_temp.otp('+6281300000030'), '+6281300000030', 'tamu30@contoh.test',
    p_addons => '[{"product_id": "00000000-0000-4000-8000-0000000c0a05", "qty": 2, "notes": "Dua kantong"}]',
    p_participants => '[{"full_name": "Siti Uji", "group_label": "7A", "role_label": "student"},
                        {"full_name": "Budi Uji", "role_label": "teacher"}]')
  ->> 'result', 'created', 'a verified visitor''s hold is created');
create temporary table hold on commit drop as
  select b.* from public.bookings b where b.pic_phone = '+6281300000030';
select is((select (status, subtotal_package, subtotal_addons, discount_amount, total_amount) from hold),
  ('pending_payment'::public.booking_status, 300000::bigint, 30000::bigint, 0::bigint, 330000::bigint),
  'it awaits payment, priced from the catalogue rows');
select is((select package_snapshot from hold),
  '{"name": "Paket Uji 05", "category": "regular", "pricing_basis": "per_pax", "unit_price": 30000, "tier": null}'::jsonb,
  'the package is snapshotted as it was sold');
select is((select (rw_ids, visit_date, visit_date_end) from hold), (array[5]::smallint[], pg_temp.visit_day(),
  pg_temp.visit_day()), 'it visits RW 05 on the session''s date');
select is((select expires_at from hold), now() + interval '120 minutes', 'an individual holds for two hours');
select is((select (phone_verified_at, email_verified_at) from hold), (now(), null::timestamptz),
  'the code verified the phone, not the address');
select is((select (consent_version, consented_at, source_ip, user_agent) from hold),
  ('2026-10-15'::text, now(), '203.0.113.7'::inet, 'pgTAP'::text), 'consent and the request are recorded');
select ok((select booking_code ~ '^GSK-[0-9A-HJKMNP-TV-Z]{8}$' from hold), 'its code is a GSK code');
select is((select (l.status, l.leg_order, l.pax_count, l.quota_reserved_at) from public.booking_legs l
           where l.booking_id = (select id from hold)),
  ('reserved'::public.booking_leg_status, 1::smallint, 10, now()), 'its one leg holds ten seats');
select is(pg_temp.reserved('00000000-0000-4000-8000-0000000c2001'), 10, 'taken from the session');
select is((select (a.unit_price, a.qty, a.line_total, a.product_name_snapshot, a.vendor_id, a.notes)
           from public.booking_addons a where a.booking_id = (select id from hold)),
  (15000::bigint, 2, 30000::bigint, 'Kompos Uji'::text, '00000000-0000-4000-8000-0000000c0051'::uuid, 'Dua kantong'::text),
  'the add-on line keeps its price, name and vendor');
select is((select array_agg(p.full_name || '/' || coalesce(p.group_label, '-') || '/' || p.role_label order by p.seq_no)
           from public.booking_participants p where p.booking_id = (select id from hold)),
  array['Siti Uji/7A/student', 'Budi Uji/-/teacher'], 'the participants are listed in order');
select is((select (consumed_at, booking_id) from public.guest_otps where phone = '+6281300000030'),
  (now(), (select id from hold)), 'the code is spent on this booking');
select is((select count(*)::int from public.booking_events e where e.booking_id = (select id from hold)), 1,
  'one event records the hold');
select is((select (from_status, to_status, actor_type) from public.booking_events e
           where e.booking_id = (select id from hold)),
  (null::public.booking_status, 'pending_payment'::public.booking_status, 'visitor'::text), 'from nothing to awaiting payment');
select is((select array_agg(channel::text || ':' || (params ->> 'link_scope') order by channel::text)
           from public.notifications n where n.booking_id = (select id from hold) and n.template = 'booking_created'),
  array['email:view', 'whatsapp:manage'],
  'booking_created goes to the verified WhatsApp with a manage link and to the unverified email with a view link');

-- ===== A quotation (mode quote) holds nothing (BOOK-08; decision of 2026-10-22, Q2) =====
select is(pg_temp.book('00000000-0000-4000-8000-0000000c1001', array['00000000-0000-4000-8000-0000000c2002']::uuid[],
    5, pg_temp.otp('+6281300000040'), '+6281300000040', 'tamu40@contoh.test', p_mode => 'quote',
    p_booker_type => 'school') ->> 'result', 'created', 'a school''s quotation booking is created');
select is((select (status, expires_at, quoted_at, phone_verified_at) from public.bookings
           where pic_phone = '+6281300000040'),
  ('quoted'::public.booking_status, null::timestamptz, now(), now()), 'quoted, with no deadline');
select is((select l.status from public.booking_legs l join public.bookings b on b.id = l.booking_id
           where b.pic_phone = '+6281300000040'), 'unreserved'::public.booking_leg_status, 'its leg holds no seat');
select is(pg_temp.reserved('00000000-0000-4000-8000-0000000c2002'), 0, 'and the session lost none');
select is((select count(*)::int from public.notifications n join public.bookings b on b.id = n.booking_id
           where b.pic_phone = '+6281300000040'), 0, 'create_quotation sends the quotation later; nothing yet');

-- ===== Hold length and combos =====
select lives_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2012']::uuid[], 40, pg_temp.otp('+6281300000050'), '+6281300000050',
    'tamu50@contoh.test', p_booker_type => 'school')$$, 'a school books forty');
select is((select expires_at from public.bookings where pic_phone = '+6281300000050'), now() + interval '24 hours',
  'and holds for a day, the institution''s hold winning over the shortening for large groups');
select is((pg_temp.book('00000000-0000-4000-8000-0000000c1003',
    array['00000000-0000-4000-8000-0000000c2131', '00000000-0000-4000-8000-0000000c2004']::uuid[], 4,
    pg_temp.otp('+6281300000060'), '+6281300000060', 'tamu60@contoh.test')) ->> 'result', 'created',
  'a combo takes one session in each of its RWs');
select is((select array_agg(l.rw_id::text || ':' || l.status::text order by l.leg_order) from public.booking_legs l
           join public.bookings b on b.id = l.booking_id where b.pic_phone = '+6281300000060'),
  array['5:reserved', '13:reserved'], 'both legs hold their seats, in the package''s leg order');
select is(array[pg_temp.reserved('00000000-0000-4000-8000-0000000c2004'),
                pg_temp.reserved('00000000-0000-4000-8000-0000000c2131')], array[4, 4], 'four seats in each session');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1003',
    array['00000000-0000-4000-8000-0000000c2010', '00000000-0000-4000-8000-0000000c2132']::uuid[], 4,
    pg_temp.otp('+6281300000061'), '+6281300000061', 'tamu61@contoh.test')$$,
  'P0001', 'session 00000000-0000-4000-8000-0000000c2132 has no room for 4 more visitors',
  'a combo whose second session is full is refused');
select is(pg_temp.reserved('00000000-0000-4000-8000-0000000c2010'), 0, 'and its first leg gave its seats back');

-- ===== Caps, repeats and the unpaid share (BOOK-06, BOOK-13, BOOK-15) =====
select lives_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2009']::uuid[], 1, pg_temp.otp('+6281300000070'), '+6281300000070',
    'tamu70@contoh.test'); select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2010']::uuid[], 1, pg_temp.otp('+6281300000070'), '+6281300000070',
    'tamu70@contoh.test')$$, 'a phone may hold two unpaid bookings');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2004']::uuid[], 1, pg_temp.otp('+6281300000070'), '+6281300000070',
    'tamu70b@contoh.test')$$,
  'P0001', 'a phone number or an email address holds at most two unpaid bookings', 'but not a third');
-- Only the contact a code proved counts (independent review of PR #26, M2): an address typed beside another verified
-- number proves nothing, so it caps nobody.
select is((pg_temp.book('00000000-0000-4000-8000-0000000c1001', array['00000000-0000-4000-8000-0000000c2004']::uuid[],
    1, pg_temp.otp('+6281300000071'), '+6281300000071', 'tamu70@contoh.test')) ->> 'result', 'created',
  'another verified phone typing the same address is not capped by it');
select is((pg_temp.book('00000000-0000-4000-8000-0000000c1001', array['00000000-0000-4000-8000-0000000c2001']::uuid[],
    10, pg_temp.otp('+6281300000030'), '+6281300000030', 'tamu30@contoh.test')) - 'booking_code' - 'expires_at',
  jsonb_build_object('result', 'duplicate', 'booking_id', (select id from hold), 'status', 'pending_payment'),
  'the same phone for the same session is the hold it already has: a duplicate, its link to be sent again');
select is((select count(*)::int from public.bookings where pic_phone = '+6281300000030'), 1, 'no second booking');
select is((select count(*)::int from public.guest_otps where phone = '+6281300000030' and consumed_at is null), 1,
  'and the new code is not spent');

create temporary table form_code on commit drop as select pg_temp.otp('+6281300000080') as id;
select lives_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2002']::uuid[], 1, (select id from form_code), '+6281300000080',
    'tamu80@contoh.test', p_form_id => 'f8c3de3d-1fea-4d7c-a8b0-29f63c4c3454')$$, 'a booking with a form key');
select is((pg_temp.book('00000000-0000-4000-8000-0000000c1001', array['00000000-0000-4000-8000-0000000c2002']::uuid[],
    1, (select id from form_code), '+6281300000080', 'tamu80@contoh.test',
    p_form_id => 'f8c3de3d-1fea-4d7c-a8b0-29f63c4c3454')) ->> 'result', 'existing',
  'sent again with the same key and the code it spent, it is the same booking');
-- Independent review of PR #26, L1: the key alone opens nothing; the replay brings the code that booking spent.
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2002']::uuid[], 1, null, '+6281300000080', 'tamu80@contoh.test',
    p_form_id => 'f8c3de3d-1fea-4d7c-a8b0-29f63c4c3454')$$,
  'P0001', 'the PIC''s contact is not verified', 'a replay without a code gets nothing back');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2002']::uuid[], 1, pg_temp.otp('+6281300000080'), '+6281300000080',
    'tamu80@contoh.test', p_form_id => 'f8c3de3d-1fea-4d7c-a8b0-29f63c4c3454')$$,
  'P0001', 'the PIC''s contact is not verified', 'nor one with another code of the same phone');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2002']::uuid[], 1, pg_temp.otp('+6281300000081'), '+6281300000081',
    'tamu81@contoh.test', p_form_id => 'f8c3de3d-1fea-4d7c-a8b0-29f63c4c3454')$$,
  '23505', null, 'another phone with that key gets a conflict, never that booking');

select is((pg_temp.book('00000000-0000-4000-8000-0000000c1001', array['00000000-0000-4000-8000-0000000c2005']::uuid[],
    5, pg_temp.otp('+6281300000090'), '+6281300000090', 'tamu90@contoh.test')) ->> 'result', 'created',
  'unpaid holds may fill half a session');
select is((pg_temp.book('00000000-0000-4000-8000-0000000c1001', array['00000000-0000-4000-8000-0000000c2005']::uuid[],
    1, pg_temp.otp('+6281300000091'), '+6281300000091', 'tamu91@contoh.test')) ->> 'result', 'pay_to_confirm',
  'beyond half, the visitor pays to confirm');
select is((select (pg_temp.reserved('00000000-0000-4000-8000-0000000c2005'),
                   (select count(*)::int from public.bookings where pic_phone = '+6281300000091'),
                   (select count(*)::int from public.guest_otps where phone = '+6281300000091' and consumed_at is null))),
  (5, 0, 1), 'and nothing is written: no seat, no booking, and the code stays unspent');
select is((pg_temp.book('00000000-0000-4000-8000-0000000c1001', array['00000000-0000-4000-8000-0000000c2005']::uuid[],
    3, pg_temp.otp('+6281300000092'), '+6281300000092', 'tamu92@contoh.test', p_mode => 'quote',
    p_booker_type => 'school')) ->> 'result', 'created', 'a quotation takes no seat, so the share does not stop it');

-- ===== A typed phone is never an identity (independent review of PR #26, M2) =====
-- A victim's verified WhatsApp hold, and an attacker who, while WhatsApp codes are degraded, proves an address of
-- their own and types the victim's number.
select is((pg_temp.book('00000000-0000-4000-8000-0000000c1001', array['00000000-0000-4000-8000-0000000c2003']::uuid[],
    1, pg_temp.otp('+6281300000110'), '+6281300000110', 'korban@contoh.test')) ->> 'result', 'created',
  'the victim holds a seat with their verified WhatsApp');
create temporary table victim_hold on commit drop as
  select id from public.bookings where pic_email = 'korban@contoh.test';
update public.site_settings set value = 'false' where key = 'whatsapp_enabled';
select is((pg_temp.book('00000000-0000-4000-8000-0000000c1001', array['00000000-0000-4000-8000-0000000c2003']::uuid[],
    1, pg_temp.otp('+6281300000110', p_email => 'penyerang@contoh.test'), '+6281300000110',
    'penyerang@contoh.test')) ->> 'result', 'created',
  'the typed number is no duplicate of the victim''s hold: no answer tells the attacker what that number holds');
select lives_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2004']::uuid[], 1,
    pg_temp.otp('+6281300000110', p_email => 'penyerang@contoh.test'), '+6281300000110', 'penyerang@contoh.test')$$,
  'a second hold for the proven address');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2009']::uuid[], 1,
    pg_temp.otp('+6281300000111', p_email => 'penyerang@contoh.test'), '+6281300000111', 'penyerang@contoh.test')$$,
  'P0001', 'a phone number or an email address holds at most two unpaid bookings',
  'a third is refused by the address the code proved, whatever number is typed');
update public.site_settings set value = 'true' where key = 'whatsapp_enabled';
select is((select count(*)::int from public.bookings
           where pic_email = 'penyerang@contoh.test' and phone_verified_at is null), 2,
  'the typed number stays unverified contact data');
select is((pg_temp.book('00000000-0000-4000-8000-0000000c1001', array['00000000-0000-4000-8000-0000000c2004']::uuid[],
    1, pg_temp.otp('+6281300000110'), '+6281300000110', 'korban@contoh.test')) ->> 'result', 'created',
  'the attacker''s holds do not count against the victim''s number');
select is((pg_temp.book('00000000-0000-4000-8000-0000000c1001', array['00000000-0000-4000-8000-0000000c2003']::uuid[],
    1, pg_temp.otp('+6281300000110'), '+6281300000110', 'korban@contoh.test')) ->> 'booking_id',
  (select id::text from victim_hold), 'and the victim''s own repeat finds the victim''s hold, never the attacker''s');

-- ===== One address however it is spelt (BOOK-11; independent review of PR #26, L3) =====
select is(internal.email_key(' A.Budi+promo@Gmail.com '), 'abudi@gmail.com', 'Gmail ignores dots and plus tags');
select is(internal.email_key('a.budi@googlemail.com'), 'abudi@gmail.com', 'and googlemail.com is the same mailbox');
select is(internal.email_key('Ani.Lestari+x@Sekolah.sch.id'), 'ani.lestari+x@sekolah.sch.id',
  'another domain keeps its dots and tags, lower-cased: as normalizeEmail in src/lib/validations/normalize.ts');
update public.site_settings set value = 'false' where key = 'whatsapp_enabled';
select lives_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2001']::uuid[], 1,
    pg_temp.otp('+6281300000120', p_email => 'tamu.gmail+a@gmail.com'), '+6281300000120', 'tamu.gmail+a@gmail.com');
  select pg_temp.book('00000000-0000-4000-8000-0000000c1001', array['00000000-0000-4000-8000-0000000c2002']::uuid[], 1,
    pg_temp.otp('+6281300000121', p_email => 'tamugmail@gmail.com'), '+6281300000121', 'tamugmail@gmail.com')$$,
  'two holds for two spellings of one Gmail address');
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2010']::uuid[], 1,
    pg_temp.otp('+6281300000122', p_email => 'Tamu.Gmail@googlemail.com'), '+6281300000122', 'Tamu.Gmail@googlemail.com')$$,
  'P0001', 'a phone number or an email address holds at most two unpaid bookings', 'and the third spelling is refused');
update public.site_settings set value = 'true' where key = 'whatsapp_enabled';

-- ===== What may be booked at all (independent review of PR #26, L5) =====
update public.tour_packages set valid_to = pg_temp.visit_day() - 1 where id = '00000000-0000-4000-8000-0000000c1001';
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2011']::uuid[], 1, pg_temp.otp('+6281300000130'), '+6281300000130',
    'tamu130@contoh.test')$$,
  'P0001', 'package 00000000-0000-4000-8000-0000000c1001 is not sold for visits on ' || pg_temp.visit_day(),
  'a package is not sold for visits after its valid_to');
update public.tour_packages set valid_to = null, valid_from = pg_temp.visit_day() + 1
where id = '00000000-0000-4000-8000-0000000c1001';
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2011']::uuid[], 1, pg_temp.otp('+6281300000131'), '+6281300000131',
    'tamu131@contoh.test')$$,
  'P0001', 'package 00000000-0000-4000-8000-0000000c1001 is not sold for visits on ' || pg_temp.visit_day(),
  'nor before its valid_from');
update public.tour_packages set valid_from = null where id = '00000000-0000-4000-8000-0000000c1001';
insert into public.rw_units (id, code, slug, name, short_name, theme_label, accent_key, icon_key)
values (21, 'RW21', 'rw-21-uji', 'RW 21 Uji', 'Uji', 'Uji', 'teal', 'users');
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000c1021', 21, 'regular', 'uji-buat-paket-21', 'Paket Uji 21', 'per_pax', 30000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000c2021', 21, pg_temp.visit_day(), '09:05', '10:05', 'Uji 21', 40);
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1021',
    array['00000000-0000-4000-8000-0000000c2021']::uuid[], 1, pg_temp.otp('+6281300000132'), '+6281300000132',
    'tamu132@contoh.test')$$,
  'P0001', 'session 00000000-0000-4000-8000-0000000c2021 is not open for booking',
  'a session of an RW that is not online is not open');
update public.site_settings set value = '0' where key = 'booking.min_lead_hours';
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity)
select '00000000-0000-4000-8000-0000000c2014', 5, (start at time zone 'Asia/Jakarta')::date,
       least((start at time zone 'Asia/Jakarta')::time, time '23:58'),
       least((start at time zone 'Asia/Jakarta')::time, time '23:58') + interval '1 minute', 'Uji mepet', 40
from (select date_trunc('minute', now() + interval '50 minutes') as start) as soon;
select throws_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2014']::uuid[], 1, pg_temp.otp('+6281300000133'), '+6281300000133',
    'tamu133@contoh.test')$$,
  'P0001', 'no time is left to pay before the session starts',
  'a hold whose deadline would already have passed is refused');
update public.site_settings set value = '12' where key = 'booking.min_lead_hours';

-- ===== Large groups are flagged, not stopped (decision of 2026-10-22, Q4) =====
select lives_ok($$select pg_temp.book('00000000-0000-4000-8000-0000000c1001',
    array['00000000-0000-4000-8000-0000000c2011']::uuid[], 61, pg_temp.otp('+6281300000100'), '+6281300000100',
    'tamu100@contoh.test', p_booker_type => 'school')$$, 'a school books sixty-one');
select is((select (a.rule, a.severity, a.details ->> 'pax', b.needs_review) from public.security_alerts a
           join public.bookings b on a.fingerprint = 'large_group:' || b.id
           where b.pic_phone = '+6281300000100'),
  ('large_group'::text, 'info'::public.alert_severity, '61'::text, false), 'which raises one info alert and needs no review');

-- ===== Only the service role reaches it, through its svc_ wrapper (CLAUDE.md §6.1) =====
select ok(has_function_privilege('service_role', 'public.svc_create_booking(uuid, uuid[], integer, jsonb, jsonb, jsonb, text, text, uuid, jsonb, jsonb, text)', 'execute'),
  'the service role books through svc_create_booking');
select ok(not has_function_privilege('anon', 'public.svc_create_booking(uuid, uuid[], integer, jsonb, jsonb, jsonb, text, text, uuid, jsonb, jsonb, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.svc_create_booking(uuid, uuid[], integer, jsonb, jsonb, jsonb, text, text, uuid, jsonb, jsonb, text)', 'execute'),
  'no visitor or staff session calls it');

-- ===== expires_at is written once (BOOK-14) =====
select throws_ok($$update public.bookings set expires_at = expires_at + interval '1 day' where pic_phone = '+6281300000030'$$,
  'P0001', 'a hold''s deadline is written once', 'a hold''s deadline never moves on its own');
select set_config('app.hold_extension', '1', true);
select lives_ok($$update public.bookings set expires_at = expires_at + interval '1 day' where pic_phone = '+6281300000030'$$,
  'only a hold extension moves it');
select set_config('app.hold_extension', '', true);

select * from finish();
rollback;
