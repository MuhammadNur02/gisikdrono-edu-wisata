-- RLS matrix for the booking tables: bookings, booking_legs, booking_addons, booking_participants, booking_events,
-- guest_otps and the staff booking views (docs/PRD.md §8.5.2, docs/Security.md §6.6, Task P1.4.04, P1.9.02),
-- with the admin_rw window of a week back to a month ahead (decision of 2026-10-16). Every check runs as an
-- API role.
begin;
select plan(35);
\ir helpers/rls_personas.psql

insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax, status) values
  ('00000000-0000-4000-8000-00000000c501', 5, 'regular', 'p5', 'Paket RW 05', 25000, 'published'),
  ('00000000-0000-4000-8000-00000000c801', 8, 'regular', 'p8', 'Paket RW 08', 25000, 'published');
insert into public.tour_packages (id, category, slug, name, pricing_basis, flat_price)
values ('00000000-0000-4000-8000-00000000c900', 'combo', 'pc', 'Paket Kombinasi', 'flat_group', 1500000);
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-00000000c900', 5, 1), ('00000000-0000-4000-8000-00000000c900', 8, 2);
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-00000000a501', 5, public.today_jkt(), '08:00', '10:00', 'Pagi', 200),
  ('00000000-0000-4000-8000-00000000a801', 8, public.today_jkt(), '08:00', '10:00', 'Pagi', 200);

-- The window's edges: a visit that ended exactly a week ago and one exactly a month ahead are in, a day
-- further either way is out. Today's visit is always in.
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
  consented_at)
select id::uuid, code, 'quoted', package_id::uuid, '{}', rw_ids::smallint[], 'school', 'Budi Santoso', phone,
  lower(code) || '@example.test', 4, public.today_jkt() + day_offset, public.today_jkt() + day_offset, 100000, 100000,
  'v1', now()
from (values
  ('00000000-0000-4000-8000-0000b5000001', 'GSK-W5000001', '00000000-0000-4000-8000-00000000c501', '{5}', '+6281200005001', 0),
  ('00000000-0000-4000-8000-0000b5000007', 'GSK-W5000007', '00000000-0000-4000-8000-00000000c501', '{5}', '+6281200005007', -7),
  ('00000000-0000-4000-8000-0000b5000008', 'GSK-W5000008', '00000000-0000-4000-8000-00000000c501', '{5}', '+6281200005008', -8),
  ('00000000-0000-4000-8000-0000b5000030', 'GSK-W5000030', '00000000-0000-4000-8000-00000000c501', '{5}', '+6281200005030', 30),
  ('00000000-0000-4000-8000-0000b5000031', 'GSK-W5000031', '00000000-0000-4000-8000-00000000c501', '{5}', '+6281200005031', 31),
  ('00000000-0000-4000-8000-0000b8000001', 'GSK-W8000001', '00000000-0000-4000-8000-00000000c801', '{8}', '+6281200008001', 0),
  ('00000000-0000-4000-8000-0000bc000001', 'GSK-WC000001', '00000000-0000-4000-8000-00000000c900', '{5,8}', '+6281200009001', 5)
) as fixture(id, code, package_id, rw_ids, phone, day_offset);
create function pg_temp.is_fixture_booking(p_id uuid) returns boolean
  language sql immutable
as $$
  select p_id in ('00000000-0000-4000-8000-0000b5000001', '00000000-0000-4000-8000-0000b5000007',
                  '00000000-0000-4000-8000-0000b5000008', '00000000-0000-4000-8000-0000b5000030',
                  '00000000-0000-4000-8000-0000b5000031', '00000000-0000-4000-8000-0000b8000001',
                  '00000000-0000-4000-8000-0000bc000001');
$$;
grant execute on function pg_temp.is_fixture_booking(uuid) to anon, authenticated;
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count)
select b.id, rw, case rw when 5 then '00000000-0000-4000-8000-00000000a501'::uuid else '00000000-0000-4000-8000-00000000a801'::uuid end,
       ordinality::smallint, 4
from public.bookings b cross join lateral unnest(b.rw_ids) with ordinality as leg(rw, ordinality)
where pg_temp.is_fixture_booking(b.id);
insert into public.umkm_vendors (id, rw_id, slug, name) values
  ('00000000-0000-4000-8000-00000000d501', 5, 'v5', 'Vendor RW 05'), ('00000000-0000-4000-8000-00000000d801', 8, 'v8', 'Vendor RW 08');
insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price) values
  ('00000000-0000-4000-8000-00000000e501', 5, '00000000-0000-4000-8000-00000000d501', 'pr5', 'Kompos', 'compost', 15000),
  ('00000000-0000-4000-8000-00000000e801', 8, '00000000-0000-4000-8000-00000000d801', 'pr8', 'Batik', 'souvenir', 50000);
