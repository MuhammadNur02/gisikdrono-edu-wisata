-- Retention (Task P1.9.06; docs/Security.md DATA-02, §7.3): each retention function removes or blanks exactly the
-- backdated rows past their window, keeps the rows just inside it, and leaves a purge_run row with its counts. The
-- storage policies of this task are in rls_storage.sql, and the full cron schedule in schema_cron.sql.
begin;
select plan(25);

-- ===== The schedule =====
select is(
  array(select jobname || ' ' || schedule || ' ' || command from cron.job
        where jobname in ('purge/retention', 'purge-storage', 'prune_operational_tables') order by jobname),
  array['prune_operational_tables 0 18 1 * * select internal.run_scheduled_job(''prune_operational_tables'')',
        'purge-storage 15 * * * * select internal.call_job(''purge-storage'')',
        'purge/retention 0 19 * * * select internal.run_scheduled_job(''purge/retention'')'],
  'the retention run is nightly at 02:00 WIB, the file purge hourly, the operational prune monthly'
);

-- ===== Fixtures =====
insert into auth.users (id, email) values ('00000000-0000-4000-9000-000000000699', 'retensi@example.test');
insert into public.profiles (id, email, full_name) values ('00000000-0000-4000-9000-000000000699', 'retensi@example.test', 'Petugas Uji');
insert into public.site_settings (key, value) values ('pii_retention_months', '24')
on conflict (key) do update set value = excluded.value;
insert into public.tour_packages (id, rw_id, category, slug, name, tagline, duration_minutes, price_per_pax, status)
values ('00000000-0000-4000-9000-000000000601', 5, 'student', 'uji-retensi-paket', 'Paket Uji Retensi', 'Uji', 120,
        25000, 'published');
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, amount_paid,
  consent_version, consented_at, paid_at, expired_at, cancelled_at, notes)
select ('00000000-0000-4000-9000-0000000006' || code)::uuid, 'GSK-RETN00' || code, status::public.booking_status,
       '00000000-0000-4000-9000-000000000601', '{}', '{5}', 'school', 'Kepala Sekolah ' || code, '+62812345606' || code,
       'kepala' || code || '@example.test', 4, visit, visit, 100000, 100000,
       case when paid then 100000 else 0 end, 'v1', now(), case when paid then visit - 7 end,
       case when status = 'expired' then lapsed end, case when status = 'cancelled' then lapsed end,
       'Mohon kursi roda untuk Bu Ani'
from (values
  ('11', 'completed', public.today_jkt() - 91, true, null::timestamptz),
  ('12', 'completed', public.today_jkt() - 89, true, null),
  ('13', 'expired', public.today_jkt() + 20, false, now() - interval '8 days'),
  ('14', 'expired', public.today_jkt() + 20, false, now() - interval '6 days'),
  ('15', 'cancelled', public.today_jkt() + 20, false, now() - interval '8 days'),
  ('16', 'completed', (public.today_jkt() - interval '25 months')::date, true, null),
  ('17', 'completed', (public.today_jkt() - interval '23 months')::date, true, null)
) as fixture(code, status, visit, paid, lapsed);
select set_config('app.in_rpc', '', true);
insert into public.booking_participants (id, booking_id, seq_no, full_name, role_label)
select ('00000000-0000-4000-9000-00000006a1' || code)::uuid, ('00000000-0000-4000-9000-0000000006' || code)::uuid, 1,
       'Peserta ' || code, 'student'
from unnest(array['11', '12', '13', '14']) as code;
insert into public.certificates (id, booking_id, participant_id, kind, certificate_number, verify_code, recipient_name,
  visit_date, rw_ids)
values ('00000000-0000-4000-9000-0000000006c1', '00000000-0000-4000-9000-000000000611',
        '00000000-0000-4000-9000-00000006a111', 'participant', 'SERT/GSK/2031/00611', 'RETN0C0611', 'Peserta 11',
        public.today_jkt() - 91, '{5}');
insert into public.exports (id, kind, format, requested_by, watermark, expires_at) values
  ('00000000-0000-4000-9000-0000000006e1', 'attendance', 'xlsx', '00000000-0000-4000-9000-000000000699', 'uji',
   now() - interval '1 hour'),
  ('00000000-0000-4000-9000-0000000006e2', 'attendance', 'xlsx', '00000000-0000-4000-9000-000000000699', 'uji',
   now() + interval '1 hour');
select internal.enqueue_notification('00000000-0000-4000-9000-000000000613', 'booking_expired', 'email', '{}');
insert into public.guest_otps (id, purpose, phone, code_hash, expires_at) values
  ('00000000-0000-4000-9000-0000000006f1', 'booking_phone', '+6281234560601', 'uji-lama', now() - interval '2 days'),
  ('00000000-0000-4000-9000-0000000006f2', 'booking_phone', '+6281234560602', 'uji-baru', now() - interval '12 hours');

