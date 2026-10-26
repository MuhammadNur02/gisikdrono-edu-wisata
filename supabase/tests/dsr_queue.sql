-- Task P4.10.03 (20261104140100; docs/Security.md §7.6, PDP-03, GUEST-10): the superadmin opens a data request for a
-- booking, the guest confirms it with a dsr_identity code to the booking's own verified number, and only then does it
-- count; the superadmin acknowledges it and finishes it once, by an export, by deleting the participants, by
-- anonymising the booking, or by a close, each audited, each telling the guest; only the superadmin at AAL2 handles
-- requests, the destructive steps with a fresh code, and the table is written by these functions alone.
begin;
select plan(45);
\ir helpers/rls_personas.psql

-- ===== Fixtures: a paid RW 05 booking with a verified number and two participants, and one without =====
insert into public.site_settings (key, value) values ('whatsapp_enabled', 'true')
on conflict (key) do update set value = excluded.value;
insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000d5c01', 5, 'regular', 'uji-dsr', 'Paket Uji DSR', 25000, 'published');
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, amount_paid,
  consent_version, consented_at, phone_verified_at, paid_at, notes)
values
  ('00000000-0000-4000-8000-0000000d5b01', 'GSK-D5R00001', 'paid', '00000000-0000-4000-8000-0000000d5c01', '{}', '{5}',
   'school', 'Sari Pemesan', '+6281255500001', 'sari@example.test', 2, public.today_jkt() + 5, public.today_jkt() + 5,
   50000, 50000, 50000, 'v1', now(), now(), now(), 'Catatan Sari'),
  ('00000000-0000-4000-8000-0000000d5b02', 'GSK-D5R00002', 'quoted', '00000000-0000-4000-8000-0000000d5c01', '{}',
   '{5}', 'school', 'Tono Belum', '+6281255500002', 'tono@example.test', 2, public.today_jkt() + 5,
   public.today_jkt() + 5, 50000, 50000, 0, 'v1', now(), null, null, null);
select set_config('app.in_rpc', '', true);
insert into public.booking_participants (booking_id, seq_no, full_name, role_label) values
  ('00000000-0000-4000-8000-0000000d5b01', 1, 'Ani Murid', 'student'),
  ('00000000-0000-4000-8000-0000000d5b01', 2, 'Budi Murid', 'student');

create function pg_temp.open(p_type text) returns uuid
  language plpgsql
as $$
declare
  answer jsonb;
begin
  perform pg_temp.act_as('superadmin_aal2');
  answer := public.dsr_open('00000000-0000-4000-8000-0000000d5b01', p_type, 'Diminta lewat telepon ke kelurahan');
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return (answer ->> 'request_id')::uuid;
end;
$$;
-- The guest's browser asks for a code and types it: browser p_browser, code hash repeat(p_browser, 64).
create function pg_temp.confirm(p_browser text) returns jsonb
  language plpgsql
as $$
begin
  perform public.svc_issue_dsr_identity_otp('00000000-0000-4000-8000-0000000d5b01', gen_random_uuid(),
                                            repeat(p_browser, 64), repeat(p_browser, 64), '123456');
  return public.svc_confirm_dsr_identity('00000000-0000-4000-8000-0000000d5b01', repeat(p_browser, 64),
                                         repeat(p_browser, 64));
end;
$$;
create function pg_temp.step(p_sql text) returns jsonb
  language plpgsql
as $$
declare
  answer jsonb;
begin
  perform pg_temp.act_as('superadmin_aal2');
  execute p_sql into answer;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  return answer;
end;
$$;
create function pg_temp.request(p_id uuid) returns text
  language sql stable
as $$
  select (r.status, r.outcome, r.verified_at is not null, r.acknowledged_at is not null)::text
  from public.dsr_requests r where r.id = p_id;
$$;

-- ===== Who opens a request =====
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.dsr_open('00000000-0000-4000-8000-0000000d5b01', 'access', 'Diminta lewat telepon')$$,
  '42501', null, 'an RW admin opens no data request');
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select public.dsr_open('00000000-0000-4000-8000-0000000d5b01', 'access', 'Diminta lewat telepon')$$,
  '42501', null, 'nor does the superadmin before AAL2');
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.dsr_open('00000000-0000-4000-8000-0000000d5b01', 'access', 'pendek')$$,
  '22023', null, 'a request needs its reason');
