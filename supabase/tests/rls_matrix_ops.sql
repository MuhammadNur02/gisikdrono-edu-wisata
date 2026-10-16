-- RLS matrix for operations: notifications, security_events, security_alerts, exports, dsr_requests, audit_logs,
-- login_attempts, rate_limit_buckets (docs/PRD.md §8.5.2, docs/Security.md AUD-02, Task P1.4.04, P1.4.05, P1.9.02).
-- Every check runs as an API role.
begin;
select plan(26);
\ir helpers/rls_personas.psql

insert into public.tour_packages (id, rw_id, category, slug, name, price_per_pax) values
  ('00000000-0000-4000-8000-00000000c501', 5, 'regular', 'p5', 'Paket RW 05', 25000),
  ('00000000-0000-4000-8000-00000000c801', 8, 'regular', 'p8', 'Paket RW 08', 25000);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, consent_version,
  consented_at)
select id::uuid, code, 'quoted', package_id::uuid, '{}', rw_ids::smallint[], 'school', 'Budi Santoso', phone,
  lower(code) || '@example.test', 4, public.today_jkt() + day_offset, public.today_jkt() + day_offset, 100000, 100000,
  'v1', now()
from (values
  ('00000000-0000-4000-8000-0000b5000001', 'GSK-N5000001', '00000000-0000-4000-8000-00000000c501', '{5}', '+6281200005501', 0),
  ('00000000-0000-4000-8000-0000b5000008', 'GSK-N5000008', '00000000-0000-4000-8000-00000000c501', '{5}', '+6281200005508', -8),
  ('00000000-0000-4000-8000-0000b8000001', 'GSK-N8000001', '00000000-0000-4000-8000-00000000c801', '{8}', '+6281200008501', 0)
) as fixture(id, code, package_id, rw_ids, phone, day_offset);
insert into public.notifications (booking_id, channel, template, recipient, recipient_name, params, dedupe_key)
select b.id, 'email', 'booking_created', b.pic_email, 'Budi', '{"link_scope": "view"}', 'rls:' || b.booking_code
from public.bookings b where b.booking_code like 'GSK-N%';
insert into public.notifications (channel, template, recipient, params, dedupe_key)
values ('email', 'security_alert', 'alerts@example.test', '{"severity": "high"}', 'rls:alert');
insert into public.security_events (event_type, severity) values ('rate_limited', 'info');
insert into public.security_alerts (id, rule, severity, fingerprint, title)
values ('00000000-0000-4000-8000-0000af000001', 'rls_test', 'high', 'rls:alert:1', 'Uji RLS');
insert into public.exports (kind, format, requested_by, rw_id, watermark, expires_at) values
  ('attendance', 'csv', '00000000-0000-4000-8000-00000000f005', 5, 'Diekspor oleh Admin RLS 05', now() + interval '1 day'),
  ('finance', 'xlsx', '00000000-0000-4000-8000-00000000f001', null, 'Diekspor oleh Super RLS', now() + interval '1 day');
insert into public.dsr_requests (id, request_type, email, due_at)
values ('00000000-0000-4000-8000-0000af000002', 'access', 'subjek@example.test', now() + interval '14 days');
insert into public.login_attempts (user_id, success, reason)
values ('00000000-0000-4000-8000-00000000f005', false, 'bad_password');
insert into public.rate_limit_buckets (key, window_start, count) values ('rls:test', now(), 1);

-- ===== anon =====
select pg_temp.act_as('anon');
select throws_ok($$select id from public.notifications$$, '42501', null, 'anon reads no outbox row');
select throws_ok($$select id from public.security_events$$, '42501', null, 'no security event');
select throws_ok($$select id from public.audit_logs$$, '42501', null, 'no audit row');
select throws_ok($$select id from public.exports$$, '42501', null, 'no export');
select throws_ok($$select id from public.dsr_requests$$, '42501', null, 'no data-subject request');
select throws_ok($$select id from public.login_attempts$$, '42501', null, 'no login attempt');
select throws_ok($$select key from public.rate_limit_buckets$$, '42501', null, 'and no rate-limit bucket');

