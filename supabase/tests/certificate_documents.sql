-- Task P4.5.02 (docs/Security.md §10.3, DOC-02, DATA-12; 20261103100000_certificate_documents.sql): the kept file of a
-- certificate. internal.record_document_pdf records it only under the certificate's own name in its booking's
-- certificates folder, for a certificate that is issued, released and not purged, under the staff reader's name; the
-- same file recorded again stamps rendered_at anew; no API role reaches the wrapper.
begin;
select plan(13);
\ir helpers/rls_personas.psql
grant execute on function public.validate_ticket(uuid, uuid, text, jsonb, text),
  public.check_in_ticket(uuid, uuid, integer, text, jsonb, boolean, text, text, text) to authenticated;
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: two RW 05 visits checked in, one with a participant list, one with an unpaid person =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000f3001', 5, 'regular', 'uji-berkas-sertifikat', 'Paket Uji Berkas', 'per_pax',
   25000, 'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000f3051', 5, public.today_jkt() + 12, '10:17', '11:17', 'Uji berkas 05', 200);

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

create function pg_temp.paid(p_pax integer, p_phone text) returns uuid
  language plpgsql
as $$
declare
  package_id constant uuid := '00000000-0000-4000-8000-0000000f3001';
  held uuid;
  attempt jsonb;
  answer jsonb;
