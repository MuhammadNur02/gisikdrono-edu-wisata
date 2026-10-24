-- Task P4.6.01 and P4.2.01 (docs/Security.md §7.5; DATA-06, AUD-04, REC-07, AZ-13): rpc_create_export lets the
-- superadmin at AAL2 export every kind and an RW admin only their own RW's attendance, within 12 months, 10 an hour,
-- never a contact column, and leaves an exports row with its watermark and 24-hour expiry, an export_downloaded event
-- and an audit row; visit_stats and revenue_recap count every period, an RW admin forced to their own RW, a visit
-- two months old included; verify_audit_chain is the superadmin's, a few times an hour.
begin;
select plan(32);
\ir helpers/rls_personas.psql
select set_config('app.qr_key_id', 'k1', true);

-- ===== Fixtures: paid bookings of RW 05 and RW 13, one of RW 05 two months ago =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000b1005', 5, 'regular', 'uji-ekspor-05', 'Paket Uji Ekspor 05', 'per_pax', 25000,
   'published'),
  ('00000000-0000-4000-8000-0000000b1013', 13, 'regular', 'uji-ekspor-13', 'Paket Uji Ekspor 13', 'per_pax', 25000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000b2051', 5, public.today_jkt() + 11, '07:53', '08:53', 'Uji ekspor 05', 200),
  ('00000000-0000-4000-8000-0000000b2052', 5, public.today_jkt() + 12, '07:53', '08:53', 'Uji ekspor 05 lalu', 200),
  ('00000000-0000-4000-8000-0000000b2131', 13, public.today_jkt() + 11, '07:53', '08:53', 'Uji ekspor 13', 200);

create function pg_temp.paid(p_package uuid, p_session uuid, p_rw smallint, p_pax integer, p_phone text) returns uuid
  language plpgsql
as $$
declare
  otp_id uuid;
  held uuid;
  attempt jsonb;
  answer jsonb;
begin
  insert into public.guest_otps (purpose, phone, code_hash, browser_hash, expires_at, verified_at, created_at)
  values ('booking_phone', p_phone, repeat('a', 64), repeat('b', 64), now() + interval '5 minutes',
          now() - interval '1 minute', now() - interval '2 minutes')
  returning id into otp_id;
  held := (internal.create_booking(p_package, array[p_session], p_pax,
    jsonb_build_object('booker_type', 'school', 'institution_name', 'SD Negeri Ekspor', 'pic_name', 'Ani Ekspor',
                       'pic_phone', p_phone, 'pic_email', 'ekspor' || right(p_phone, 4) || '@contoh.test',
                       'notes', null),
    '[]', '[]', 'pay', 'web', null, otp_id, '{"version": "2026-10-18"}', null, '{"ip": null, "user_agent": "pgTAP"}',
    internal.booking_quote_hash(internal.booking_quote(p_package, p_pax, '[]', array[p_rw]))) ->> 'booking_id')::uuid;
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
  return held;
end;
$$;

create temporary table fixture on commit drop as select
  pg_temp.paid('00000000-0000-4000-8000-0000000b1005', '00000000-0000-4000-8000-0000000b2051', 5::smallint, 4,
               '+6281300007001') as rw05,
  pg_temp.paid('00000000-0000-4000-8000-0000000b1005', '00000000-0000-4000-8000-0000000b2052', 5::smallint, 6,
               '+6281300007002') as rw05_past,
  pg_temp.paid('00000000-0000-4000-8000-0000000b1013', '00000000-0000-4000-8000-0000000b2131', 13::smallint, 9,
               '+6281300007003') as rw13;
-- The second RW 05 visit took place two months ago: beyond the bookings window an RW admin reads rows through.
-- No booking is ever made for a past session, and a session with bookings keeps its date, so the guard steps aside
-- inside this transaction only.
alter table public.visit_sessions disable trigger visit_sessions_guard;
update public.visit_sessions set session_date = public.today_jkt() - 60
where id = '00000000-0000-4000-8000-0000000b2052';
alter table public.visit_sessions enable trigger visit_sessions_guard;
update public.bookings set visit_date = public.today_jkt() - 60, visit_date_end = public.today_jkt() - 60
where id = (select rw05_past from fixture);

-- The whole fixture period, and the filters of an export over it.
create function pg_temp.period() returns jsonb
  language sql stable
as $$ select jsonb_build_object('from', public.today_jkt() - 61, 'to', public.today_jkt() + 13); $$;
create function pg_temp.stats(p_rw smallint) returns jsonb
  language sql
as $$ select public.visit_stats(public.today_jkt() - 61, public.today_jkt() + 13, p_rw, 'month'); $$;
create function pg_temp.sum_of(p_stats jsonb, p_field text) returns integer
  language sql immutable
as $$ select coalesce(sum((b ->> p_field)::integer), 0)::integer from jsonb_array_elements(p_stats) as b; $$;
create temporary table answers (name text primary key, answer jsonb) on commit drop;
grant insert, select on answers to authenticated;
grant execute on function pg_temp.period(), pg_temp.stats(smallint), pg_temp.sum_of(jsonb, text) to authenticated;
create function pg_temp.answer(p_name text) returns jsonb
  language sql stable
as $$ select answer from answers where name = p_name; $$;

-- ===== rpc_create_export =====
select pg_temp.act_as('superadmin_aal2');
insert into answers values ('visits', public.rpc_create_export('visits', 'xlsx', pg_temp.period(),
  'Rekap kunjungan bulanan untuk laporan kelurahan'));
reset role;
select ok((pg_temp.answer('visits') ->> 'row_count')::int >= 3
          and jsonb_array_length(pg_temp.answer('visits') -> 'rows') = (pg_temp.answer('visits') ->> 'row_count')::int,
  'the superadmin exports the visits of the period with their row count');
select ok(not exists (select 1 from jsonb_array_elements(pg_temp.answer('visits') -> 'rows') as r
                      where r ?| array['pic_name', 'pic_phone', 'pic_email', 'notes']),
  'without a contact column');
select is((select (e.kind::text, e.format, e.requested_by, e.rw_id, e.row_count, e.reason,
                   e.expires_at = now() + interval '24 hours', e.watermark like 'Diekspor oleh Super RLS %')::text
           from public.exports e where e.id = (pg_temp.answer('visits') ->> 'export_id')::uuid),
  ('visits', 'xlsx', pg_temp.persona_id('superadmin_aal2'), null::smallint,
   (pg_temp.answer('visits') ->> 'row_count')::int, 'Rekap kunjungan bulanan untuk laporan kelurahan', true,
   true)::text,
  'the exports row keeps who, what, why and how many, expiring in 24 hours under a watermark');
select is((select count(*)::int from public.security_events e
           where e.event_type = 'export_downloaded' and e.entity_id = pg_temp.answer('visits') ->> 'export_id'),
  1, 'an export_downloaded event names it');
select is((select a.metadata ->> 'rows' from public.audit_logs a
           where a.action = 'export.visits' and a.entity_id = pg_temp.answer('visits') ->> 'export_id'),
  pg_temp.answer('visits') ->> 'row_count', 'and the audit trail holds it with its row count (AUD-04)');

select pg_temp.act_as('superadmin_aal2');
insert into answers values ('finance', public.rpc_create_export('finance', 'csv', pg_temp.period(),
  'Rekonsiliasi buku besar bulan ini'));
insert into answers values ('audit', public.rpc_create_export('audit', 'csv', pg_temp.period(),
  'Pemeriksaan jejak audit triwulan'));
reset role;
select ok((pg_temp.answer('finance') ->> 'row_count')::int >= 3
          and (pg_temp.answer('finance') -> 'rows' -> 0) ?& array['booking_code', 'entry_type', 'beneficiary_key',
                                                                   'amount'],
  'the finance export holds the ledger entries of the period');
select ok(exists (select 1 from jsonb_array_elements(pg_temp.answer('audit') -> 'rows') as r
                  where r ->> 'source' = 'security_events')
          and not exists (select 1 from jsonb_array_elements(pg_temp.answer('audit') -> 'rows') as r
                          where r ?| array['actor_ip', 'ip_hash', 'user_agent', 'request_id']),
  'the audit export holds the logs and the events, without an IP or request id');

select pg_temp.act_as('admin_rw_05');
insert into answers values ('attendance', public.rpc_create_export('attendance', 'csv',
  pg_temp.period() || '{"rw_id": 13}', 'Daftar hadir RW 05 untuk rapat pengurus'));
select throws_ok($$select public.rpc_create_export('visits', 'csv', pg_temp.period(), 'Rekap kunjungan bulanan')$$,
  '42501', null, 'an RW admin exports no visits');
select throws_ok($$select public.rpc_create_export('finance', 'csv', pg_temp.period(), 'Rekap keuangan bulanan')$$,
  '42501', null, 'nor the finance ledger');
reset role;
select ok((select bool_and((r ->> 'rw_id')::int = 5) from jsonb_array_elements(pg_temp.answer('attendance') -> 'rows') as r)
          and (pg_temp.answer('attendance') ->> 'row_count')::int >= 2,
  'an RW admin asking for RW 13 gets their own RW''s attendance, the visit two months ago included');
select ok((pg_temp.answer('attendance') -> 'rows' -> 0) ?& array['booked_pax', 'checked_in_pax', 'manual_checkin']
          and not ((pg_temp.answer('attendance') -> 'rows' -> 0) ? 'total_amount'),
  'booked and admitted people with the manual flag, and no money');
select is((select e.rw_id from public.exports e where e.id = (pg_temp.answer('attendance') ->> 'export_id')::uuid),
  5::smallint, 'and the exports row names their RW');

select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select public.rpc_create_export('visits', 'csv', pg_temp.period(), 'Rekap kunjungan bulanan')$$,
  '42501', null, 'a session without its authenticator exports nothing');
