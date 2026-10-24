-- Task P4.5.01 (docs/PRD.md FR-POST-01, FR-POST-02, FR-POST-04; QR-08, REC-11): the certificates of a visit. The last
-- leg's check-in issues the group certificate and, when the list fits the people who came, one per participant, each
-- numbered SERT/GSK/YYYY/NNNNN with its verify code; issuing again writes nothing; unpaid people hold the release back
-- until a superadmin waives it with a reason; a booking still waiting for a leg gets none; the superadmin revokes one
-- with a reason; a booking has one group certificate and a participant one at most. After an undone check-in only what
-- the undo flagged comes back, the participants' only while the list fits the new count, and a superadmin's revocation
-- stays whatever its reason reads (review of PR #53, M2).
begin;
select plan(38);
\ir helpers/rls_personas.psql
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000f1001', 5, 'regular', 'uji-sertifikat-05', 'Paket Uji Sertifikat', 'per_pax', 25000,
   'published');
insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000f1002', 'combo', 'uji-sertifikat-kombo', 'Kombo Uji Sertifikat', 'per_pax', 30000,
   'draft');
insert into public.tour_package_legs (package_id, rw_id, leg_order) values
  ('00000000-0000-4000-8000-0000000f1002', 5, 1), ('00000000-0000-4000-8000-0000000f1002', 13, 2);
update public.tour_packages set status = 'published' where id = '00000000-0000-4000-8000-0000000f1002';
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000f2051', 5, public.today_jkt() + 11, '10:13', '11:13', 'Uji sertifikat 05', 200),
  ('00000000-0000-4000-8000-0000000f2131', 13, public.today_jkt() + 11, '10:13', '11:13', 'Uji sertifikat 13', 200);

create function pg_temp.otp(p_phone text) returns uuid
  language sql
as $$
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id;
$$;

-- A booking held, paid by a confirmed settlement and given its tickets, whose gates open now.
create function pg_temp.paid(p_package uuid, p_sessions uuid[], p_rws smallint[], p_pax integer, p_phone text)
  returns uuid
  language plpgsql
as $$
declare
  held uuid;
  attempt jsonb;
  answer jsonb;