-- The combo orders from both RWs: each RW admin's money for it is their own RW's line.
insert into public.booking_addons (booking_id, product_id, rw_id, vendor_id, product_name_snapshot, unit_price, qty, line_total)
select booking_id::uuid, product_id::uuid, rw_id, vendor_id::uuid, name, price, qty, price * qty
from (values
  ('00000000-0000-4000-8000-0000b5000001', '00000000-0000-4000-8000-00000000e501', 5, '00000000-0000-4000-8000-00000000d501', 'Kompos', 15000, 2),
  ('00000000-0000-4000-8000-0000b8000001', '00000000-0000-4000-8000-00000000e801', 8, '00000000-0000-4000-8000-00000000d801', 'Batik', 50000, 1),
  ('00000000-0000-4000-8000-0000bc000001', '00000000-0000-4000-8000-00000000e501', 5, '00000000-0000-4000-8000-00000000d501', 'Kompos', 15000, 4),
  ('00000000-0000-4000-8000-0000bc000001', '00000000-0000-4000-8000-00000000e801', 8, '00000000-0000-4000-8000-00000000d801', 'Batik', 50000, 3)
) as fixture(booking_id, product_id, rw_id, vendor_id, name, price, qty);
insert into public.booking_events (booking_id, from_status, to_status, actor_type, reason) values
  ('00000000-0000-4000-8000-0000b5000001', null, 'quoted', 'visitor', 'created'),
  ('00000000-0000-4000-8000-0000b5000008', null, 'quoted', 'visitor', 'created'),
  ('00000000-0000-4000-8000-0000b8000001', null, 'quoted', 'visitor', 'created');
insert into public.booking_participants (booking_id, seq_no, full_name) values
  ('00000000-0000-4000-8000-0000b5000001', 1, 'Ani Murid');

-- ===== anon =====
select pg_temp.act_as('anon');
select throws_ok($$select id from public.bookings$$, '42501', null, 'anon reads no booking');
select throws_ok($$select id from public.booking_legs$$, '42501', null, 'no leg');
select throws_ok($$select id from public.booking_participants$$, '42501', null, 'no participant');
select throws_ok($$select id from public.guest_otps$$, '42501', null, 'no OTP');
select throws_ok($$select id from public.v_bookings_staff$$, '42501', null, 'and no staff view');

-- ===== a signed-in user without a role =====
reset role;
select pg_temp.act_as('none');
select is(
  (select count(*)::int from public.bookings where pg_temp.is_fixture_booking(id))
  + (select count(*)::int from public.booking_legs where pg_temp.is_fixture_booking(booking_id))
  + (select count(*)::int from public.booking_addons where pg_temp.is_fixture_booking(booking_id))
  + (select count(*)::int from public.booking_events where pg_temp.is_fixture_booking(booking_id)),
  0,
  'a user without a role sees no booking row'
);

-- ===== admin_rw 05 =====
reset role;
select pg_temp.act_as('admin_rw_05');
select is(
  (select string_agg(booking_code, ',' order by booking_code) from public.bookings where pg_temp.is_fixture_booking(id)),
  'GSK-W5000001,GSK-W5000007,GSK-W5000030,GSK-WC000001',
  'an RW admin sees their RW''s bookings from a week back to a month ahead, today''s and the combo included'
);
select throws_ok($$select pic_name, pic_phone, pic_email from public.bookings$$, '42501', null,
  'never a booker''s contact');
select throws_ok($$select source_ip, user_agent, idempotency_key from public.bookings$$, '42501', null,
  'nor the IP, device or idempotency key');
select is(
  (select phone_masked from public.bookings where booking_code = 'GSK-W5000001'),
  '+62812••••01',
  'the masked phone is what they read'
);
select is(
  (select string_agg(booking_code, ',' order by booking_code) from public.v_bookings_staff
   where pg_temp.is_fixture_booking(id)),
  'GSK-W5000001,GSK-W5000007,GSK-W5000030,GSK-WC000001',
  'the staff view shows the same bookings'
);
select is(
  (select string_agg(booking_code || '=' || coalesce(total_amount::text, '-'), ' ' order by booking_code)
   from public.v_bookings_staff where booking_code in ('GSK-W5000001', 'GSK-WC000001')),
  'GSK-W5000001=100000 GSK-WC000001=-',
  'with their own RW''s amounts, and no combo total, which holds RW 08''s share (STAFF-02)'
);
select is(pg_temp.row_count($$update public.bookings set admin_notes = 'Bawa kursi roda'
  where booking_code = 'GSK-W5000001'$$), 1, 'writes a note on today''s booking');
select is(pg_temp.row_count($$update public.bookings set admin_notes = 'x' where booking_code = 'GSK-W5000008'$$), 0,
  'but not on one that ended more than a week ago');