-- ===== a signed-in user without a role =====
reset role;
select pg_temp.act_as('none');
select is(
  (select count(*)::int from public.notifications) + (select count(*)::int from public.security_events)
  + (select count(*)::int from public.audit_logs) + (select count(*)::int from public.exports),
  0,
  'a user without a role sees no operational row'
);

-- ===== admin_rw 05 =====
reset role;
select pg_temp.act_as('admin_rw_05');
select is((select string_agg(dedupe_key, ',') from public.notifications), 'rls:GSK-N5000001',
  'an RW admin sees the outbox rows of the bookings they see');
select is((select status::text || '/' || template::text from public.notifications), 'queued/booking_created',
  'whether the message went out');
select throws_ok($$select recipient from public.notifications$$, '42501', null, 'never to whom');
select throws_ok($$select recipient_name, params from public.notifications$$, '42501', null, 'nor the greeting and params');
select throws_ok($$select last_error from public.notifications$$, '42501', null, 'nor the provider''s error text');
select is(
  (select count(*)::int from public.security_events) + (select count(*)::int from public.security_alerts)
  + (select count(*)::int from public.audit_logs) + (select count(*)::int from public.dsr_requests)
  + (select count(*)::int from public.login_attempts),
  0,
  'security events, alerts, the audit log, data-subject requests and login attempts are the superadmin''s (AUD-02)'
);
select is((select string_agg(kind::text, ',') from public.exports), 'attendance', 'sees their own export only');
select throws_ok($$select key from public.rate_limit_buckets$$, '42501', null, 'and no rate-limit bucket');

-- ===== admin_rw 05 without AAL2 =====
reset role;
select pg_temp.act_as('admin_rw_05_aal1');
select is((select count(*)::int from public.exports), 0, 'without AAL2 an RW admin sees not even their own export');

-- ===== superadmin at AAL1 =====
reset role;
select pg_temp.act_as('superadmin_aal1');
select is(
  (select count(*)::int from public.audit_logs) + (select count(*)::int from public.security_events)
  + (select count(*)::int from public.security_alerts) + (select count(*)::int from public.exports)
  + (select count(*)::int from public.dsr_requests) + (select count(*)::int from public.login_attempts),
  0,
  'a superadmin without AAL2 sees no audit row, event, alert, export, request or login attempt'
);

-- ===== superadmin at AAL2 =====
reset role;
select pg_temp.act_as('superadmin_aal2');
select is((select count(*)::int from public.notifications where dedupe_key like 'rls:%'), 4,
  'the superadmin sees every outbox row, the staff alert included');
select throws_ok($$select recipient from public.notifications$$, '42501', null, 'but no recipient either');
select ok((select count(*) from public.audit_logs) > 0, 'reads the audit log');
select is((select count(*)::int from public.login_attempts where user_id = '00000000-0000-4000-8000-00000000f005'), 1,
  'and the login attempts behind a lockout');
select is((select count(*)::int from public.exports), 2, 'every export');
select is(pg_temp.row_count($$update public.security_alerts set acknowledged_at = now(),
  acknowledged_by = '00000000-0000-4000-8000-00000000f001' where id = '00000000-0000-4000-8000-0000af000001'$$), 1,
  'acknowledges an alert in their own name');
select throws_ok($$update public.security_alerts set acknowledged_by = '00000000-0000-4000-8000-00000000f005'
  where id = '00000000-0000-4000-8000-0000af000001'$$, '42501', null, 'never in someone else''s');
select is(pg_temp.row_count($$update public.dsr_requests set status = 'in_progress', handled_at = now(),
  handled_by = '00000000-0000-4000-8000-00000000f001' where id = '00000000-0000-4000-8000-0000af000002'$$), 1,
  'and takes on a data-subject request');

select * from finish();
rollback;