reset role;
select pg_temp.act_as('none');
select throws_ok($$select public.rpc_create_export('attendance', 'csv', pg_temp.period(), 'Rekap kunjungan bulanan')$$,
  '42501', null, 'nor does an account without a role');
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.rpc_create_export('audit', 'xlsx', pg_temp.period(), 'Pemeriksaan jejak audit')$$,
  '22023', null, 'the audit export is CSV only');
select throws_ok($$select public.rpc_create_export('visits', 'csv', pg_temp.period(), 'Rekap')$$,
  '22023', null, 'an export needs a purpose of 10 characters or more');
select throws_ok($$select public.rpc_create_export('visits', 'csv',
                    '{"from": "2026-01-01", "to": "2027-01-01"}', 'Rekap kunjungan tahunan')$$,
  '22023', null, 'and a period of at most 12 months');
select throws_ok($$select public.rpc_create_export('visits', 'csv', pg_temp.period() || '{"status": "paid"}',
                    'Rekap kunjungan bulanan')$$,
  '22023', null, 'and no filter but from, to and rw_id');
reset role;
-- The superadmin has made three exports this hour; seven more reach the cap of ten.
select count(*) from generate_series(1, 7)
where internal.rate_limit_hit('export:user:' || pg_temp.persona_id('superadmin_aal2'), 10, 3600);
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.rpc_create_export('visits', 'csv', pg_temp.period(), 'Rekap kunjungan bulanan')$$,
  'P0001', null, 'the eleventh export of the hour is refused (RATE_LIMITED)');
