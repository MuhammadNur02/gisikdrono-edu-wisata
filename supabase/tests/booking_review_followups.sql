-- Follow-ups of the review of PR #106 (20261105130000_hold_margin.sql, 20261105130100_review_anomalies.sql,
-- 20261105130200_visit_reminder_per_day.sql): a web hold's hour before the first session is one helper that a new and
-- an extended hold both read; a paid booking left under review without seats raises booking_review_unresolved after a
-- day, and no longer paid_without_tickets; the D-1 reminder goes only to a seat held tomorrow, once per visit day.
begin;
select plan(20);
\ir helpers/rls_personas.psql

-- ===== Fixtures =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000b1001', 5, 'regular', 'uji-tinjau-lanjut', 'Paket Tinjau Lanjut', 'per_pax', 30000,
   'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000b1101', 5, public.today_jkt(), '07:23', '08:23', 'Tinjau hari ini', 20),
  ('00000000-0000-4000-8000-0000000b1102', 8, public.today_jkt() + 1, '07:29', '08:29', 'Tinjau besok RW 08', 20),
  ('00000000-0000-4000-8000-0000000b1103', 5, public.today_jkt() + 1, '07:31', '08:31', 'Tinjau besok RW 05', 20),
  ('00000000-0000-4000-8000-0000000b1104', 5, public.today_jkt() + 5, '07:37', '08:37', 'Tinjau nanti', 20);

create function pg_temp.switch(p_key text, p_on boolean) returns void
  language sql
as $$ update public.site_settings set value = to_jsonb(p_on) where key = p_key; $$;
select pg_temp.switch('email_enabled', true), pg_temp.switch('whatsapp_enabled', true);

create function pg_temp.alerted(p_rule text, p_subject text) returns integer
  language sql stable
as $$
  select count(*)::int from public.security_alerts a
  where a.fingerprint = p_rule || ':' || p_subject and a.acknowledged_at is null;
$$;

select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, channel, package_id, package_snapshot, rw_ids, booker_type,
  pic_name, pic_phone, pic_email, phone_verified_at, pax_count, visit_date, visit_date_end, subtotal_package,
  total_amount, amount_paid, consent_version, consented_at, expires_at, paid_at, needs_review, review_reason,
  checked_in_at)
select ('00000000-0000-4000-8000-0000000b1' || code)::uuid, booking_code, status::public.booking_status, 'web',
  '00000000-0000-4000-8000-0000000b1001', '{}', rw_ids::smallint[], 'school', 'Bu Tinjau', '+62813000071' || code,
  'tinjau-' || code || '@example.test', now(), 2, visit, visit_end, 60000, 60000,
  case when status = 'pending_payment' then 0 else 60000 end, 'v1', now(),
  case when status = 'pending_payment' then now() + interval '1 hour' end,
  case when status = 'pending_payment' then null else now() - paid_ago end, review, review_reason,
  case when status = 'checked_in' then now() end