-- ===== purge_participants =====
select internal.purge_participants();
select set_config('app.purge', '', true), set_config('app.audit_mode', '', true), set_config('app.in_rpc', '', true),
  set_config('app.actor_role', '', true);
select is(
  (select string_agg(right(booking_id::text, 2), ' ' order by booking_id) from public.booking_participants
   where booking_id in ('00000000-0000-4000-9000-000000000611', '00000000-0000-4000-9000-000000000612')),
  '12',
  'participant names go 91 days after the visit and stay at 89'
);
select is(
  (select jsonb_build_object('participant', participant_id, 'name', recipient_name, 'purged', purged_at is not null)
   from public.certificates where id = '00000000-0000-4000-9000-0000000006c1'),
  '{"participant": null, "name": "[dihapus]", "purged": true}'::jsonb,
  'their certificate keeps its number, loses the name and is marked for purge-storage'
);
select is(
  (select string_agg(right(id::text, 2) || '=' || (deleted_at is not null), ' ' order by id) from public.exports
   where id in ('00000000-0000-4000-9000-0000000006e1', '00000000-0000-4000-9000-0000000006e2')),
  'e1=true e2=false',
  'an expired export is marked for purge-storage, a live one is not'
);
select ok(
  (select (metadata ->> 'participants_deleted')::int >= 1 and metadata ? 'certificates_marked' and metadata ? 'exports_marked'
   from public.audit_logs where action = 'purge_run' and metadata ->> 'job' = 'purge_participants'
   order by id desc limit 1),
  'the run leaves a purge_run row with its counts'
);

-- ===== anonymise_booker_pii =====
select internal.anonymise_booker_pii();
select set_config('app.purge', '', true), set_config('app.audit_mode', '', true), set_config('app.in_rpc', '', true),
  set_config('app.actor_role', '', true);
select is(
  (select string_agg(right(booking_code, 2) || '=' || pic_name, ' ' order by booking_code) from public.bookings
   where id::text like '00000000-0000-4000-9000-0000000006__' and pic_name = 'anon'),
  '13=anon 15=anon 16=anon',
  'an unpaid booking expired or cancelled 8 days ago and a booking visited 25 months ago lose their booker'
);
select is(
  (select string_agg(right(booking_code, 2), ' ' order by booking_code) from public.bookings
   where id in ('00000000-0000-4000-9000-000000000614', '00000000-0000-4000-9000-000000000617')
     and pic_phone is not null and pii_purged_at is null),
  '14 17',
  'while one expired 6 days ago and one visited 23 months ago keep theirs'
);
select is(
  (select bool_and(pic_phone is null and pic_email is null and notes is null and token_version = 2
                   and pii_purged_at is not null)
   from public.bookings where id in ('00000000-0000-4000-9000-000000000613', '00000000-0000-4000-9000-000000000615',
                                     '00000000-0000-4000-9000-000000000616')),
  true,
  'the contact and free text go, the purge is stamped and every guest link stops working'
);
select is(
  (select count(*)::int from public.booking_participants where booking_id = '00000000-0000-4000-9000-000000000613')
  + (select count(*)::int from public.notifications where booking_id = '00000000-0000-4000-9000-000000000613'),
  0,
  'an anonymised unpaid booking loses its participants and queued messages too'
);
select is(
  (select count(*)::int from public.booking_participants where booking_id = '00000000-0000-4000-9000-000000000614'),
  1,
  'one still inside its week keeps them'
);
select is(
  (select string_agg(code_hash, ' ' order by code_hash) from public.guest_otps
   where id in ('00000000-0000-4000-9000-0000000006f1', '00000000-0000-4000-9000-0000000006f2')),
  'uji-baru',
  'an OTP row goes a day after it expired, not before'
);
select is(
  (select count(*)::int from public.audit_logs
   where action = 'bookings.update' and entity_id = '00000000-0000-4000-9000-000000000616'
     and (before is not null or after is not null or not (metadata -> 'changed_columns' ? 'pic_phone'))),
  0,
  'the anonymisation is audited by column name only'
);
select ok(
  (select (metadata ->> 'bookings_anonymised')::int >= 3 and metadata ? 'participants_deleted' and metadata ? 'otps_deleted'
   from public.audit_logs where action = 'purge_run' and metadata ->> 'job' = 'anonymise_booker_pii'
   order by id desc limit 1),
  'the run leaves a purge_run row with its counts'
);
select is(
  coalesce(current_setting('app.purge', true), '') || coalesce(current_setting('app.audit_mode', true), ''),
  '',
  'and puts the purge switch and the audit mode back when it is done'
);

-- ===== prune_operational_tables =====
-- The backdated audit row goes in first, so every audit row written after it is newer than it.
insert into public.audit_logs (occurred_at, actor_role, action, entity_type) values
  (now() - interval '25 months', 'cron', 'test.retention_old', 'test');
