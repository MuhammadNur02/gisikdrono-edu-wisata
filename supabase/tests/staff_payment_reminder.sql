-- 20261105175000_staff_payment_reminder.sql: staff send a first payment reminder to a booking the poll job would
-- remind (an institution's web hold or an officer's hold before its first session, the latter only once its pay link
-- went out), a message the booking never had is refused as NEVER_SENT, and the poll job decides each channel on its
-- own: a recent reminder stands for the job's on its channel only, from 12 hours before the job's
-- window opens; a row cancelled or dead-lettered stands for nothing, a failed one waiting for its retry still does.
begin;
select plan(45);
\ir helpers/rls_personas.psql

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

create function pg_temp.reminders(p_booking uuid, p_channel text) returns integer
  language sql stable
as $$
  select count(*)::int from public.notifications n
  where n.booking_id = p_booking and n.template = 'payment_reminder' and n.channel::text = p_channel;
$$;

-- ===== Fixtures: an RW 05 package and the bookings, each on its own contact =====
insert into public.tour_packages (id, rw_id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000d5001', 5, 'regular', 'uji-pengingat-staf', 'Paket Pengingat Staf', 'per_pax',
   10000, 'published');
update public.site_settings set value = to_jsonb(true) where key in ('email_enabled', 'whatsapp_enabled');

select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, channel, package_id, package_snapshot, rw_ids, booker_type,
  pic_name, pic_phone, pic_email, phone_verified_at, pax_count, visit_date, visit_date_end, subtotal_package,
  total_amount, amount_paid, consent_version, consented_at, paid_at, expires_at, needs_review, review_reason,
  created_by)
select ('00000000-0000-4000-8000-0000000d5' || code)::uuid, booking_code, status::public.booking_status,
  channel::public.booking_channel, '00000000-0000-4000-8000-0000000d5001', '{}', rw_ids::smallint[],
  booker_type::public.booker_type, 'Bu Staf', '+62813000075' || code, 'staf-pengingat-' || code || '@example.test',
  case when phone_verified then now() end, 1, public.today_jkt() + 3, public.today_jkt() + 3, 10000, 10000,
  case when status = 'paid' then 10000 else 0 end, 'v1', now(), case when status = 'paid' then now() end,
  expires_at, review_reason is not null, review_reason,
  case when channel = 'admin' then '00000000-0000-4000-8000-00000000f005'::uuid end
from (values
  ('101', 'GSK-SPR0WB01', 'pending_payment', 'web', now() + interval '2 days', null, 'school', true, '{5}'),
  ('102', 'GSK-SPR0PD02', 'paid', 'web', null, null, 'school', true, '{5}'),
  ('103', 'GSK-SPR0XP03', 'pending_payment', 'web', now() - interval '5 minutes', null, 'school', true, '{5}'),
  ('104', 'GSK-SPR0RV04', 'pending_payment', 'web', now() + interval '2 days', 'PAID_AFTER_EXPIRY_NO_QUOTA',
   'school', true, '{5}'),
  ('105', 'GSK-SPR0AD05', 'pending_payment', 'admin', now() + interval '2 days', null, 'school', true, '{5}'),
  ('106', 'GSK-SPR0CP06', 'pending_payment', 'web', now() + interval '2 days', null, 'school', true, '{5}'),
  ('107', 'GSK-SPR0SN07', 'pending_payment', 'web', now() + interval '3 hours', null, 'school', true, '{5}'),
  ('108', 'GSK-SPR0DA08', 'pending_payment', 'web', now() + interval '3 hours', null, 'school', true, '{5}'),
  ('109', 'GSK-SPR0FD09', 'pending_payment', 'web', now() + interval '3 hours', null, 'school', true, '{5}'),
  ('110', 'GSK-SPR0E13A', 'pending_payment', 'web', now() + interval '3 hours', null, 'school', true, '{5}'),
  ('111', 'GSK-SPR0E11B', 'pending_payment', 'web', now() + interval '3 hours', null, 'school', true, '{5}'),
  ('112', 'GSK-SPR0NV12', 'pending_payment', 'web', now() + interval '2 days', null, 'school', false, '{5}'),
  ('113', 'GSK-SPR0PR13', 'pending_payment', 'web', now() + interval '2 days', null, 'individual', true, '{5}'),
  ('114', 'GSK-SPR0ST14', 'pending_payment', 'admin', now() + interval '1 day', null, 'school', true, '{5}'),
  ('115', 'GSK-SPR0CB15', 'pending_payment', 'web', now() + interval '2 days', null, 'school', true, '{5,13}'),
  ('116', 'GSK-SPR0EX16', 'pending_payment', 'web', now() + interval '1 hour', null, 'school', true, '{5}'),
  ('117', 'GSK-SPR0RT17', 'pending_payment', 'web', now() + interval '3 hours', null, 'school', true, '{5}'),
  ('118', 'GSK-SPR0CA18', 'pending_payment', 'web', now() + interval '3 hours', null, 'school', true, '{5}')
) as fixture(code, booking_code, status, channel, expires_at, review_reason, booker_type, phone_verified, rw_ids);
-- GSK-SPR0ST14 is an officer's hold whose session started yesterday, its pay link sent.
insert into public.visit_sessions (id, rw_id, session_date, start_time, end_time, label, capacity) values
  ('00000000-0000-4000-8000-0000000d5201', 5, public.today_jkt() - 1, '09:00', '10:00', 'Pengingat kemarin', 10);
insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at)
values ('00000000-0000-4000-8000-0000000d5114', 5, '00000000-0000-4000-8000-0000000d5201', 1, 1, 'reserved', now());
-- The messages the bookings had before: the officer's pay link of GSK-SPR0AD05 is queued, not yet sent; the staff
-- reminders on email of GSK-SPR0DA08 (a day ago), GSK-SPR0FD09 (an hour ago, dead-lettered), GSK-SPR0RT17 (an hour
-- ago, failed and waiting for its retry), GSK-SPR0E13A and GSK-SPR0E11B (13 and 11 hours before the job's window
-- opened, 3 hours ago) and GSK-SPR0EX16 (15 hours ago); GSK-SPR0CA18's address had its three emails before payment
-- today.
insert into public.notifications (booking_id, channel, template, recipient, params, dedupe_key, status, sent_at,
  dead_at, next_attempt_at, created_at)
select ('00000000-0000-4000-8000-0000000d5' || code)::uuid, 'email', template::public.notification_template,
  'staf-pengingat-' || code || '@example.test', '{"link_scope": "pay"}',
  'booking:00000000-0000-4000-8000-0000000d5' || code || ':' || template || ':email'
  || case when template = 'payment_reminder' then ':' || md5('first_by_staff') else '' end,
  replace(status, 'dead', 'failed')::public.notification_status, case when status = 'sent' then queued_at end,
  case when status = 'dead' then queued_at end, case when status = 'failed' then now() + interval '10 minutes'
  else queued_at end, queued_at
from (values
  ('105', 'booking_created', 'queued', now()),
  ('114', 'booking_created', 'sent', now() - interval '2 hours'),
  ('108', 'payment_reminder', 'sent', now() - interval '1 day'),
  ('109', 'payment_reminder', 'dead', now() - interval '1 hour'),
  ('117', 'payment_reminder', 'failed', now() - interval '1 hour'),
  ('118', 'booking_created', 'sent', now() - interval '3 hours'),
  ('118', 'quotation_ready', 'sent', now() - interval '3 hours'),
  ('118', 'booking_link', 'sent', now() - interval '3 hours'),
  ('110', 'payment_reminder', 'sent', now() - interval '16 hours'),
  ('111', 'payment_reminder', 'sent', now() - interval '14 hours'),
  ('116', 'payment_reminder', 'sent', now() - interval '15 hours')
) as earlier(code, template, status, queued_at);
select set_config('app.in_rpc', '', true);
-- GSK-SPR0CP06 spent its ten messages of the day.
insert into public.rate_limit_buckets (key, window_start, count)
values ('notification_resend:booking:00000000-0000-4000-8000-0000000d5106',
        to_timestamp(floor(extract(epoch from now()) / 86400) * 86400), 10);

-- ===== Grants: unchanged =====
select ok(not has_function_privilege('anon',
            'public.request_notification_resend(uuid, public.notification_template, public.notification_channel)',
            'execute')
          and not has_function_privilege('service_role',
            'public.request_notification_resend(uuid, public.notification_template, public.notification_channel)',
            'execute')
          and has_function_privilege('authenticated',
            'public.request_notification_resend(uuid, public.notification_template, public.notification_channel)',
            'execute'),
  'only a signed-in staff session calls request_notification_resend');