reset role;

-- ===== visit_stats =====
select pg_temp.act_as('admin_rw_05');
insert into answers values ('stats_05', pg_temp.stats(13::smallint));
reset role;
select ok((select (b ->> 'bookings')::int >= 1 and (b ->> 'pax_booked')::int >= 6
           from jsonb_array_elements(pg_temp.answer('stats_05')) as b
           where (b ->> 'bucket')::date = date_trunc('month', public.today_jkt() - 60)::date),
  'an RW admin counts the visit two months ago, beyond the window rows are read through');
select ok(not exists (select 1 from jsonb_array_elements(pg_temp.answer('stats_05')) as b
                      where b ->> 'gross_amount' is not null),
  'and sees no booking total');
select pg_temp.act_as('superadmin_aal2');
insert into answers values ('stats_all', pg_temp.stats(null));
insert into answers values ('stats_13', pg_temp.stats(13::smallint));
insert into answers values ('stats_super_05', pg_temp.stats(5::smallint));
reset role;
select is(jsonb_path_query_array(pg_temp.answer('stats_05'), '$[*].bookings'),
  jsonb_path_query_array(pg_temp.answer('stats_super_05'), '$[*].bookings'),
  'an RW admin asking for RW 13 gets RW 05''s counts, the same the superadmin reads for RW 05');
select ok(pg_temp.sum_of(pg_temp.answer('stats_all'), 'bookings') >= 3
          and pg_temp.sum_of(pg_temp.answer('stats_13'), 'gross_amount') >= 225000,
  'the superadmin counts every RW, or the one asked for, with the booking totals');
select is(jsonb_array_length(pg_temp.answer('stats_all')),
  (select count(*)::int from generate_series(date_trunc('month', public.today_jkt() - 61),
                                             public.today_jkt() + 13, interval '1 month')),
  'one bucket per month of the period, the empty ones included');
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.visit_stats(public.today_jkt(), public.today_jkt(), null, 'year')$$, '22023', null,
  'figures are counted per day, week or month');
select throws_ok($$select public.visit_stats(public.today_jkt() - 400, public.today_jkt(), null, 'month')$$, '22023',
  null, 'over at most 12 months');
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select public.visit_stats(public.today_jkt(), public.today_jkt())$$, '42501', null,
  'a session without its authenticator reads no figures');
reset role;

-- ===== revenue_recap =====
select pg_temp.act_as('admin_rw_05');
insert into answers values ('recap_05', public.revenue_recap(public.today_jkt() - 1, public.today_jkt() + 1, 13::smallint));
reset role;
select ok(jsonb_array_length(pg_temp.answer('recap_05') -> 'daily') >= 1
          and not exists (select 1 from jsonb_array_elements(pg_temp.answer('recap_05') -> 'daily') as d
                          where (d ->> 'rw_id')::int is distinct from 5)
          and not exists (select 1 from jsonb_array_elements(pg_temp.answer('recap_05') -> 'outstanding') as d
                          where (d ->> 'rw_id')::int is distinct from 5),
  'an RW admin asking for RW 13 reads only their own RW''s treasury and vendors');
select ok(pg_temp.answer('recap_05') ?& array['daily', 'by_beneficiary', 'outstanding'],
  'per day, per beneficiary and what is still owed');

-- ===== verify_audit_chain =====
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select public.verify_audit_chain()$$, '42501', null, 'an RW admin checks no chain');
reset role;
select pg_temp.act_as('superadmin_aal2');
select ok(public.verify_audit_chain() ?& array['audit', 'ledger'], 'the superadmin reads both chains'' state');
reset role;
select count(*) from generate_series(1, 5)
where internal.rate_limit_hit('audit_chain:user:' || pg_temp.persona_id('superadmin_aal2'), 6, 3600);
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.verify_audit_chain()$$, 'P0001', null, 'six times an hour at most');
reset role;

select * from finish();
rollback;
