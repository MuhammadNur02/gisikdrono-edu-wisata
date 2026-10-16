-- RLS matrix for tickets: tickets_qr, ticket_scans, certificates and v_attendance_today (docs/PRD.md §8.5.2,
-- Task P1.4.04, P1.9.02). Today's gate list and certificates always fall inside the admin_rw booking window
-- (decision of 2026-10-16). Every check runs as an API role.
begin;
select plan(17);
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

-- Paid bookings with settled payments, as apply_payment_event leaves them.
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, amount_paid,
  consent_version, consented_at, paid_at)
select id::uuid, code, 'paid', package_id::uuid, '{}', rw_ids::smallint[], 'school', 'Budi Santoso', phone,
  lower(code) || '@example.test', 4, public.today_jkt() + day_offset, public.today_jkt() + day_offset, 100000, 100000,
  100000, 'v1', now(), now()
from (values
  ('00000000-0000-4000-8000-0000b5000001', 'GSK-T5000001', '00000000-0000-4000-8000-00000000c501', '{5}', '+6281200005201', 0),
  ('00000000-0000-4000-8000-0000b5000008', 'GSK-T5000008', '00000000-0000-4000-8000-00000000c501', '{5}', '+6281200005208', -8),
  ('00000000-0000-4000-8000-0000b8000001', 'GSK-T8000001', '00000000-0000-4000-8000-00000000c801', '{8}', '+6281200008201', 0),
  ('00000000-0000-4000-8000-0000bc000001', 'GSK-TC000001', '00000000-0000-4000-8000-00000000c900', '{5,8}', '+6281200009201', 0)
) as fixture(id, code, package_id, rw_ids, phone, day_offset);
insert into public.payments (booking_id, attempt_no, provider, order_id, gross_amount, status)
select b.id, 1, 'midtrans', b.booking_code || '-01', 100000, 'settled' from public.bookings b where b.booking_code like 'GSK-T%';
insert into public.booking_legs (id, booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at)
select gen_random_uuid(), b.id, rw,
       case rw when 5 then '00000000-0000-4000-8000-00000000a501'::uuid else '00000000-0000-4000-8000-00000000a801'::uuid end,
       ordinality::smallint, 4, 'reserved', now()
from public.bookings b cross join lateral unnest(b.rw_ids) with ordinality as leg(rw, ordinality)
where b.booking_code like 'GSK-T%';
insert into public.tickets_qr (booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code, valid_on, valid_from,
  valid_until, pax_count, key_id)
select l.booking_id, l.id, l.rw_id, l.visit_session_id, b.booking_code || '-0' || l.rw_id, b.visit_date,
       (b.visit_date + time '07:00') at time zone 'Asia/Jakarta', (b.visit_date + time '12:00') at time zone 'Asia/Jakarta',
       4, 'k1'
from public.booking_legs l join public.bookings b on b.id = l.booking_id where b.booking_code like 'GSK-T%';
select set_config('app.in_rpc', '', true);
insert into public.ticket_scans (attempt_id, ticket_id, rw_id, scanned_by, phase, result)
select gen_random_uuid(), t.id, t.rw_id,
       case t.rw_id when 5 then '00000000-0000-4000-8000-00000000f005'::uuid else '00000000-0000-4000-8000-00000000f008'::uuid end,
       'validate', 'ok'