select is((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
           where p.oid = 'public.request_notification_resend(uuid, public.notification_template, public.notification_channel)'::regprocedure),
  true, 'it stays security definer with an empty search_path');

-- ===== The lists the dashboard mirrors (src/config/bookings.ts, pinned by src/config/bookings.test.ts) =====
select is((select string_agg(t || ':' || coalesce((select string_agg(s::text, ',' order by s)
                                                   from unnest(enum_range(null::public.booking_status)) s
                                                   where internal.message_fits_state(t::public.notification_template,
                                                                                     s)), ''), '; ' order by t)
           from unnest(array['booking_created', 'payment_reminder', 'payment_received_ticket', 'booking_cancelled',
                             'visit_reminder_d1', 'certificate_ready', 'refund_processed']) t),
  'booking_cancelled:cancelled,refunded; booking_created:pending_payment; '
  || 'certificate_ready:checked_in,completed; payment_received_ticket:paid,checked_in; '
  || 'payment_reminder:pending_payment; refund_processed:cancelled,refunded; visit_reminder_d1:paid,checked_in',
  'message_fits_state lets each resendable message go in the states RESEND_TEMPLATE_STATES names');
select is((select count(*)::int from pg_proc p
           where p.oid in ('public.request_notification_resend(uuid, public.notification_template, public.notification_channel)'::regprocedure,
                           'internal.payments_housekeeping()'::regprocedure)
             and p.prosrc like '%array[''sent'', ''delivered'', ''read'']%'
             and p.prosrc like '%array[''school'', ''university'', ''government'', ''company'']%'), 2,
  'the RPC and the job read the pay link statuses and the reminded booker types the dashboard mirrors');
select ok((select p.prosrc like '%b.review_reason = ''REVENUE_RULE_REFUSED''%' from pg_proc p
           where p.oid = 'internal.reminder_day_held(uuid, date)'::regprocedure),
  'reminder_day_held keeps the D-1 reminder under the review REMINDER_KEEPING_REVIEW_REASON names');


-- ===== A first payment reminder =====
select pg_temp.act_as('admin_rw_08');
select throws_ok($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5101',
    'payment_reminder', 'email')$$,
  'P0002', null, 'an RW admin of another RW cannot send to an RW 05 booking');
reset role;
select set_config('request.jwt.claims', '', true);
select is(pg_temp.reminders('00000000-0000-4000-8000-0000000d5101', 'email'), 0, 'and nothing is queued');

select pg_temp.act_as('admin_rw_05');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5101',
    'payment_reminder', 'email')$$),
  null, 'the RW''s own admin sends a first reminder to a hold that waits for its payment');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5101',
    'payment_reminder', 'whatsapp')$$),
  null, 'on WhatsApp too, also never sent there');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5101',
    'payment_reminder', 'email')$$),
  null, 'and the next one on email goes as a resend of the first');
reset role;
select set_config('request.jwt.claims', '', true);
-- The outbox gives an unconfirmed email address a view link (GUEST-07), as it does the job's own reminder.
select is((select string_agg(n.channel || ' ' || (n.params ->> 'link_scope'), ', ' order by n.channel)
           from public.notifications n
           where n.dedupe_key in ('booking:00000000-0000-4000-8000-0000000d5101:payment_reminder:email:'
                                  || md5('first_by_staff'),
                                  'booking:00000000-0000-4000-8000-0000000d5101:payment_reminder:whatsapp:'
                                  || md5('first_by_staff'))),
  'whatsapp pay, email view',
  'the first ones carry the poll job''s parameters, under their own dedupe scope');
select is((select count(*)::int from public.notifications n
           where n.dedupe_key = 'booking:00000000-0000-4000-8000-0000000d5101:payment_reminder:email:'
                                || md5('resend:1')), 1, 'the second is the first one sent again');
select is((select count(*)::int from public.notifications n
           where n.dedupe_key in ('booking:00000000-0000-4000-8000-0000000d5101:payment_reminder:email',
                                  'booking:00000000-0000-4000-8000-0000000d5101:payment_reminder:whatsapp')), 0,
  'neither takes the poll job''s own dedupe key');
select is((select string_agg(a.metadata ->> 'first_send', ' ' order by a.id) from public.audit_logs a
           where a.action = 'notifications.resend' and a.entity_id = '00000000-0000-4000-8000-0000000d5101'
             and a.actor_id = '00000000-0000-4000-8000-00000000f005'),
  'true true false', 'each is audited with who asked, and whether it was a first send');

