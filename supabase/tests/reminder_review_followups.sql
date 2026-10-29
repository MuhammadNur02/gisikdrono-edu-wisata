-- Follow-ups of the last review of PR #109 (20261105140000_tickets_owed_by_unreleased_legs.sql,
-- 20261105140100_stale_reminder_cancelled.sql, 20261105140200_reminder_day_held_shared.sql): a paid booking owes tickets
-- for every leg not `released`, an `unreserved` one included; a reminder the worker finds stale is cancelled, not
-- dead-lettered; reminder_day_held takes a date and holds the review rule the run and a resend share; a resent reminder
-- without a day has a refusal of its own, and the day is checked before the day's resends are counted.
begin;
select plan(20);
\ir helpers/rls_personas.psql

-- ===== Fixtures =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000c1001', 5, 'regular', 'uji-pengingat-lanjut', 'Paket Pengingat Lanjut', 'per_pax',
   30000, 'published');
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000c1101', 5, public.today_jkt() + 1, '07:13', '08:13', 'Pengingat besok', 20),
  ('00000000-0000-4000-8000-0000000c1102', 5, public.today_jkt() + 3, '07:17', '08:17', 'Pengingat nanti', 20);
update public.site_settings set value = to_jsonb(true) where key in ('email_enabled', 'whatsapp_enabled');

create function pg_temp.alerted(p_rule text, p_subject text) returns integer
  language sql stable
as $$
  select count(*)::int from public.security_alerts a
  where a.fingerprint = p_rule || ':' || p_subject and a.acknowledged_at is null;
$$;

-- The hint a statement is refused with, or null when it runs.
create function pg_temp.hint_of(p_sql text) returns text
  language plpgsql
as $$
declare
  raised_hint text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics raised_hint = pg_exception_hint;
  return raised_hint;
end;
$$;
grant execute on function pg_temp.hint_of(text) to authenticated;

select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, channel, package_id, package_snapshot, rw_ids, booker_type,
  pic_name, pic_phone, pic_email, phone_verified_at, pax_count, visit_date, visit_date_end, subtotal_package,
  total_amount, amount_paid, consent_version, consented_at, paid_at, needs_review, review_reason)
select ('00000000-0000-4000-8000-0000000c1' || code)::uuid, booking_code, 'paid', 'web',
  '00000000-0000-4000-8000-0000000c1001', '{}', '{5}', 'school', 'Bu Pengingat', '+62813000072' || code,
  'pengingat-' || code || '@example.test', now(), 2, visit, visit, 60000, 60000, 60000, 'v1', now(),
  now() - interval '1 hour', review_reason is not null, review_reason
from (values
  ('301', 'GSK-RMF0NRSV', public.today_jkt() + 3, null),
  ('302', 'GSK-RMF0RESD', public.today_jkt() + 3, null),
  ('303', 'GSK-RMF0CHBK', public.today_jkt() + 1, 'CHARGEBACK'),
  ('304', 'GSK-RMF0RVRF', public.today_jkt() + 1, 'REVENUE_RULE_REFUSED'),
  ('305', 'GSK-RMF00DAY', public.today_jkt() + 1, null),
  ('306', 'GSK-RMF0G0NE', public.today_jkt() + 1, null)
) as fixture(code, booking_code, visit, review_reason);
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at,
  quota_released_at) values
  ('00000000-0000-4000-8000-0000000c1301', 5, '00000000-0000-4000-8000-0000000c1102', 1, 2, 'unreserved', null, null),
  ('00000000-0000-4000-8000-0000000c1302', 5, '00000000-0000-4000-8000-0000000c1102', 1, 2, 'released', now(), now()),
  ('00000000-0000-4000-8000-0000000c1303', 5, '00000000-0000-4000-8000-0000000c1101', 1, 2, 'reserved', now(), null),
  ('00000000-0000-4000-8000-0000000c1304', 5, '00000000-0000-4000-8000-0000000c1101', 1, 2, 'reserved', now(), null),
  ('00000000-0000-4000-8000-0000000c1305', 5, '00000000-0000-4000-8000-0000000c1101', 1, 2, 'reserved', now(), null),
  ('00000000-0000-4000-8000-0000000c1306', 5, '00000000-0000-4000-8000-0000000c1101', 1, 2, 'released', now(), now());
select set_config('app.in_rpc', '', true);

-- The reminders the bookings had: each of tomorrow, but GSK-RMF00DAY's, queued before reminders carried their day.
select internal.enqueue_notification(('00000000-0000-4000-8000-0000000c1' || code)::uuid, 'visit_reminder_d1', 'email',
  case when code = '305' then jsonb_build_object('link_scope', 'view')
       else jsonb_build_object('link_scope', 'view', 'session_date', public.today_jkt() + 1) end,
  'visit_date:' || (public.today_jkt() + 1))
from unnest(array['303', '304', '305', '306']) as code;

-- ===== 1: a paid booking owes tickets for every leg not released =====
select internal.run_anomaly_scan();
select is(pg_temp.alerted('paid_without_tickets', '00000000-0000-4000-8000-0000000c1301'), 1,
  '1: a booking marked paid while its leg is still unreserved has no seat and no ticket, and raises the alert');
select is((select count(*)::int from internal.reconcile_invariant_findings() f
           where f.issue_type = 'paid_without_tickets' and f.booking_id = '00000000-0000-4000-8000-0000000c1301'), 1,
  'and the nightly reconciliation finds it too');
select is(pg_temp.alerted('paid_without_tickets', '00000000-0000-4000-8000-0000000c1302')
          + (select count(*)::int from internal.reconcile_invariant_findings() f
             where f.issue_type = 'paid_without_tickets' and f.booking_id = '00000000-0000-4000-8000-0000000c1302'), 0,
  'while a booking whose legs were all released owes no ticket');
