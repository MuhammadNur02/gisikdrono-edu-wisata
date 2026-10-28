-- The guest certificate page's step-up (20261104210100; Task P4.5.03, docs/Security.md DOC-02): the last four digits
-- of the PIC's verified number are compared in the database, which hands back only the answer; five wrong tries a day
-- raise one open alert per booking, and the tenth wrong try of the window blocks the step-up for good (review of
-- PR #94, L1). A right try starts the count since the last right one again, but never the window's total, whose
-- thirtieth wrong try blocks too; every step checks its caller (20261105110000; review of PR #107, L1).
begin;
select plan(24);
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

select is(internal.check_certificate_phone((select id from certified), '5678', repeat('a', 64)), 'verified',
  'the last four digits of the verified number pass');
select is((select count(*)::int || ':' || max(actor_role) || ':' || max(ip_hash) || ':' || max(entity_id)
           || ':' || max(details ->> 'source') from public.security_events
           where event_type = 'pii_revealed' and entity_id = (select id from certified)::text),
  '1:visitor:' || repeat('a', 64) || ':' || (select id from certified)::text || ':certificate_phone_step_up',
  'a right answer opens names, so it is a pii_revealed event of the visitor with the hashed IP');
select is(internal.check_certificate_phone((select id from certified), '1234'), 'mismatch', 'any other four do not');
select is((select certificate_phone_failures from public.bookings where id = (select id from certified)), 1::smallint,
  'and every wrong try of the window is counted on the booking');
select is(internal.check_certificate_phone((select id from certified), '5678'), 'verified',
  'a right try after a wrong one still passes');
select is((select certificate_phone_failures from public.bookings where id = (select id from certified)), 0::smallint,
  'and starts the count of wrong tries again, since only guesses that never succeed add up to the block');
select is(internal.check_certificate_phone((select id from certified), '1234'), 'mismatch',
  'the next wrong try counts from there');
select throws_ok($$select internal.check_certificate_phone((select id from certified), '5678', '10.0.0.1')$$, '22023',
  null, 'the IP comes hashed, never as it is');
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

select set_config('app.in_rpc', '1', true);
update public.bookings set phone_verified_at = now() where id = (select id from certified);
select set_config('app.in_rpc', '', true);
select is(array(select internal.check_certificate_phone((select id from certified), '0000')
                from generate_series(1, 9)),
  array['mismatch', 'mismatch', 'mismatch', 'mismatch', 'mismatch', 'mismatch', 'mismatch', 'mismatch', 'blocked'],
  'the tenth wrong try of the window blocks the step-up');
select is(internal.check_certificate_phone((select id from certified), '5678'), 'blocked',
  'for good: not even the right digits open it then');
select is((select count(*)::int || ':' || max(occurrences) || ':' || max(severity::text) from public.security_alerts
           where fingerprint = 'certificate_phone_blocked:' || (select id from certified)), '1:2:high',
  'the block raises one high alert per booking, counted again on every later try');

select internal.lock_certificate_phone((select id from certified));
select internal.lock_certificate_phone((select id from certified));
select is((select count(*)::int || ':' || max(occurrences) || ':' || max(severity::text) from public.security_alerts
           where fingerprint = 'certificate_phone_locked:' || (select id from certified)), '1:2:high',
  'the lock raises one high alert per booking, counted again on every later lock');

-- A forwarded link's guesses are not wiped by the PIC's own proofs: right and wrong tries taken in turn still block at
-- the thirtieth wrong one, and a right try changes nothing after that.
create temporary table alternated on commit drop as
select pg_temp.hold('00000000-0000-4000-8000-0000000c1001', '00000000-0000-4000-8000-0000000c3001', 2,
                    '+6281300005679', false) as id;
select set_config('app.in_rpc', '1', true);
update public.bookings set phone_verified_at = now() where id = (select id from alternated);
select set_config('app.in_rpc', '', true);
create function pg_temp.alternate(p_booking uuid, p_rounds integer) returns text[]
  language plpgsql
as $$
declare
  answers text[] := '{}';
  wrong text;
  right_try text;
begin
  for attempt in 1 .. p_rounds loop
    wrong := internal.check_certificate_phone(p_booking, '0000');
    right_try := internal.check_certificate_phone(p_booking, '5679');
    answers := answers || (wrong || '/' || right_try);
  end loop;
  return answers;
end;
$$;
select is(array(select distinct a from unnest(pg_temp.alternate((select id from alternated), 29)) a),
  array['mismatch/verified'],
  'twenty-nine wrong tries, each followed by a right one, never reach the block of ten in a row');
select is((select certificate_phone_failures || ':' || certificate_phone_failures_total from public.bookings
           where id = (select id from alternated)), '0:29',
  'the right tries reset the count since the last right one, never the window''s total');
select is(internal.check_certificate_phone((select id from alternated), '0000'), 'blocked',
  'the thirtieth wrong try of the window blocks the step-up');
select is(internal.check_certificate_phone((select id from alternated), '5679'), 'blocked',
  'for good: a right try after it opens nothing, nor resets anything');
select is((select certificate_phone_failures_total || ':' || (select max(occurrences) from public.security_alerts
             where fingerprint = 'certificate_phone_blocked:' || (select id from alternated)))
           from public.bookings where id = (select id from alternated)), '30:2',
  'with the same high alert as the ten in a row, counted again on the later try');

select is(
  array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'internal' and p.prosecdef
      and p.proname in ('check_certificate_phone', 'lock_certificate_phone', 'block_certificate_phone',
                        'record_certificate_phone_proof', 'count_certificate_phone_failure')
      and strpos(p.prosrc, 'perform internal.require_server_caller(') > 0
    order by 1
  ),
  array['block_certificate_phone', 'check_certificate_phone', 'count_certificate_phone_failure',
        'lock_certificate_phone', 'record_certificate_phone_proof'],
  'every security definer step of the step-up checks its caller'
);

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