from (values
  ('201', 'GSK-RVW0WEB1', 'pending_payment', '{5}', public.today_jkt() + 5, public.today_jkt() + 5, null::interval,
   false, null),
  ('202', 'GSK-RVW0WA1T', 'paid', '{5}', public.today_jkt() + 3, public.today_jkt() + 3, interval '25 hours', true,
   'PAID_AFTER_EXPIRY_NO_QUOTA'),
  ('203', 'GSK-RVW0NEW1', 'paid', '{5}', public.today_jkt() + 3, public.today_jkt() + 3, interval '2 hours', true,
   'PAID_AFTER_EXPIRY_NO_QUOTA'),
  ('204', 'GSK-RVW0N0TK', 'paid', '{5}', public.today_jkt() + 3, public.today_jkt() + 3, interval '1 hour', false,
   null),
  ('205', 'GSK-RVW0C0MB', 'checked_in', '{5,8}', public.today_jkt(), public.today_jkt() + 1, interval '5 days', false,
   null),
  ('206', 'GSK-RVW0SEAT', 'paid', '{5}', public.today_jkt() + 1, public.today_jkt() + 1, interval '3 hours', true,
   'PAID_AFTER_EXPIRY_NO_QUOTA'),
  ('207', 'GSK-RVW0PAYD', 'paid', '{5}', public.today_jkt() + 1, public.today_jkt() + 1, interval '5 days', false,
   null)
) as fixture(code, booking_code, status, rw_ids, visit, visit_end, paid_ago, review, review_reason);
-- The review of each late settlement started when its booking event says, not at paid_at.
insert into public.booking_events (booking_id, from_status, to_status, actor_type, reason, occurred_at) values
  ('00000000-0000-4000-8000-0000000b1202', 'expired', 'paid', 'webhook', 'paid_after_expiry_no_quota',
   now() - interval '25 hours'),
  ('00000000-0000-4000-8000-0000000b1203', 'expired', 'paid', 'webhook', 'paid_after_expiry_no_quota',
   now() - interval '2 hours');
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at,
  quota_released_at, checked_in_at) values
  ('00000000-0000-4000-8000-0000000b1201', 5, '00000000-0000-4000-8000-0000000b1104', 1, 2, 'reserved', now(), null,
   null),
  ('00000000-0000-4000-8000-0000000b1205', 5, '00000000-0000-4000-8000-0000000b1101', 1, 2, 'checked_in', now(), null,
   now()),
  ('00000000-0000-4000-8000-0000000b1205', 8, '00000000-0000-4000-8000-0000000b1102', 2, 2, 'reserved', now(), null,
   null),
  ('00000000-0000-4000-8000-0000000b1206', 5, '00000000-0000-4000-8000-0000000b1103', 1, 2, 'released', now(), now(),
   null),
  ('00000000-0000-4000-8000-0000000b1207', 5, '00000000-0000-4000-8000-0000000b1103', 1, 2, 'reserved', now(), null,
   null);
select set_config('app.in_rpc', '', true);

-- ===== 1: one margin before the first session =====
select is(internal.hold_margin_before_session(), interval '1 hour', '1: a web hold stops an hour before its session');
select is(internal.hold_deadline('school', 10, now() + interval '3 hours'), now() + interval '2 hours',
  'a new hold stops at that margin');
select is(internal.latest_hold_deadline((select b from public.bookings b where b.booking_code = 'GSK-RVW0WEB1')),
  ((public.today_jkt() + 5) + time '07:37') at time zone 'Asia/Jakarta' - internal.hold_margin_before_session(),
  'and so does an extended web hold');
select is(array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'internal' and p.proname in ('hold_deadline', 'latest_hold_deadline')
      and p.prosrc ~ 'hold_margin_before_session' and p.prosrc !~ '1 hour'
    order by 1),
  array['hold_deadline', 'latest_hold_deadline'], 'both read the helper and spell no hour of their own');
select ok(not has_function_privilege('anon', 'internal.hold_margin_before_session()', 'execute')
          and not has_function_privilege('authenticated', 'internal.hold_margin_before_session()', 'execute'),
  'the helper is no API role''s');

-- ===== 2 and 4: a booking left under review, and paid_without_tickets =====
select internal.run_anomaly_scan();
select is(pg_temp.alerted('booking_review_unresolved', '00000000-0000-4000-8000-0000000b1202'), 1,
  '2: a paid booking without seats waiting more than a day for resolve_booking_review raises an alert');
select is(pg_temp.alerted('booking_review_unresolved', '00000000-0000-4000-8000-0000000b1203'), 0,
  'one waiting two hours does not yet');
select is((select (a.severity, a.title ~ 'GSK-', a.details ->> 'booking_id')::text from public.security_alerts a
           where a.fingerprint = 'booking_review_unresolved:00000000-0000-4000-8000-0000000b1202'),
  '(high,f,00000000-0000-4000-8000-0000000b1202)', 'a high alert that names the booking by id, never by its code');
select is(pg_temp.alerted('paid_without_tickets', '00000000-0000-4000-8000-0000000b1202')
          + pg_temp.alerted('paid_without_tickets', '00000000-0000-4000-8000-0000000b1203')
          + pg_temp.alerted('paid_without_tickets', '00000000-0000-4000-8000-0000000b1206'), 0,
  '4: a booking under review has no tickets on purpose, so paid_without_tickets leaves it out');