select is((select string_agg(p.proname::text, ' ' order by p.proname) from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'internal' and p.proname in ('anomaly_money_and_tickets', 'reconcile_invariant_findings')
             and p.prosrc ~ 'PAID_AFTER_EXPIRY_NO_QUOTA' and p.prosrc ~ 'owed.status <> ''released'''),
  'anomaly_money_and_tickets reconcile_invariant_findings',
  'both keep the PAID_AFTER_EXPIRY_NO_QUOTA exclusion and read the same owed legs');

-- ===== 2: a stale reminder is cancelled, not dead-lettered =====
create temporary table claimed on commit drop as
  select c.id from public.svc_claim_notifications(50, array['visit_reminder_d1']::public.notification_template[]) c
  where c.booking_id = '00000000-0000-4000-8000-0000000c1306';
select is((select count(*)::int from claimed), 1, '2: the worker claims the reminder of a day no longer held');
select public.svc_fail_notification((select id from claimed), 'stale_day',
  'The reminder names a day the booking no longer visits', true);
select is((select format('%s %s %s %s', n.status, n.dead_at is null, n.locked_at is null, n.last_error_code)
           from public.notifications n where n.id = (select id from claimed)),
  'cancelled t t stale_day', 'its stale_day refusal cancels the row, as a switched-off channel does');
select is((select count(*)::int from public.security_events e
           where e.event_type = 'notification_dead' and e.entity_id = (select id::text from claimed)), 0,
  'with no notification_dead event');
select is(pg_temp.alerted('notification_dead', 'visit_reminder_d1:email'), 0, 'and no alert');
insert into public.notifications (id, channel, template, recipient, params, dedupe_key, status, attempts)
values ('00000000-0000-4000-9000-0000000ca001', 'email', 'security_alert', 'keamanan@example.test', '{"rule": "x"}',
        'alert:rmf1', 'sending', 1);
select public.svc_fail_notification('00000000-0000-4000-9000-0000000ca001', 'bad_params', 'refused', true);
select is((select format('%s %s', n.status, n.dead_at is not null) from public.notifications n
           where n.id = '00000000-0000-4000-9000-0000000ca001'),
  'failed t', 'while any other permanent refusal still dead-letters its row');

-- ===== 3 and 5: reminder_day_held, by date, with the review rule =====
select ok(to_regprocedure('internal.reminder_day_held(uuid, date)') is not null
          and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'internal' and p.proname = 'reminder_day_held'
                            and pg_get_function_identity_arguments(p.oid) <> 'p_booking_id uuid, p_day date'),
  '5: reminder_day_held takes the day as a date, and the text version is gone');
select ok(not has_function_privilege('anon', 'internal.reminder_day_held(uuid, date)', 'execute')
          and not has_function_privilege('authenticated', 'internal.reminder_day_held(uuid, date)', 'execute')
          and not has_function_privilege('service_role', 'internal.reminder_day_held(uuid, date)', 'execute'),
  'and is no API role''s');
select is(internal.reminder_day_held('00000000-0000-4000-8000-0000000c1303', public.today_jkt() + 1), false,
  '3: a booking under a chargeback review holds no reminder day');
select is(internal.reminder_day_held('00000000-0000-4000-8000-0000000c1304', public.today_jkt() + 1), true,
  'while one whose revenue split waits for review does');
select is((select string_agg(p.proname::text, ' ' order by p.proname) from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'internal' and p.proname in ('reminder_day_held', 'enqueue_visit_reminders')
             and p.prosrc ~ 'needs_review'),
  'reminder_day_held', 'the review rule is written once, in reminder_day_held, and the run reads it there');

-- ===== 3 and 5: request_notification_resend =====
-- GSK-RMF0G0NE spent its ten resends of the day.
insert into public.rate_limit_buckets (key, window_start, count)
values ('notification_resend:booking:00000000-0000-4000-8000-0000000c1306',
        to_timestamp(floor(extract(epoch from now()) / 86400) * 86400), 10);
select pg_temp.act_as('admin_rw_05');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000c1303',
    'visit_reminder_d1', 'email')$$),
  'STATE_INVALID', '3: staff cannot send the reminder again to a booking under a chargeback review');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000c1305',
    'visit_reminder_d1', 'email')$$),
  'REMINDER_DAY_UNKNOWN', '5: a last reminder that names no day is refused as such, not as a seat no longer held');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000c1306',
    'visit_reminder_d1', 'email')$$),
  'STATE_INVALID', 'a day no longer held is refused as itself, before the spent resends are counted');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000c1304',
    'visit_reminder_d1', 'email')$$),
  null, 'while the reminder of a seat held tomorrow goes again');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.notifications n
           where n.booking_id = '00000000-0000-4000-8000-0000000c1304' and n.template = 'visit_reminder_d1'
             and n.channel = 'email' and n.params ->> 'session_date' = (public.today_jkt() + 1)::text), 2,
  'as a new row naming the same day');

-- ===== 3: the run shares the rule =====
select internal.enqueue_visit_reminders();
select set_config('app.in_rpc', '', true), set_config('app.actor_role', '', true);
select is((select string_agg(b.booking_code, ' ' order by b.booking_code) from public.notifications n
           join public.bookings b on b.id = n.booking_id
           where n.template = 'visit_reminder_d1' and n.channel = 'whatsapp' and b.booking_code like 'GSK-RMF0%'),
  'GSK-RMF00DAY GSK-RMF0RVRF', 'the run reminds the seats held tomorrow outside a chargeback review');

select * from finish();
rollback;