create temp table old_audit_row as select id, entry_hash from public.audit_logs where action = 'test.retention_old';
insert into public.notifications (channel, template, recipient, params, dedupe_key, created_at) values
  ('email', 'security_alert', 'alerts@example.test', '{"severity": "high"}', 'retensi:181-hari', now() - interval '181 days'),
  ('email', 'security_alert', 'alerts@example.test', '{"severity": "high"}', 'retensi:31-hari', now() - interval '31 days'),
  ('email', 'security_alert', 'alerts@example.test', '{"severity": "high"}', 'retensi:1-hari', now() - interval '1 day');
insert into public.webhook_rejections (provider, reason, received_at) values
  ('midtrans', 'signature_invalid', now() - interval '31 days'), ('midtrans', 'content_type', now() - interval '29 days');
insert into public.payment_events (order_id, source, event_hash, payload, received_at) values
  ('GSK-RETN0016-01', 'webhook', 'retensi-25-bulan', '{}', now() - interval '25 months'),
  ('GSK-RETN0017-01', 'webhook', 'retensi-23-bulan', '{}', now() - interval '23 months');
insert into public.security_events (event_type, entity_id, occurred_at) values
  ('rate_limited', 'retensi-13-bulan', now() - interval '13 months'),
  ('rate_limited', 'retensi-11-bulan', now() - interval '11 months');
insert into public.login_attempts (success, reason, attempted_at) values
  (false, 'bad_password', now() - interval '25 hours'), (false, 'locked', now() - interval '23 hours');
insert into public.rate_limit_buckets (key, window_start, count) values
  ('retensi:lama', now() - interval '25 hours', 3), ('retensi:baru', now() - interval '23 hours', 3);
insert into public.ticket_scans (attempt_id, rw_id, scanned_by, phase, result, ip, scanned_at) values
  ('00000000-0000-4000-9000-0000000006d1', 5, '00000000-0000-4000-9000-000000000699', 'validate', 'not_found', '10.0.0.9',
   now() - interval '25 months'),
  ('00000000-0000-4000-9000-0000000006d2', 5, '00000000-0000-4000-9000-000000000699', 'validate', 'not_found', '10.0.0.9',
   now() - interval '23 months');
select internal.log_audit('test.retention_recent', 'test', null, '{}');

select is((internal.verify_audit_chain() ->> 'ok')::boolean, true, 'the audit chain verifies before the prune');
select internal.prune_operational_tables();
select set_config('app.purge', '', true), set_config('app.audit_mode', '', true), set_config('app.in_rpc', '', true),
  set_config('app.actor_role', '', true);
select is(
  (select string_agg(dedupe_key || '=' || params::text, ' ' order by dedupe_key) from public.notifications
   where dedupe_key like 'retensi:%'),
  'retensi:1-hari={"severity": "high"} retensi:31-hari={}',
  'a message goes after 180 days and loses its params after 30'
);
select is(
  (select string_agg(reason, ' ' order by reason) from public.webhook_rejections
   where received_at between now() - interval '32 days' and now() - interval '28 days'),
  'content_type',
  'a rejection goes after 30 days'
);
select is(
  (select string_agg(event_hash, ' ') from public.payment_events where event_hash like 'retensi-%'),
  'retensi-23-bulan',
  'a payment event goes after 24 months'
);
select is(
  (select string_agg(entity_id, ' ') from public.security_events where entity_id like 'retensi-%'),
  'retensi-11-bulan',
  'a security event after 12 months'
);
select is(
  (select string_agg(reason, ' ') from public.login_attempts
   where attempted_at between now() - interval '26 hours' and now() - interval '22 hours'),
  'locked',
  'a login attempt after 24 hours'
);
select is(
  (select string_agg(key, ' ') from public.rate_limit_buckets where key like 'retensi:%'),
  'retensi:baru',
  'a rate-limit window after a day'
);
select is(
  (select string_agg(right(attempt_id::text, 2), ' ') from public.ticket_scans
   where attempt_id in ('00000000-0000-4000-9000-0000000006d1', '00000000-0000-4000-9000-0000000006d2')),
  'd2',
  'and a scan, with the officer''s IP, after 24 months'
);
select is(
  (select count(*)::int from public.audit_logs where id <= (select id from old_audit_row))
  || '/' || (select count(*)::int from public.audit_logs where action = 'test.retention_recent'),
  '0/1',
  'with an intact chain, audit rows up to the last one older than 24 months are pruned and the newer ones stay'
);
select is(
  (select jsonb_build_object('id', (metadata ->> 'audit_anchor_id')::bigint, 'hash', metadata ->> 'audit_anchor_hash')
   from public.audit_logs where action = 'purge_run' and metadata ->> 'job' = 'prune_operational_tables'
   order by id desc limit 1),
  (select jsonb_build_object('id', id, 'hash', entry_hash) from old_audit_row),
  'the purge_run row keeps the last pruned row''s hash as the new anchor'
);
select is((internal.verify_audit_chain() ->> 'ok')::boolean, true, 'and what remains still verifies');

select * from finish();
rollback;
