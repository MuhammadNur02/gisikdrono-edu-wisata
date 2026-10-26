-- The independent review of PR #33 (Task P3.6): the quotation functions check their caller and name their actor
-- (finding 4), the first quotation of a quoted booking is issued once even when its first try was lost (finding 3),
-- and a rendered document's file is recorded under the reader's name (finding 1).
begin;
select plan(20);

-- ===== Fixtures: a superadmin, an RW 05 package and session, and a school's quoted booking =====
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000f0001', 'review-super@example.test'),
  ('00000000-0000-4000-8000-0000000f0002', 'review-gone@example.test');
insert into public.profiles (id, email, full_name, role, rw_id, is_active) values
  ('00000000-0000-4000-8000-0000000f0001', 'review-super@example.test', 'Super Tinjau', 'superadmin', null, true),
  ('00000000-0000-4000-8000-0000000f0002', 'review-gone@example.test', 'Bukan Staf', 'none', null, false);
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000f1001', 5, 'regular', 'uji-tinjau-sp', 'Paket Tinjau SP', 'per_pax', 30000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000f2001', 5, public.today_jkt() + 5, '09:05', '10:05', 'Uji tinjau SP', 40);

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

create function pg_temp.quoted(p_phone text) returns uuid
  language sql
as $$
  select (internal.create_booking('00000000-0000-4000-8000-0000000f1001',
    array['00000000-0000-4000-8000-0000000f2001']::uuid[], 20,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Tinjau', 'pic_name', 'Ani Tinjau',
                       'pic_phone', p_phone, 'pic_email', 'tinjau@contoh.test', 'notes', null),
    '[]', '[]', 'quote', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote('00000000-0000-4000-8000-0000000f1001', 20, '[]',
                                                       array[5]::smallint[]))) ->> 'booking_id')::uuid;
$$;

create temporary table booking on commit drop as select pg_temp.quoted('+6281300000401') as id;

-- ===== Finding 3: the first quotation, once =====
select isnt((select internal.issue_first_quotation((select id from booking))), null,
  'a quoted booking without a quotation gets its first one');
select is((select internal.issue_first_quotation((select id from booking))), null,
  'a second try issues nothing');
select is((select count(*)::int from public.quotations where booking_id = (select id from booking)), 1,
  'so the booking holds exactly one quotation');
select is((select count(*)::int from public.notifications
           where booking_id = (select id from booking) and template = 'quotation_ready'), 2,
  'and its message is queued once per channel');
select throws_ok($$select internal.issue_first_quotation('00000000-0000-4000-8000-0000000f9999')$$, 'P0002', null,
  'a booking that does not exist is refused');

-- ===== Finding 4: the actor of a re-issue, and the caller =====
select internal.create_quotation((select id from booking), '00000000-0000-4000-8000-0000000f0001');
select is((select (e.actor_type, e.actor_id) from public.booking_events e
           where e.booking_id = (select id from booking) and e.payload ->> 'version' = '2'),
  ('admin'::text, '00000000-0000-4000-8000-0000000f0001'::uuid), 'a re-issue is the officer''s in the history');
select is((select (a.actor_role, a.actor_id) from public.audit_logs a
           where a.entity_type = 'quotations' and a.action = 'quotations.insert'
             and a.after ->> 'version' = '2' and a.after ->> 'booking_id' = (select id::text from booking)),
  ('superadmin'::text, '00000000-0000-4000-8000-0000000f0001'::uuid), 'and in the audit log, by their own role');
select is((select issued_by from public.quotations where booking_id = (select id from booking) and version = 2),
  '00000000-0000-4000-8000-0000000f0001'::uuid, 'and the quotation names them as its issuer');
select throws_ok($$select internal.create_quotation((select id from booking), '00000000-0000-4000-8000-0000000f0002')$$,
  '42501', null, 'an actor who is no staff member is refused');

set local role authenticated;
select throws_ok($$select internal.require_server_caller('create_quotation')$$, '42501', null,
  'a signed-in session is no server caller');
reset role;
select lives_ok($$select internal.require_server_caller('create_quotation')$$,
  'the owner''s own session is (migrations, pgTAP, cron)');
select ok(has_function_privilege('service_role', 'public.svc_issue_first_quotation(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.svc_issue_first_quotation(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.svc_record_document_pdf(text, uuid, text, uuid)', 'execute'),
  'only the service role reaches the new wrappers');

-- ===== Finding 1: a rendered file recorded under the reader's name =====
-- Each version's own file, named after its own number (20261023120000).
create temporary table issued on commit drop as
  select q.id, q.version, q.booking_id,
         'bookings/' || q.booking_id || '/quotation-' || replace(q.quotation_number, '/', '-') || '.pdf' as path
  from public.quotations q where q.booking_id = (select id from booking);
create temporary table version_two on commit drop as select * from issued where version = 2;
create temporary table version_one on commit drop as select * from issued where version = 1;
select lives_ok($$select internal.record_document_pdf('quotation', (select id from version_two), (select path from version_two),
  null)$$, 'a visitor''s first read records the file');
select is((select pdf_path from public.quotations where id = (select id from version_two)), (select path from version_two),
  'on the quotation''s row');
select is((select a.actor_role from public.audit_logs a
           where a.entity_type = 'quotations' and a.entity_id = (select id::text from version_two) and a.action = 'quotations.update'
           order by a.id desc limit 1), 'visitor', 'and the audit log names the visitor');
select throws_ok($$select internal.record_document_pdf('quotation', (select id from version_two),
  'bookings/00000000-0000-4000-8000-000000000000/quotation-SP-GSK-2026-10-0001.pdf', null)$$, '22023', null,
  'a file of another booking''s folder is refused');
select throws_ok($$select internal.record_document_pdf('credit_note', (select id from version_two), (select path from version_two),
  null)$$, '22023', null, 'and so is a kind this does not keep');

-- The re-review of PR #33, finding 3: the row's own file, set once.
select lives_ok($$select internal.record_document_pdf('quotation', (select id from version_two),
  (select path from version_two), null)$$, 'recording the same file again changes nothing');
select throws_ok($$select internal.record_document_pdf('quotation', (select id from version_two),
  (select path from version_one), null)$$, '22023', null, 'version 2 cannot name the file of version 1');
update public.quotations set pdf_path = 'bookings/' || booking_id || '/quotation-OLD.pdf'
where id = (select id from version_one);
select throws_ok($$select internal.record_document_pdf('quotation', (select id from version_one),
  (select path from version_one), null)$$, '23505', null, 'and a file already recorded is never replaced');

select * from finish();
rollback;