begin
  held := (internal.create_booking(p_package, p_sessions, p_pax,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Sertifikat', 'pic_name', 'Ani Sertifikat',
                       'pic_phone', p_phone, 'pic_email', 'sertifikat' || right(p_phone, 4) || '@contoh.test',
                       'notes', null),
    '[]', '[]', 'pay', 'web', null, pg_temp.otp(p_phone), '{"version": "2026-10-18"}', null,
    '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote(p_package, p_pax, '[]', p_rws))) ->> 'booking_id')::uuid;
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

create function pg_temp.participants(p_booking uuid, p_names text[]) returns void
  language sql
as $$
  insert into public.booking_participants (booking_id, seq_no, full_name, role_label)
  select p_booking, n.seq, n.name, 'student' from unnest(p_names) with ordinality as n(name, seq);
$$;

create temporary table visits on commit drop as select
  pg_temp.paid('00000000-0000-4000-8000-0000000f1001', array['00000000-0000-4000-8000-0000000f2051']::uuid[],
               array[5]::smallint[], 3, '+6281300003001') as listed,
  pg_temp.paid('00000000-0000-4000-8000-0000000f1001', array['00000000-0000-4000-8000-0000000f2051']::uuid[],
               array[5]::smallint[], 2, '+6281300003002') as long_list,
  pg_temp.paid('00000000-0000-4000-8000-0000000f1001', array['00000000-0000-4000-8000-0000000f2051']::uuid[],
               array[5]::smallint[], 5, '+6281300003003') as unpaid,
  pg_temp.paid('00000000-0000-4000-8000-0000000f1002',
               array['00000000-0000-4000-8000-0000000f2051', '00000000-0000-4000-8000-0000000f2131']::uuid[],
               array[5, 13]::smallint[], 4, '+6281300003004') as half_combo,
  pg_temp.paid('00000000-0000-4000-8000-0000000f1001', array['00000000-0000-4000-8000-0000000f2051']::uuid[],
               array[5]::smallint[], 3, '+6281300003005') as redo;
select pg_temp.participants((select listed from visits), array['Ani Murid', 'Budi Murid', 'Citra Murid']);
select pg_temp.participants((select long_list from visits), array['Dewi Murid', 'Eka Murid', 'Fajar Murid']);
select pg_temp.participants((select redo from visits), array['Gita Murid', 'Hadi Murid', 'Indah Murid']);
grant select on visits to authenticated;

create function pg_temp.ticket(p_booking uuid, p_rw smallint) returns uuid
  language sql stable security definer
as $$ select t.id from public.tickets_qr t where t.booking_id = p_booking and t.rw_id = p_rw; $$;
grant execute on function pg_temp.ticket(uuid, smallint) to authenticated;

-- ===== Check-in issues them =====
select pg_temp.act_as('admin_rw_05');
select public.check_in_ticket(pg_temp.ticket((select listed from visits), 5::smallint),
                              '00000000-0000-4000-8000-0000000fe001', 3, p_raw => 'GSK.k1.listed');
select public.check_in_ticket(pg_temp.ticket((select long_list from visits), 5::smallint),
                              '00000000-0000-4000-8000-0000000fe002', 2, p_raw => 'GSK.k1.long');
select public.check_in_ticket(pg_temp.ticket((select unpaid from visits), 5::smallint),
                              '00000000-0000-4000-8000-0000000fe003', 7, p_raw => 'GSK.k1.unpaid');
select public.check_in_ticket(pg_temp.ticket((select half_combo from visits), 5::smallint),
                              '00000000-0000-4000-8000-0000000fe004', 4, p_raw => 'GSK.k1.combo');
select public.check_in_ticket(pg_temp.ticket((select redo from visits), 5::smallint),
                              '00000000-0000-4000-8000-0000000fe005', 3, p_raw => 'GSK.k1.redo');
reset role;

select is((select (count(*) filter (where c.kind = 'group'), count(*) filter (where c.kind = 'participant'),
                   count(c.released_at))::text
           from public.certificates c where c.booking_id = (select listed from visits)),
  '(1,3,4)', 'the last leg issues the group certificate and one per participant, released since nobody came unpaid');
select is((select array_agg(c.recipient_name order by c.certificate_number) from public.certificates c
           where c.booking_id = (select listed from visits) and c.kind = 'participant'),
  array['Ani Murid', 'Budi Murid', 'Citra Murid'], 'participants are numbered in list order');
select is((select count(*)::int from public.certificates c
           where c.booking_id = (select listed from visits)
             and (c.certificate_number !~ '^SERT/GSK/[0-9]{4}/[0-9]{5}$' or c.verify_code !~ '^[0-9A-HJKMNP-TV-Z]{10}$')),
  0, 'every number reads SERT/GSK/YYYY/NNNNN with a ten-symbol verify code');
select is((select (c.recipient_name, c.institution_name, c.rw_ids, c.issued_by, c.template_version)::text
           from public.certificates c where c.booking_id = (select listed from visits) and c.kind = 'group'),
  ('SD Negeri Sertifikat', 'SD Negeri Sertifikat', '{5}'::smallint[], null::uuid, 1::smallint)::text,
  'the group certificate names the institution and the RWs, issued by nobody at check-in');
select is((select count(*)::int from public.certificates c
           where c.booking_id = (select long_list from visits) and c.kind = 'participant'),
  0, 'a list longer than the people who came gets no participant certificates');
select is((select (count(*), count(c.released_at))::text from public.certificates c
           where c.booking_id = (select unpaid from visits)),
  '(1,0)', 'two people above the booking hold the release back');
select is((select count(*)::int from public.certificates c where c.booking_id = (select half_combo from visits)),
  0, 'a combo with one gate still to come has none');

-- ===== Issuing again =====
select pg_temp.act_as('admin_rw_05');
select is(public.issue_certificates((select listed from visits)), 0, 'issuing again writes nothing');
select throws_ok($$select public.issue_certificates((select half_combo from visits))$$, 'P0001', null,
  'and a booking still waiting for a gate is refused');
select throws_ok($$select public.issue_certificates((select unpaid from visits), 'Sudah bayar tunai')$$, '42501', null,
  'an RW officer cannot waive the unpaid hold');
reset role;
select is((select count(*)::int from public.certificates c where c.booking_id = (select listed from visits)), 4,
  'so the booking keeps its four certificates');
select pg_temp.act_as('admin_rw_08');
select throws_ok($$select public.issue_certificates((select listed from visits))$$, '42501', null,
  'an officer of another RW issues nothing');
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select public.issue_certificates((select listed from visits))$$, '42501', null,
  'nor does a session without its authenticator');
reset role;

-- ===== The waiver =====
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.issue_certificates((select unpaid from visits), ' ')$$, '22023', null,
  'a waiver needs a reason');
select is(public.issue_certificates((select unpaid from visits), 'Dua pendamping sudah membayar tunai'), 1,
  'the superadmin waives the hold');
reset role;
select is((select (c.released_at is not null, c.release_waived_by)::text from public.certificates c
           where c.booking_id = (select unpaid from visits)),
  (true, pg_temp.persona_id('superadmin_aal2'))::text, 'which releases the certificate under their name');
select is((select a.metadata from public.audit_logs a
           where a.action = 'certificate_release_waived' and a.entity_id = (select unpaid from visits)::text),
  '{"reason": "Dua pendamping sudah membayar tunai", "unpaid_pax": 2, "certificates": 1}',
  'and is audited with its reason');
select is((select count(*)::int from public.notifications n
           where n.booking_id = (select unpaid from visits) and n.template = 'certificate_ready'),
  2, 'certificate_ready follows the release');

-- ===== Revocation (FR-POST-04) =====
create temporary table revoked on commit drop as
  select c.id from public.certificates c
  where c.booking_id = (select listed from visits) and c.recipient_name = 'Budi Murid';