select is(pg_temp.row_count($$update public.bookings set admin_notes = 'x' where booking_code = 'GSK-W8000001'$$), 0,
  'nor on RW 08''s');
select throws_ok($$update public.bookings set status = 'expired' where booking_code = 'GSK-W5000001'$$, '42501', null,
  'and never moves a status');
select throws_ok($$update public.bookings set discount_amount = 10000 where booking_code = 'GSK-W5000001'$$, '42501', null,
  'nor gives a discount, which waits for its own RPC');
select is((select count(*)::int from public.booking_legs where pg_temp.is_fixture_booking(booking_id) and rw_id = 8), 0,
  'sees no RW 08 leg, not even the combo''s');
select is(
  (select count(*)::int from public.booking_legs where booking_id = '00000000-0000-4000-8000-0000b5000008'),
  1,
  'but every leg of their own RW, old ones included, so visit statistics count every period'
);
select is(
  (select string_agg(right(booking_id::text, 8) || ':' || product_name_snapshot || '=' || line_total, ','
                     order by booking_id)
   from public.booking_addons where pg_temp.is_fixture_booking(booking_id)),
  'b5000001:Kompos=30000,bc000001:Kompos=60000',
  'their own RW''s add-on lines only, a combo''s included, never RW 08''s line of it (STAFF-02)'
);
select is(pg_temp.row_count($$update public.booking_addons set fulfillment_status = 'prepared'
  where booking_id = '00000000-0000-4000-8000-0000b5000001'$$), 1, 'which they mark prepared');
select is(pg_temp.row_count($$update public.booking_addons set fulfillment_status = 'prepared'
  where booking_id = '00000000-0000-4000-8000-0000b8000001'$$), 0, 'while RW 08''s stay out of reach');
select is(
  (select string_agg(right(booking_id::text, 8), ',') from public.booking_events where pg_temp.is_fixture_booking(booking_id)),
  'b5000001',
  'a booking''s timeline is visible where the booking is: inside the window, in their RW'
);
select throws_ok($$select full_name from public.booking_participants$$, '42501', null,
  'participant names are never read directly');
select is(
  (select count(*)::int from public.rpc_get_participants('00000000-0000-4000-8000-0000b5000001')),
  1,
  'only through the audited RPC, whose own window today''s visit always meets'
);

-- ===== admin_rw 08 =====
reset role;
select pg_temp.act_as('admin_rw_08');
select is(
  (select string_agg(booking_code, ',' order by booking_code) from public.bookings where pg_temp.is_fixture_booking(id)),
  'GSK-W8000001,GSK-WC000001',
  'RW 08''s admin sees RW 08''s bookings and the combo, nothing of RW 05'
);
select is(
  (select string_agg(right(booking_id::text, 8) || ':' || product_name_snapshot, ',' order by booking_id)
   from public.booking_addons where pg_temp.is_fixture_booking(booking_id)),
  'b8000001:Batik,bc000001:Batik',
  'and RW 08''s add-on lines, the combo''s included'
);

-- ===== admin_rw 05 without AAL2 =====
reset role;
select pg_temp.act_as('admin_rw_05_aal1');
select is((select count(*)::int from public.bookings where pg_temp.is_fixture_booking(id)), 0,
  'without AAL2 an RW admin sees no booking, not even today''s');
select is(pg_temp.row_count($$update public.bookings set admin_notes = 'Tanpa TOTP' where booking_code = 'GSK-W5000001'$$), 0,
  'and writes no note');

-- ===== superadmin =====
reset role;
select pg_temp.act_as('superadmin_aal1');
select is((select count(*)::int from public.bookings where pg_temp.is_fixture_booking(id)), 0,
  'without AAL2 the superadmin sees no booking either');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is(
  (select string_agg(booking_code, ',' order by booking_code) from public.bookings where pg_temp.is_fixture_booking(id)),
  'GSK-W5000001,GSK-W5000007,GSK-W5000008,GSK-W5000030,GSK-W5000031,GSK-W8000001,GSK-WC000001',
  'at AAL2 the superadmin sees every booking, however old or far ahead'
);
select is((select total_amount from public.v_bookings_staff where booking_code = 'GSK-WC000001'), 100000::bigint,
  'and the combo''s total');
select throws_ok($$select pic_phone from public.bookings$$, '42501', null,
  'but not a contact: rpc_reveal_booking_contact is the only way, for the superadmin too');
select is(pg_temp.row_count($$update public.bookings set admin_notes = 'Catatan' where booking_code = 'GSK-W8000001'$$), 1,
  'writes notes on any booking');
select is(
  (select count(*)::int from public.booking_events where pg_temp.is_fixture_booking(booking_id)),
  3,
  'and reads every timeline'
);

select * from finish();
rollback;