select is(pg_temp.alerted('paid_without_tickets', '00000000-0000-4000-8000-0000000b1204'), 1,
  'while a paid booking out of review without tickets still raises it');

select internal.run_anomaly_scan();
select is((select (count(*), max(a.occurrences))::text from public.security_alerts a
           where a.fingerprint = 'booking_review_unresolved:00000000-0000-4000-8000-0000000b1202'),
  '(1,2)', 'a second run counts an occurrence on the one open alert of the booking');
update public.security_alerts set acknowledged_by = '00000000-0000-4000-8000-00000000f001'
where fingerprint = 'booking_review_unresolved:00000000-0000-4000-8000-0000000b1202';
select internal.run_anomaly_scan();
select is(pg_temp.alerted('booking_review_unresolved', '00000000-0000-4000-8000-0000000b1202'), 0,
  'acknowledged, it is not raised again the same day');
update public.security_alerts set acknowledged_at = now() - interval '25 hours'
where fingerprint = 'booking_review_unresolved:00000000-0000-4000-8000-0000000b1202';
select internal.run_anomaly_scan();
select is(pg_temp.alerted('booking_review_unresolved', '00000000-0000-4000-8000-0000000b1202'), 1,
  'but a day after the acknowledgement, still unresolved, it is raised again');
select set_config('app.in_rpc', '1', true);
update public.bookings set needs_review = false, review_reason = null
where id = '00000000-0000-4000-8000-0000000b1202';
select set_config('app.in_rpc', '', true);
select internal.run_anomaly_scan();
select is((select a.details ->> 'closed' from public.security_alerts a
           where a.fingerprint = 'booking_review_unresolved:00000000-0000-4000-8000-0000000b1202'
             and a.acknowledged_at = now()),
  'review_resolved', 'the alert closes by itself once the review is resolved');
select ok(not has_function_privilege('service_role', 'internal.anomaly_unresolved_reviews()', 'execute'),
  'the rule runs only inside the scan');

-- ===== 3: the D-1 reminder, to a seat held tomorrow, once per visit day =====
-- Yesterday's run reminded the combo of today, its first day.
select internal.enqueue_notification('00000000-0000-4000-8000-0000000b1205', 'visit_reminder_d1', 'email',
  jsonb_build_object('link_scope', 'view', 'session_date', public.today_jkt()), 'visit_date:' || public.today_jkt());
select internal.enqueue_visit_reminders();
select set_config('app.in_rpc', '', true), set_config('app.actor_role', '', true);
select is((select string_agg(b.booking_code, ' ' order by b.booking_code) from public.notifications n
           join public.bookings b on b.id = n.booking_id
           where n.template = 'visit_reminder_d1' and n.channel = 'email' and b.booking_code like 'GSK-RVW0%'
             and n.params ->> 'session_date' = (public.today_jkt() + 1)::text),
  'GSK-RVW0C0MB GSK-RVW0PAYD',
  '3: the bookings with a seat held tomorrow are reminded, a combo checked in on its first day included');
select is((select count(*)::int from public.notifications n
           where n.booking_id = '00000000-0000-4000-8000-0000000b1206' and n.template = 'visit_reminder_d1'), 0,
  'a booking paid after its seats were gone, its leg released, is not reminded of a seat it does not have');
select is((select count(*)::int from public.notifications n
           where n.booking_id = '00000000-0000-4000-8000-0000000b1205' and n.template = 'visit_reminder_d1'
             and n.channel = 'email'), 2,
  'a combo visiting on two days gets one reminder for each day: the first day''s does not stop the second''s');
select is((select string_agg(n.channel::text, ' ' order by n.channel) from public.notifications n
           where n.booking_id = '00000000-0000-4000-8000-0000000b1207' and n.template = 'visit_reminder_d1'),
  'whatsapp email', 'on both channels');
select internal.enqueue_visit_reminders();
select set_config('app.in_rpc', '', true), set_config('app.actor_role', '', true);
select is((select count(*)::int from public.notifications n join public.bookings b on b.id = n.booking_id
           where n.template = 'visit_reminder_d1' and b.booking_code like 'GSK-RVW0%'), 5,
  'and a second run the same day queues nothing more');

select * from finish();
rollback;