-- ===== Refusals =====
select pg_temp.act_as('admin_rw_05');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5102',
    'payment_reminder', 'email')$$),
  'STATE_INVALID', 'a paid booking gets no reminder');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5103',
    'payment_reminder', 'email')$$),
  'STATE_INVALID', 'nor a hold whose deadline passed before the expiry job ran');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5104',
    'payment_reminder', 'email')$$),
  'STATE_INVALID', 'nor a booking under review');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5105',
    'payment_reminder', 'email')$$),
  'PAY_LINK_NOT_SENT', 'nor an officer''s hold whose pay link is only queued, with a hint of its own');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5102',
    'payment_received_ticket', 'email')$$),
  'NEVER_SENT', 'any other message the booking never had is refused as NEVER_SENT');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5101',
    'booking_created', 'email')$$),
  'NEVER_SENT', 'a pay link the booking never had included');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5106',
    'payment_reminder', 'email')$$),
  'RATE_LIMITED', 'the ten messages a day hold for a first reminder too');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5112',
    'payment_reminder', 'whatsapp')$$),
  'NOT_SENT', 'a first WhatsApp reminder to a number nobody verified is refused as NOT_SENT');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5113',
    'payment_reminder', 'email')$$),
  'STATE_INVALID', 'L3: nor an individual''s web hold, which the poll job never reminds');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5114',
    'payment_reminder', 'email')$$),
  'STATE_INVALID', 'L3: nor an officer''s hold once its first session started, its pay link sent');
select throws_ok($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5115',
    'payment_reminder', 'email')$$,
  'P0002', null, 'an RW admin cannot remind a combo that also visits another RW');
reset role;
select set_config('request.jwt.claims', '', true);
select is(pg_temp.reminders('00000000-0000-4000-8000-0000000d5102', 'email')
          + pg_temp.reminders('00000000-0000-4000-8000-0000000d5103', 'email')
          + pg_temp.reminders('00000000-0000-4000-8000-0000000d5104', 'email')
          + pg_temp.reminders('00000000-0000-4000-8000-0000000d5105', 'email')
          + pg_temp.reminders('00000000-0000-4000-8000-0000000d5106', 'email'), 0, 'no refusal queues anything');

-- Once the officer's pay link was sent, the first reminder goes.
select set_config('app.in_rpc', '1', true);
insert into public.notifications (booking_id, channel, template, recipient, params, dedupe_key, status, sent_at)
values ('00000000-0000-4000-8000-0000000d5105', 'email', 'booking_created', 'staf-pengingat-105@example.test',
        '{"link_scope": "pay"}', 'booking:00000000-0000-4000-8000-0000000d5105:booking_created:email:again', 'sent',
        now());
select set_config('app.in_rpc', '', true);
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5105',
    'payment_reminder', 'email')$$),
  null, 'an officer''s hold is reminded once its pay link went out');
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5115',
    'payment_reminder', 'email')$$),
  null, 'while the superadmin reminds a combo');
reset role;
select set_config('request.jwt.claims', '', true);

-- The outbox's rules still hold: with email switched off nothing is queued, and the refusal says so.
update public.site_settings set value = to_jsonb(false) where key = 'email_enabled';
select pg_temp.act_as('admin_rw_05');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5107',
    'payment_reminder', 'email')$$),
  'NOT_SENT', 'a first reminder the outbox will not queue is refused as NOT_SENT');
reset role;
select set_config('request.jwt.claims', '', true);
update public.site_settings set value = to_jsonb(true) where key = 'email_enabled';
select is(pg_temp.reminders('00000000-0000-4000-8000-0000000d5107', 'email'), 0, 'and nothing is queued');

-- ===== The poll job after a staff reminder, channel by channel =====
-- GSK-SPR0SN07 (deadline in 3 hours, inside the 6-hour window) gets its staff email reminder now.
select pg_temp.act_as('admin_rw_05');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5107',
    'payment_reminder', 'email')$$),
  null, 'staff remind a hold three hours before its deadline');