begin
  held := (internal.create_booking(package_id, array['00000000-0000-4000-8000-0000000f3051']::uuid[], p_pax,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Berkas', 'pic_name', 'Ani Berkas',
                       'pic_phone', p_phone, 'pic_email', 'berkas' || right(p_phone, 4) || '@contoh.test',
                       'notes', null),
    '[]', '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote(package_id, p_pax, '[]', array[5]::smallint[])))
    ->> 'booking_id')::uuid;
  attempt := internal.create_payment_attempt(held, null, null);
  perform internal.attach_snap_token((attempt ->> 'payment_id')::uuid, 'token-' || (attempt ->> 'order_id'),
    'https://app.sandbox.midtrans.com/snap/v4/redirection/' || (attempt ->> 'order_id'));
  answer := jsonb_build_object('order_id', attempt ->> 'order_id', 'status_code', '200',
    'gross_amount', (select b.total_amount from public.bookings b where b.id = held) || '.00',
    'signature_key', repeat('a', 128), 'transaction_status', 'settlement',
    'transaction_id', 'txn-' || (attempt ->> 'order_id'), 'payment_type', 'qris', 'currency', 'IDR',
    'fraud_status', 'accept', 'settlement_time', to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'));
  perform internal.apply_payment_event((internal.record_payment_event('webhook',
    encode(sha256(convert_to(answer::text, 'UTF8')), 'hex'), answer) ->> 'event_id')::bigint, 'webhook', answer, 'k1');
  update public.tickets_qr
  set valid_on = public.today_jkt(), valid_from = now() - interval '1 hour', valid_until = now() + interval '1 hour'
  where booking_id = held;
  return held;
end;
$$;

create temporary table visits on commit drop as
  select pg_temp.paid(2, '+6281300004001') as listed, pg_temp.paid(2, '+6281300004002') as unpaid;
insert into public.booking_participants (booking_id, seq_no, full_name, role_label)
select (select listed from visits), n.seq, n.name, 'student'
from unnest(array['Ani Murid', 'Budi Murid']) with ordinality as n(name, seq);
grant select on visits to authenticated;

create function pg_temp.ticket(p_booking uuid) returns uuid
  language sql stable security definer
as $$ select t.id from public.tickets_qr t where t.booking_id = p_booking; $$;
grant execute on function pg_temp.ticket(uuid) to authenticated;

select pg_temp.act_as('admin_rw_05');
select public.check_in_ticket(pg_temp.ticket((select listed from visits)), '00000000-0000-4000-8000-0000000fe101', 2,
                              p_raw => 'GSK.k1.berkas-listed');
select public.check_in_ticket(pg_temp.ticket((select unpaid from visits)), '00000000-0000-4000-8000-0000000fe102', 3,
                              p_raw => 'GSK.k1.berkas-unpaid');
reset role;

-- The certificate of each case and the file name the documents route gives it.
create temporary table files on commit drop as
  select c.id, c.kind, c.booking_id, 'certificates/' || c.booking_id || '/' || c.kind || '-'
                                               || replace(c.certificate_number, '/', '-') || '.pdf' as path,
         case when c.booking_id = (select unpaid from visits) then 'held'
              when c.kind = 'group' then 'group' else 'participant' end as label
  from public.certificates c where c.booking_id in (select listed from visits union select unpaid from visits);

create function pg_temp.file(p_label text) returns files
  language sql stable
as $$ select f.* from files f where f.label = p_label order by f.path limit 1; $$;
grant select on files to authenticated;
grant execute on function pg_temp.file(text) to authenticated;

-- ===== The own file, under the reader's name =====
select lives_ok(format($$select internal.record_document_pdf('certificate', %L, %L, %L)$$,
  (pg_temp.file('group')).id, (pg_temp.file('group')).path, pg_temp.persona_id('admin_rw_05')),
  'a released group certificate records its own file');
select is((select (c.pdf_path = (pg_temp.file('group')).path, c.rendered_at is not null)::text
           from public.certificates c where c.id = (pg_temp.file('group')).id),
  '(t,t)', 'with the moment it was rendered');
select is((select a.actor_id from public.audit_logs a
           where a.entity_type = 'certificates' and a.entity_id = (pg_temp.file('group')).id::text
             and a.action = 'certificates.update' order by a.id desc limit 1),
  pg_temp.persona_id('admin_rw_05'), 'and the audit log names the officer who opened it');
select matches((pg_temp.file('participant')).path, '^certificates/[0-9a-f-]{36}/participant-SERT-GSK-[0-9]{4}-[0-9]{5}\.pdf$',
  'a participant''s file carries the name purge_participants removes');
select lives_ok(format($$select internal.record_document_pdf('certificate', %L, %L, null)$$,
  (pg_temp.file('participant')).id, (pg_temp.file('participant')).path), 'and records it');

update public.certificates set rendered_at = now() - interval '1 day' where id = (pg_temp.file('group')).id;
select lives_ok(format($$select internal.record_document_pdf('certificate', %L, %L, %L)$$,
  (pg_temp.file('group')).id, (pg_temp.file('group')).path, pg_temp.persona_id('superadmin_aal2')),
  'recording the same file again is the re-render');
select is((select c.rendered_at from public.certificates c where c.id = (pg_temp.file('group')).id), now(),
  'which moves rendered_at from the day before back to this render');

-- ===== Refusals =====
select throws_ok(format($$select internal.record_document_pdf('certificate', %L, %L, null)$$,
  (pg_temp.file('participant')).id, (pg_temp.file('group')).path), '22023', null,
  'a certificate cannot name another certificate''s file');
select throws_ok(format($$select internal.record_document_pdf('certificate', %L, %L, null)$$,
  (pg_temp.file('participant')).id,
  replace((pg_temp.file('participant')).path, 'certificates/', 'bookings/')), '22023', null,
  'nor a file outside its certificates folder');
select throws_ok(format($$select internal.record_document_pdf('certificate', %L, %L, null)$$,
  (pg_temp.file('held')).id, (pg_temp.file('held')).path), 'P0001', null,
  'a certificate held back for unpaid people keeps no file');
select pg_temp.act_as('superadmin_aal2');
select public.revoke_certificate((pg_temp.file('participant')).id, 'Nama salah ketik');
reset role;
select throws_ok(format($$select internal.record_document_pdf('certificate', %L, %L, null)$$,
  (pg_temp.file('participant')).id, (pg_temp.file('participant')).path), 'P0001', null,
  'nor does a revoked one');
select throws_ok($$select internal.record_document_pdf('certificate', '00000000-0000-4000-8000-0000000f3999',
  'certificates/x/group-x.pdf', null)$$, 'P0002', null, 'an unknown certificate is not found');

select pg_temp.act_as('superadmin_aal2');
select throws_ok(format($$select public.svc_record_document_pdf('certificate', %L, %L, null)$$,
  (pg_temp.file('group')).id, (pg_temp.file('group')).path), '42501', null,
  'and no staff session records a file itself');
reset role;

select * from finish();
rollback;