grant select on revoked to authenticated;
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.revoke_certificate((select id from revoked), 'Nama salah')$$, '42501', null,
  'an RW officer cannot revoke a certificate');
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.revoke_certificate((select id from revoked), '')$$, '22023', null,
  'a revocation needs a reason');
select lives_ok($$select public.revoke_certificate((select id from revoked), 'Nama salah')$$,
  'the superadmin revokes one');
select throws_ok($$select public.revoke_certificate((select id from revoked), 'Nama salah')$$, 'P0001', null,
  'once');
select is(public.issue_certificates((select listed from visits)), 0,
  'issuing again does not bring back a certificate the superadmin revoked');
reset role;
select is((select (c.status::text, c.revoke_reason, c.revoked_at is not null)::text from public.certificates c
           where c.id = (select id from revoked)),
  ('revoked', 'Nama salah', true)::text, 'so it stays revoked with its reason');

-- ===== One group certificate, one per participant =====
select throws_ok($$update public.certificates set status = 'issued' where id = (select id from revoked)$$, '42501', null,
  'no one sets a certificate''s status around the RPCs');
select set_config('app.in_rpc', '1', true);
select throws_ok($$insert into public.certificates (booking_id, kind, certificate_number, verify_code, recipient_name,
    visit_date, rw_ids)
  select c.booking_id, 'group', 'SERT/GSK/2099/99999', 'ZZZZZZZZZZ', 'Kedua', c.visit_date, c.rw_ids
  from public.certificates c where c.booking_id = (select listed from visits) and c.kind = 'group'$$,
  '23505', null, 'a booking has one group certificate');
select set_config('app.in_rpc', '', true);

-- ===== After an undone check-in (review of PR #53, M2) =====
-- What the redo booking's certificates are: issued, and revoked with or without the undo's flag.
create function pg_temp.redo_certificates() returns text
  language sql stable
as $$
  select (count(*) filter (where c.status = 'issued'), count(*) filter (where c.status = 'revoked' and c.revoked_by_undo),
          count(*) filter (where c.status = 'revoked' and not c.revoked_by_undo))::text
  from public.certificates c where c.booking_id = (select redo from visits);
$$;
select pg_temp.act_as('superadmin_aal2');
select lives_ok($$select public.undo_check_in(pg_temp.ticket((select redo from visits), 5::smallint), 'Hitungan salah')$$,
  'the superadmin undoes the check-in of three');
reset role;
select is(pg_temp.redo_certificates(), '(0,4,0)', 'which revokes the group''s and the three participants'', flagged');
select pg_temp.act_as('admin_rw_05');
select is(public.check_in_ticket(pg_temp.ticket((select redo from visits), 5::smallint),
                                 '00000000-0000-4000-8000-0000000fe006', 2, p_raw => 'GSK.k1.redo') ->> 'result',
  'ok', 'the group is let in again, two of them');
reset role;
select is(pg_temp.redo_certificates(), '(1,3,0)',
  'the group certificate comes back, the participants'' stay revoked while three names outnumber two people');
select pg_temp.act_as('superadmin_aal2');
select lives_ok($$select public.undo_check_in(pg_temp.ticket((select redo from visits), 5::smallint), 'Hitungan salah')$$,
  'the superadmin undoes the count of two');
reset role;
select pg_temp.act_as('admin_rw_05');
select is(public.check_in_ticket(pg_temp.ticket((select redo from visits), 5::smallint),
                                 '00000000-0000-4000-8000-0000000fe007', 3, p_raw => 'GSK.k1.redo') ->> 'result',
  'ok', 'and the officer counts three');
reset role;
select is(pg_temp.redo_certificates(), '(4,0,0)', 'so every certificate comes back, the flags cleared');

create temporary table revoked_as_undo on commit drop as
  select c.id from public.certificates c
  where c.booking_id = (select listed from visits) and c.recipient_name = 'Citra Murid';
grant select on revoked_as_undo to authenticated;
select pg_temp.act_as('superadmin_aal2');
select lives_ok($$select public.revoke_certificate((select id from revoked_as_undo), 'undo_check_in')$$,
  'the superadmin revokes a certificate with the reason text undo_check_in');
select is(public.issue_certificates((select listed from visits)), 0, 'issuing again brings nothing back');
reset role;
select is((select (c.status::text, c.revoked_by_undo)::text from public.certificates c
           where c.id = (select id from revoked_as_undo)),
  '(revoked,f)', 'so it stays revoked: the reason text is no flag');
select throws_ok($$update public.certificates set revoked_by_undo = true where id = (select id from revoked)$$,
  '42501', null, 'no one sets the undo''s flag around the RPCs');
select set_config('app.in_rpc', '1', true);
select throws_ok($$update public.certificates set revoked_by_undo = true
                   where booking_id = (select redo from visits) and kind = 'group'$$,
  '23514', null, 'and only a revoked certificate carries it');
select set_config('app.in_rpc', '', true);

select * from finish();
rollback;
