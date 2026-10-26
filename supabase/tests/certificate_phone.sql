-- The guest certificate page's step-up (20261104170100; Task P4.5.03, docs/Security.md DOC-02): the last four digits
-- of the PIC's verified number are compared in the database, which hands back only the answer, and five wrong tries
-- raise one open alert per booking.
begin;
select plan(9);
\ir helpers/rls_personas.psql
\ir helpers/visit_terms.psql
select set_config('app.qr_key_id', 'k1', true);

insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000c1001', 5, 'student', 'uji-sertifikat-paket', 'Paket Uji Sertifikat', 'per_pax',
   30000, 'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000c3001', 5, public.today_jkt() + 9, '09:00', '11:00', 'Uji sertifikat', 50);
create temporary table certified on commit drop as
select pg_temp.hold('00000000-0000-4000-8000-0000000c1001', '00000000-0000-4000-8000-0000000c3001', 2,
                    '+6281300005678', false) as id;
grant select on certified to anon, authenticated;
select set_config('app.in_rpc', '1', true);
update public.bookings set phone_verified_at = now() where id = (select id from certified);
select set_config('app.in_rpc', '', true);

select is(internal.check_certificate_phone((select id from certified), '5678'), 'verified',
  'the last four digits of the verified number pass');
select is(internal.check_certificate_phone((select id from certified), '1234'), 'mismatch', 'any other four do not');
select throws_ok($$select internal.check_certificate_phone((select id from certified), '56a8')$$, '22023', null,
  'only four digits are compared');
select throws_ok($$select internal.check_certificate_phone((select id from certified), '+6281300005678')$$, '22023',
  null, 'never a whole number');
select throws_ok($$select internal.check_certificate_phone('00000000-0000-4000-8000-0000000c9999', '5678')$$, 'P0002',
  null, 'a booking that does not exist is not found');

select set_config('app.in_rpc', '1', true);
update public.bookings set phone_verified_at = null where id = (select id from certified);
select set_config('app.in_rpc', '', true);
select is(internal.check_certificate_phone((select id from certified), '5678'), 'unverified',
  'a number no WhatsApp code proved opens nothing, even with the right digits');

select internal.lock_certificate_phone((select id from certified));
select internal.lock_certificate_phone((select id from certified));
select is((select count(*)::int || ':' || max(occurrences) || ':' || max(severity::text) from public.security_alerts
           where fingerprint = 'certificate_phone_locked:' || (select id from certified)), '1:2:high',
  'the lock raises one high alert per booking, counted again on every later lock');

select pg_temp.act_as('anon');
select throws_ok($$select public.svc_check_certificate_phone((select id from certified), '5678')$$, '42501', null,
  'a visitor cannot ask the database directly');
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.svc_lock_certificate_phone((select id from certified))$$, '42501', null,
  'nor can staff');
reset role;

select * from finish();
rollback;
