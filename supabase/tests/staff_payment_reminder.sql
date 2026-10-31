-- 20261105175000_staff_payment_reminder.sql: staff send a first payment reminder to a booking that waits for its
-- payment (for an officer's hold only once its pay link went out), a message the booking never had is refused as
-- NEVER_SENT, and the poll job still reminds close to the deadline after a staff reminder sent days before, but not
-- after one sent inside its window.
begin;
select plan(29);
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
  channel::public.booking_channel, '00000000-0000-4000-8000-0000000d5001', '{}', '{5}', 'school', 'Bu Staf',
  '+62813000075' || code, 'staf-pengingat-' || code || '@example.test', now(), 1, public.today_jkt() + 3,
  public.today_jkt() + 3, 10000, 10000, case when status = 'paid' then 10000 else 0 end, 'v1', now(),
  case when status = 'paid' then now() end, expires_at, review_reason is not null, review_reason,
  case when channel = 'admin' then '00000000-0000-4000-8000-00000000f005'::uuid end
from (values
  ('101', 'GSK-SPR0WB01', 'pending_payment', 'web', now() + interval '2 days', null),
  ('102', 'GSK-SPR0PD02', 'paid', 'web', null, null),
  ('103', 'GSK-SPR0XP03', 'pending_payment', 'web', now() - interval '5 minutes', null),
  ('104', 'GSK-SPR0RV04', 'pending_payment', 'web', now() + interval '2 days', 'PAID_AFTER_EXPIRY_NO_QUOTA'),
  ('105', 'GSK-SPR0AD05', 'pending_payment', 'admin', now() + interval '2 days', null),
  ('106', 'GSK-SPR0CP06', 'pending_payment', 'web', now() + interval '2 days', null),
  ('107', 'GSK-SPR0SN07', 'pending_payment', 'web', now() + interval '3 hours', null),
  ('108', 'GSK-SPR0DA08', 'pending_payment', 'web', now() + interval '3 hours', null)
) as fixture(code, booking_code, status, channel, expires_at, review_reason);
-- The officer's pay link is queued, not yet sent; GSK-SPR0DA08 had a staff reminder yesterday, before the window.
insert into public.notifications (booking_id, channel, template, recipient, params, dedupe_key, status, sent_at,
  created_at)
values
  ('00000000-0000-4000-8000-0000000d5105', 'email', 'booking_created', 'staf-pengingat-105@example.test',
   '{"link_scope": "pay"}', 'booking:00000000-0000-4000-8000-0000000d5105:booking_created:email', 'queued', null,
   now()),
  ('00000000-0000-4000-8000-0000000d5108', 'email', 'payment_reminder', 'staf-pengingat-108@example.test',
   '{"link_scope": "pay"}', 'booking:00000000-0000-4000-8000-0000000d5108:payment_reminder:email:'
   || md5('first_by_staff'), 'sent', now() - interval '1 day', now() - interval '1 day');
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

-- ===== The poll job after a staff reminder =====
-- GSK-SPR0SN07 (deadline in 3 hours, inside the 6-hour window) gets its staff reminder now; GSK-SPR0DA08 had one
-- yesterday, before the window.
select pg_temp.act_as('admin_rw_05');
select is(pg_temp.hint_of($$select public.request_notification_resend('00000000-0000-4000-8000-0000000d5107',
    'payment_reminder', 'email')$$),
  null, 'staff remind a hold three hours before its deadline');
reset role;
select set_config('request.jwt.claims', '', true);
select internal.payments_housekeeping();
select set_config('app.in_rpc', '', true), set_config('app.actor_role', '', true);
select is(pg_temp.reminders('00000000-0000-4000-8000-0000000d5107', 'email')
          + pg_temp.reminders('00000000-0000-4000-8000-0000000d5107', 'whatsapp'), 1,
  'a staff reminder inside the window counts as the automatic one: the job adds none');
select is(pg_temp.reminders('00000000-0000-4000-8000-0000000d5108', 'whatsapp'), 1,
  'a staff reminder sent the day before leaves the automatic one close to the deadline: on WhatsApp');
select is(pg_temp.reminders('00000000-0000-4000-8000-0000000d5108', 'email'), 2, 'and on email');
select is((select count(*)::int from public.notifications n
           where n.dedupe_key in ('booking:00000000-0000-4000-8000-0000000d5108:payment_reminder:email',
                                  'booking:00000000-0000-4000-8000-0000000d5108:payment_reminder:whatsapp')), 2,
  'under the job''s own dedupe keys');
select internal.payments_housekeeping();
select set_config('app.in_rpc', '', true), set_config('app.actor_role', '', true);
select is(pg_temp.reminders('00000000-0000-4000-8000-0000000d5107', 'email')
          + pg_temp.reminders('00000000-0000-4000-8000-0000000d5107', 'whatsapp')
          + pg_temp.reminders('00000000-0000-4000-8000-0000000d5108', 'email')
          + pg_temp.reminders('00000000-0000-4000-8000-0000000d5108', 'whatsapp'), 4,
  'and a second run reminds neither again');
select is(pg_temp.reminders('00000000-0000-4000-8000-0000000d5101', 'email')
          + pg_temp.reminders('00000000-0000-4000-8000-0000000d5101', 'whatsapp'), 3,
  'a hold whose deadline is two days away is left to its staff reminders until the window opens');

select * from finish();
rollback;
