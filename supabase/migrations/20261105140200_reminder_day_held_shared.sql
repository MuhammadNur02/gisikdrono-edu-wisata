-- Follow-ups of the last review of PR #109, items 3 and 5 (20261105130600_reminder_on_stopped_sessions.sql;
-- docs/PRD.md FR-POST-07, §9.4):
--
--   reminder_day_held            Takes the visit day as a `date`, so no caller compares a day through its text and
--                                DateStyle. It now also holds the review rule the run had alone: a booking under review
--                                holds no reminder day, unless the review is REVENUE_RULE_REFUSED, whose tickets stand.
--                                The run and a resend share it, so staff can no longer remind a booking under a
--                                CHARGEBACK review, its tickets suspended. The (uuid, text) version is dropped.
--   enqueue_visit_reminders      Reads the review rule through reminder_day_held only.
--   request_notification_resend  A D-1 reminder whose last row names no day (a row queued before reminders carried
--                                their day) is refused with its own hint, REMINDER_DAY_UNKNOWN, rather than as a day no
--                                longer held. Both reminder checks run before rate_limit_hit, so a refusal of the day
--                                reads as itself even once the day's resends are spent. Everything else is unchanged.


-- ===== reminder_day_held =====

create function internal.reminder_day_held(p_booking_id uuid, p_day date) returns boolean
  language sql stable
  set search_path = ''
as $$
  select exists (
    select 1 from public.booking_legs l
    join public.bookings b on b.id = l.booking_id
    join public.visit_sessions s on s.id = l.visit_session_id
    where l.booking_id = p_booking_id and l.status = 'reserved'
      and (not b.needs_review or b.review_reason = 'REVENUE_RULE_REFUSED')
      and s.session_date = p_day and s.session_date >= public.today_jkt()
      and not exists (select 1 from public.weather_notices n where n.visit_session_id = l.visit_session_id));
$$;
revoke execute on function internal.reminder_day_held(uuid, date) from public, anon, authenticated, service_role;


-- ===== enqueue_visit_reminders =====

-- Replaces the 20261105130600 version: the review rule is read through reminder_day_held, by its date.
create or replace function internal.enqueue_visit_reminders() returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  due record;
  params jsonb;
  reminded_count integer := 0;
begin
  previous_settings := internal.begin_scheduled_job();
  for due in
    select distinct l.booking_id, s.session_date
    from public.booking_legs l
    join public.visit_sessions s on s.id = l.visit_session_id
    join public.bookings b on b.id = l.booking_id
    where b.status in ('paid', 'checked_in') and l.status = 'reserved' and s.session_date = public.today_jkt() + 1
      and internal.reminder_day_held(l.booking_id, s.session_date)
    order by l.booking_id
  loop
    params := jsonb_build_object('link_scope', 'view', 'session_date', due.session_date);
    perform internal.enqueue_notification(due.booking_id, 'visit_reminder_d1', 'whatsapp', params,
                                          'visit_date:' || due.session_date);
    perform internal.enqueue_notification(due.booking_id, 'visit_reminder_d1', 'email', params,
                                          'visit_date:' || due.session_date);
    reminded_count := reminded_count + 1;
  end loop;
  perform internal.restore_settings(previous_settings);
  return reminded_count;
end;
$$;


-- ===== request_notification_resend =====

-- Replaces the 20261105130600 version: the reminder's day is checked by its date, a row without one has a refusal of
-- its own, and both run before the day's resend count is spent.
create or replace function public.request_notification_resend(p_booking_id uuid,
  p_template public.notification_template, p_channel public.notification_channel) returns uuid
  language plpgsql security definer
  set search_path = ''
as $$
declare
  resend_cap constant integer := 10;
  resend_window constant integer := 86400;
  guest_templates constant public.notification_template[] := array['booking_created', 'quotation_ready',
    'payment_reminder', 'payment_received_ticket', 'booking_expired', 'booking_cancelled', 'visit_reminder_d1',
    'checked_in_thanks', 'certificate_ready', 'review_invite', 'refund_processed', 'booking_link',
    'weather_disruption'];
  booking public.bookings := internal.require_booking_staff(p_booking_id);
  previous_settings jsonb;
  last_params jsonb;
  sent_before integer;
  queued uuid;
begin
  if p_template is null or not (p_template = any (guest_templates)) or p_channel is null then
    raise exception 'only a guest''s message is sent again' using errcode = '22023';
  end if;
  if not internal.message_fits_state(p_template, booking.status) then
    raise exception 'a % message does not fit a % booking', p_template, booking.status
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  select n.params, count(*) over () into last_params, sent_before
  from public.notifications n
  where n.booking_id = booking.id and n.template = p_template and n.channel = p_channel
  order by n.created_at desc
  limit 1;
  if last_params is null then
    raise exception 'booking % never had this message', booking.booking_code
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if p_template = 'visit_reminder_d1' and last_params ->> 'session_date' is null then
    raise exception 'the last reminder of booking % names no visit day', booking.booking_code
      using errcode = 'P0001', hint = 'REMINDER_DAY_UNKNOWN';
  end if;
  if p_template = 'visit_reminder_d1'
     and not internal.reminder_day_held(booking.id, (last_params ->> 'session_date')::date) then
    raise exception 'booking % no longer holds a seat on the day of its last reminder', booking.booking_code
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if not internal.rate_limit_hit('notification_resend:booking:' || booking.id::text, resend_cap, resend_window) then
    raise exception 'booking % had % messages sent again today', booking.booking_code, resend_cap
      using errcode = 'P0001', hint = 'RATE_LIMITED';
  end if;
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || internal.document_actor(auth.uid()));
  queued := internal.enqueue_notification(booking.id, p_template, p_channel, last_params,
                                          'resend:' || sent_before);
  -- The outbox's own rules still hold: a channel switched off, an unverified number, the cap on emails before payment.
  if queued is null then
    raise exception 'this message cannot go to the PIC now' using errcode = 'P0001', hint = 'NOT_SENT';
  end if;
  perform internal.log_audit('notifications.resend', 'bookings', booking.id::text,
                             jsonb_build_object('template', p_template, 'channel', p_channel, 'notification_id', queued));
  perform internal.restore_settings(previous_settings);
  return queued;
end;
$$;


-- ===== the (uuid, text) reminder_day_held =====

-- No caller is left: both callers above pass a date.
drop function internal.reminder_day_held(uuid, text);