from public.tickets_qr t where t.ticket_code in ('GSK-T5000001-05', 'GSK-T8000001-08');
insert into public.booking_participants (id, booking_id, seq_no, full_name)
values ('00000000-0000-4000-8000-0000bb000001', '00000000-0000-4000-8000-0000b5000001', 1, 'Ani Murid');
insert into public.certificates (booking_id, participant_id, kind, certificate_number, verify_code, recipient_name,
  institution_name, visit_date, rw_ids) values
  ('00000000-0000-4000-8000-0000b5000001', null, 'group', 'SERT/GSK/2026/00501', 'RLSCERT501', 'SD Negeri 1', 'SD Negeri 1',
   public.today_jkt(), '{5}'),
  ('00000000-0000-4000-8000-0000b5000001', '00000000-0000-4000-8000-0000bb000001', 'participant', 'SERT/GSK/2026/00502',
   'RLSCERT502', 'Ani Murid', 'SD Negeri 1', public.today_jkt(), '{5}'),
  ('00000000-0000-4000-8000-0000b8000001', null, 'group', 'SERT/GSK/2026/00801', 'RLSCERT801', 'SMP 8', 'SMP 8',
   public.today_jkt(), '{8}'),
  ('00000000-0000-4000-8000-0000bc000001', null, 'group', 'SERT/GSK/2026/00901', 'RLSCERT901', 'SMA Kombinasi',
   'SMA Kombinasi', public.today_jkt(), '{5,8}');

-- ===== anon =====
select pg_temp.act_as('anon');
select throws_ok($$select id from public.tickets_qr$$, '42501', null, 'anon reads no ticket');
select throws_ok($$select id from public.ticket_scans$$, '42501', null, 'no scan');
select throws_ok($$select id from public.certificates$$, '42501', null, 'no certificate');
select throws_ok($$select ticket_id from public.v_attendance_today$$, '42501', null, 'and no gate list');

-- ===== a signed-in user without a role =====
reset role;
select pg_temp.act_as('none');
select is(
  (select count(*)::int from public.tickets_qr) + (select count(*)::int from public.ticket_scans)
  + (select count(*)::int from public.certificates),
  0,
  'a user without a role sees no ticket, scan or certificate'
);

-- ===== admin_rw 05 =====
reset role;
select pg_temp.act_as('admin_rw_05');
select is(
  (select string_agg(ticket_code, ',' order by ticket_code) from public.tickets_qr),
  'GSK-T5000001-05,GSK-T5000008-05,GSK-TC000001-05',
  'an RW admin sees their own RW''s tickets, old ones and their leg of the combo included'
);
select is((select count(*)::int from public.ticket_scans where rw_id = 8), 0, 'no RW 08 scan');
select is((select count(*)::int from public.ticket_scans), 1, 'and their own RW''s');
select is(
  (select string_agg(certificate_number, ',' order by certificate_number) from public.certificates),
  'SERT/GSK/2026/00501,SERT/GSK/2026/00502,SERT/GSK/2026/00901',
  'the certificates of today''s visits to their RW, the combo''s included'
);
select throws_ok($$select recipient_name from public.certificates$$, '42501', null,
  'without the name on a participant certificate, often a child''s');
select is(
  (select string_agg(ticket_code || ':' || booking_code, ',' order by ticket_code) from public.v_attendance_today),
  'GSK-T5000001-05:GSK-T5000001,GSK-TC000001-05:GSK-TC000001',
  'today''s gate list shows their RW''s tickets with their bookings, always inside the window'
);
select throws_ok($$update public.tickets_qr set status = 'used' where ticket_code = 'GSK-T5000001-05'$$, '42501', null,
  'a ticket is never checked in by a plain update; check_in_ticket does that');

-- ===== admin_rw 08 =====
reset role;
select pg_temp.act_as('admin_rw_08');
select is(
  (select string_agg(ticket_code, ',' order by ticket_code) from public.tickets_qr),
  'GSK-T8000001-08,GSK-TC000001-08',
  'RW 08''s admin sees RW 08''s tickets only'
);
select is((select count(*)::int from public.v_attendance_today), 2, 'and RW 08''s gate list');

-- ===== superadmin =====
reset role;
select pg_temp.act_as('superadmin_aal1');
select is((select count(*)::int from public.tickets_qr where ticket_code like 'GSK-T%'), 5,
  'tickets need no AAL2: the superadmin sees all at AAL1');
reset role;
select pg_temp.act_as('superadmin_aal2');
select is((select count(*)::int from public.certificates where certificate_number like 'SERT/GSK/2026/00%'), 4,
  'and every certificate');
select throws_ok($$select recipient_name from public.certificates$$, '42501', null,
  'but no participant''s name through the API either');

select * from finish();
rollback;