select throws_ok($$select public.dsr_open('00000000-0000-4000-8000-0000000d5b02', 'access', 'Diminta lewat telepon')$$,
  'P0001', null, 'and a booking whose WhatsApp number is verified, where the guest confirms it');
reset role;
select set_config('request.jwt.claims', '', true);

-- ===== Intake: the guest confirms =====
create temporary table requests (kind text primary key, id uuid);
insert into requests values ('access', pg_temp.open('access'));
select is(pg_temp.request((select id from requests where kind = 'access')), '(received,,f,f)',
  'an opened request waits for the guest, received and unconfirmed');
select ok((select r.booking_id = '00000000-0000-4000-8000-0000000d5b01' and r.phone = '+6281255500001'
                  and r.booking_code = 'GSK-D5R00001' from public.dsr_requests r
           where r.id = (select id from requests where kind = 'access')),
  'it names its booking and the booking''s own number, never one typed in');
select is((select (n.template::text, n.recipient, n.params ->> 'link_scope', n.params ->> 'link_page')::text
           from public.notifications n
           where n.booking_id = '00000000-0000-4000-8000-0000000d5b01' and n.template = 'booking_link'),
  '(booking_link,+6281255500001,manage,privasi)', 'the guest gets a manage link to the confirm page');
select throws_ok($$select pg_temp.step('select public.dsr_acknowledge(''' || (select id from requests where kind = 'access') || ''')::text::jsonb')$$,
  'P0001', null, 'nothing is acknowledged before the guest confirms it');
select is(public.svc_issue_dsr_identity_otp('00000000-0000-4000-8000-0000000d5b02', gen_random_uuid(), repeat('9', 64),
                                            repeat('9', 64), '123456') ->> 'result',
  'none', 'no code for a booking without a request awaiting its guest');
select is(public.svc_issue_dsr_identity_otp('00000000-0000-4000-8000-0000000d5b01', gen_random_uuid(), repeat('1', 64),
                                            repeat('1', 64), '123456') ->> 'result',
  'sent', 'the guest''s browser asks for a code');
select is((select (o.purpose::text, o.phone, o.booking_id)::text from public.guest_otps o
           where o.browser_hash = repeat('1', 64)),
  '(dsr_identity,+6281255500001,00000000-0000-4000-8000-0000000d5b01)'::text,
  'a dsr_identity code to the booking''s own number, through issue_phone_otp');
select is(public.svc_confirm_dsr_identity('00000000-0000-4000-8000-0000000d5b01', repeat('1', 64), repeat('b', 64))
            ->> 'result',
  'wrong_code', 'a wrong code confirms nothing');
select is(public.svc_confirm_dsr_identity('00000000-0000-4000-8000-0000000d5b01', repeat('1', 64), repeat('1', 64)),
  '{"result": "verified", "confirmed": 1}', 'the right one confirms the waiting request');
select is((select (r.due_at = now() + interval '3 days', r.fulfil_due_at = now() + interval '14 days')::text
           from public.dsr_requests r where r.id = (select id from requests where kind = 'access')),
  '(t,t)', 'and starts its clocks: 3 x 24 h to acknowledge, 14 days to fulfil');
select ok(not has_function_privilege('authenticated', 'public.svc_confirm_dsr_identity(uuid, text, text)', 'execute')
          and not has_function_privilege('authenticated',
                                         'public.svc_issue_dsr_identity_otp(uuid, uuid, text, text, text, inet)', 'execute'),
  'the guest''s steps are the server''s calls alone');

-- ===== Access: an export =====
select pg_temp.step(format('select jsonb_build_object(''ack'', public.dsr_acknowledge(%L)::text)',
                           (select id from requests where kind = 'access')));
select is(pg_temp.request((select id from requests where kind = 'access')), '(in_progress,,t,t)',
  'the superadmin acknowledges it');
select throws_ok(format($$select pg_temp.step('select public.dsr_record_export(''%s'', ''bookings/x/dsr/y.json'', ''bookings/x/dsr/y.pdf'', ''Data dikirim lewat tautan'')')$$,
                        (select id from requests where kind = 'access')),
  '22023', null, 'an export lies under its own booking and request');
select is(pg_temp.step(format($$select public.dsr_record_export(%L, %L, %L, 'Data dikirim lewat tautan')$$,
                              (select id from requests where kind = 'access'),
                              format('bookings/%s/dsr/%s.json', '00000000-0000-4000-8000-0000000d5b01', (select id from requests where kind = 'access')),
                              format('bookings/%s/dsr/%s.pdf', '00000000-0000-4000-8000-0000000d5b01', (select id from requests where kind = 'access')))),
  '{"stage": "completed", "notified": true}', 'the export finishes the request and the guest hears of it');
select is(pg_temp.request((select id from requests where kind = 'access')), '(completed,exported,t,t)',
  'completed as exported');
select is((select n.params ->> 'link_scope' from public.notifications n
           where n.booking_id = '00000000-0000-4000-8000-0000000d5b01' and n.template = 'booking_link'
           order by n.created_at desc, n.id desc limit 1),
  'view', 'with a view link to the same page');
select throws_ok(format($$select pg_temp.step('select public.dsr_acknowledge(''%s'')::text::jsonb')$$,
                        (select id from requests where kind = 'access')),
  'P0001', null, 'a finished request finishes once');

-- ===== Erasure: the participants =====
insert into requests values ('participants', pg_temp.open('erasure'));
select is(pg_temp.confirm('2') ->> 'result', 'verified', 'the guest confirms the next request too');
select pg_temp.step(format('select jsonb_build_object(''ack'', public.dsr_acknowledge(%L)::text)',
                           (select id from requests where kind = 'participants')));
select pg_temp.act_as('superadmin_stale_totp');
select throws_ok(format($$select public.dsr_delete_participants(%L, 'Peserta dihapus atas permintaan')$$,
                        (select id from requests where kind = 'participants')),
  '42501', null, 'deleting needs a fresh authenticator code');
reset role;
select set_config('request.jwt.claims', '', true);
select is(pg_temp.step(format($$select public.dsr_delete_participants(%L, 'Peserta dihapus atas permintaan')$$,
                              (select id from requests where kind = 'participants'))) ->> 'participants_deleted',
  '2', 'with one, the booking''s participants go');
select is((select count(*)::int from public.booking_participants
           where booking_id = '00000000-0000-4000-8000-0000000d5b01'), 0, 'all of them');
select is((select count(*)::int from public.booking_events
           where booking_id = '00000000-0000-4000-8000-0000000d5b01' and reason = 'dsr_participants_deleted'), 1,
  'a booking event records it');
select is(pg_temp.request((select id from requests where kind = 'participants')), '(completed,participants_deleted,t,t)',
  'and the request is completed as such');

-- ===== Rectification, and a refusal for an identity never confirmed =====
insert into requests values ('rectification', pg_temp.open('rectification'));
select pg_temp.confirm('3');
insert into requests values ('unconfirmed', pg_temp.open('restriction'));
select throws_ok(format($$select pg_temp.step('select public.dsr_close(''%s'', ''rectified'', ''Nama institusi diperbaiki'')')$$,
                        (select id from requests where kind = 'rectification')),
  'P0001', null, 'a rectification is closed once acknowledged');
select pg_temp.step(format('select jsonb_build_object(''ack'', public.dsr_acknowledge(%L)::text)',
                           (select id from requests where kind = 'rectification')));
select is(pg_temp.step(format($$select public.dsr_close(%L, 'rectified', 'Nama institusi diperbaiki')$$,
                              (select id from requests where kind = 'rectification'))),
  '{"stage": "completed", "notified": true}', 'then closes as rectified');
select throws_ok(format($$select pg_temp.step('select public.dsr_close(''%s'', ''rectified'', ''Tidak bisa dikonfirmasi'')')$$,
                        (select id from requests where kind = 'unconfirmed')),
  'P0001', null, 'an unconfirmed request is never rectified');
select is(pg_temp.step(format($$select public.dsr_close(%L, 'rejected_identity', 'Tamu tidak mengonfirmasi')$$,
                              (select id from requests where kind = 'unconfirmed'))),
  '{"stage": "rejected", "notified": false}', 'it is refused for its identity, and its guest hears nothing');
select throws_ok(format($$select pg_temp.step('select public.dsr_close(''%s'', ''anonymised'', ''Tidak lewat sini'')')$$,
                        (select id from requests where kind = 'rectification')),
  '22023', null, 'and a close never claims a database action');

-- ===== Erasure: the booking =====
insert into requests values ('erasure', pg_temp.open('erasure'));
select pg_temp.confirm('4');
select pg_temp.step(format('select jsonb_build_object(''ack'', public.dsr_acknowledge(%L)::text)',
                           (select id from requests where kind = 'erasure')));
select throws_ok(format($$select pg_temp.step('select public.dsr_anonymise_booking(''%s'', ''Tidak sesuai'')')$$,
                        (select id from requests where kind = 'rectification')),
  'P0001', null, 'a booking is anonymised for an open erasure request only');
select is(pg_temp.step(format($$select public.dsr_anonymise_booking(%L, 'Dianonimkan; faktur disimpan 10 tahun (UU KUP)')$$,
                              (select id from requests where kind = 'erasure'))) ->> 'notified',
  'true', 'the paid booking is anonymised, and the guest hears of it first');
select is((select (b.pic_name, b.pic_phone, b.pic_email, b.notes, b.pii_purged_at is not null, b.token_version)::text
           from public.bookings b where b.id = '00000000-0000-4000-8000-0000000d5b01'),
  '(anon,,,,t,2)', 'its contact and free text go, its links with them');
select is((select array_agg(n.params ->> 'link_scope') from public.notifications n
           where n.booking_id = '00000000-0000-4000-8000-0000000d5b01'),
  array['view'], 'every outbox row of the booking goes but the guest''s last message');
select is((select (b.total_amount, b.amount_paid, b.status::text)::text from public.bookings b
           where b.id = '00000000-0000-4000-8000-0000000d5b01'),
  '(50000,50000,paid)', 'while its money and status stay as they were');
select is(pg_temp.request((select id from requests where kind = 'erasure')), '(completed,anonymised,t,t)',
  'completed as anonymised');
select throws_ok(format($$select pg_temp.step('select public.dsr_open(''%s'', ''access'', ''Diminta lewat telepon'')')$$,
                        '00000000-0000-4000-8000-0000000d5b01'),
  'P0001', null, 'an anonymised booking takes no new request');

-- ===== Every step is on record =====
select is((select count(*)::int from public.security_events e
           where e.event_type = 'dsr_handled' and e.entity_id in (select id::text from requests)),
  18, 'every step is a dsr_handled security event');
select ok((select count(*) from public.audit_logs a
           where a.entity_type = 'dsr_requests' and a.action like 'dsr.%'
             and a.entity_id in (select id::text from requests)) >= 18,
  'and an audit row');
select is((select count(*)::int from public.security_events e
           where e.event_type = 'dsr_handled' and e.details ->> 'step' in ('participants_deleted', 'anonymised', 'exported')
             and e.severity = 'high' and e.entity_id in (select id::text from requests)),
  3, 'the destructive and the handing-out ones high');
select ok(has_function_privilege('authenticated', 'public.dsr_anonymise_booking(uuid, text)', 'execute')
          and not has_function_privilege('anon', 'public.dsr_open(uuid, text, text)', 'execute')
          and not has_function_privilege('service_role', 'public.dsr_close(uuid, text, text)', 'execute'),
  'the queue is a staff RPC, never anon''s or the service role''s');
select ok(not has_column_privilege('authenticated', 'public.dsr_requests', 'export_json_path', 'select')
          and not has_column_privilege('authenticated', 'public.dsr_requests', 'status', 'update'),
  'the superadmin never reads where the export lies, and writes the table only through the queue');
select throws_ok($$insert into public.dsr_requests (request_type, phone, due_at, status, outcome)
                   values ('access', '+6281255500009', now(), 'completed', null)$$,
  '23514', null, 'a finished request always has its outcome');

select * from finish();
rollback;