reset role;
select set_config('request.jwt.claims', '', true);
select internal.payments_housekeeping();
select set_config('app.in_rpc', '', true), set_config('app.actor_role', '', true);
select is(format('%s %s', pg_temp.reminders('00000000-0000-4000-8000-0000000d5107', 'email'),
                 pg_temp.reminders('00000000-0000-4000-8000-0000000d5107', 'whatsapp')), '1 1',
  'M1: a staff email inside the window stands for the email only; the job still sends its WhatsApp reminder');
select is((select count(*)::int from public.notifications n
           where n.dedupe_key = 'booking:00000000-0000-4000-8000-0000000d5107:payment_reminder:whatsapp'), 1,
  'under the job''s own key');
select is(format('%s %s', pg_temp.reminders('00000000-0000-4000-8000-0000000d5108', 'email'),
                 pg_temp.reminders('00000000-0000-4000-8000-0000000d5108', 'whatsapp')), '2 1',
  'a staff reminder sent the day before leaves the automatic one on both channels');
select is(format('%s %s', pg_temp.reminders('00000000-0000-4000-8000-0000000d5109', 'email'),
                 pg_temp.reminders('00000000-0000-4000-8000-0000000d5109', 'whatsapp')), '2 1',
  'M1: a staff reminder given up on (dead-lettered) stands for nothing: the job sends on its channel too');
select is(format('%s %s', pg_temp.reminders('00000000-0000-4000-8000-0000000d5117', 'email'),
                 pg_temp.reminders('00000000-0000-4000-8000-0000000d5117', 'whatsapp')), '1 1',
  'while one that failed and waits for its retry still stands for the job''s on its channel');
select is(format('%s %s', pg_temp.reminders('00000000-0000-4000-8000-0000000d5118', 'email'),
                 pg_temp.reminders('00000000-0000-4000-8000-0000000d5118', 'whatsapp')), '0 1',
  'an address past its three emails before payment gets no email reminder, the WhatsApp one still goes');
select is(format('%s %s', pg_temp.reminders('00000000-0000-4000-8000-0000000d5110', 'email'),
                 pg_temp.reminders('00000000-0000-4000-8000-0000000d5110', 'whatsapp')), '2 1',
  'M2: a staff reminder 13 hours before the window opened leaves the job''s on its channel');
select is(format('%s %s', pg_temp.reminders('00000000-0000-4000-8000-0000000d5111', 'email'),
                 pg_temp.reminders('00000000-0000-4000-8000-0000000d5111', 'whatsapp')), '1 1',
  'M2: one 11 hours before stands for it on its channel, so no second email within a few hours');
select is(format('%s %s', pg_temp.reminders('00000000-0000-4000-8000-0000000d5116', 'email'),
                 pg_temp.reminders('00000000-0000-4000-8000-0000000d5116', 'whatsapp')), '1 1',
  'a staff email 15 hours ago stands for a deadline an hour away');
select is((internal.payments_housekeeping() ->> 'reminded')::int, 0,
  'a second run reminds nothing again, and counts no hold it queued nothing for');
select is((select count(*)::int from public.security_events e
           where e.event_type = 'rate_limited' and e.entity_id = '00000000-0000-4000-8000-0000000d5118'
             and e.details ->> 'limit' = 'email_before_payment'), 1,
  'and the capped email is not tried again on the next run, so it leaves one rate_limited event, not one a run');
select set_config('app.in_rpc', '', true), set_config('app.actor_role', '', true);
select is(pg_temp.reminders('00000000-0000-4000-8000-0000000d5101', 'email')
          + pg_temp.reminders('00000000-0000-4000-8000-0000000d5101', 'whatsapp'), 3,
  'a hold whose deadline is two days away is left to its staff reminders until the window opens');

-- GSK-SPR0EX16's deadline moves four hours later: the window moves with it, and the staff email of 15 hours ago now
-- lies before it.
select pg_temp.act_as('admin_rw_05');
select lives_ok($$select public.extend_booking_hold('00000000-0000-4000-8000-0000000d5116',
    now() + interval '5 hours')$$, 'staff extend the hold');
reset role;
select set_config('request.jwt.claims', '', true);
select internal.payments_housekeeping();
select set_config('app.in_rpc', '', true), set_config('app.actor_role', '', true);
select is((select count(*)::int from public.notifications n
           where n.dedupe_key = 'booking:00000000-0000-4000-8000-0000000d5116:payment_reminder:email'), 1,
  'the job then sends its own email reminder for the later deadline');

select * from finish();
rollback;
