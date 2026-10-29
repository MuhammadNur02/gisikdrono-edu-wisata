-- Follow-ups of the delta review of PR #109 (20261105130400_visit_reminder_exclusions.sql; docs/PRD.md FR-POST-07,
-- §13.1 A20):
--
--   enqueue_visit_reminders      A leg is left out while it sits in a session the weather stopped (a weather_notices
--                                row for its visit_session_id), not while its booking has an open
--                                weather_notice_bookings row: reschedule_for_weather moves the leg to a new session and
--                                keeps the notice open until its window ends, so the old filter skipped a moved leg's
--                                reminder (M-a), and a booking given no rights (under review, REVENUE_RULE_REFUSED)
--                                still sat on the stopped session (L-a).
--   reminder_day_held            Whether a booking holds a seat on a visit day from today on: a `reserved` leg in a
--                                session of that day the weather did not stop. Both the run and a resend read it.
--   request_notification_resend  A visit_reminder_d1 is sent again only for a day that is still held (L-d); otherwise
--                                STATE_INVALID. Everything else is unchanged.


-- ===== reminder_day_held =====

create function internal.reminder_day_held(p_booking_id uuid, p_day text) returns boolean
  language sql stable
  set search_path = ''
as $$
  select exists (
    select 1 from public.booking_legs l
    join public.visit_sessions s on s.id = l.visit_session_id
    where l.booking_id = p_booking_id and l.status = 'reserved'
      and s.session_date::text = p_day and s.session_date >= public.today_jkt()
      and not exists (select 1 from public.weather_notices n where n.visit_session_id = l.visit_session_id));
$$;
revoke execute on function internal.reminder_day_held(uuid, text) from public, anon, authenticated, service_role;


-- ===== enqueue_visit_reminders =====

-- Replaces the 20261105130400 version: the weather filter is the stopped session, through reminder_day_held.
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
      and (not b.needs_review or b.review_reason = 'REVENUE_RULE_REFUSED')
      and internal.reminder_day_held(l.booking_id, s.session_date::text)
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

-- Replaces the 20261105100200 version: a D-1 reminder names a day the booking must still hold.
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
  if not internal.rate_limit_hit('notification_resend:booking:' || booking.id::text, resend_cap, resend_window) then
    raise exception 'booking % had % messages sent again today', booking.booking_code, resend_cap
      using errcode = 'P0001', hint = 'RATE_LIMITED';
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
  if p_template = 'visit_reminder_d1'
     and not internal.reminder_day_held(booking.id, last_params ->> 'session_date') then
    raise exception 'booking % no longer holds a seat on the day of its last reminder', booking.booking_code
      using errcode = 'P0001', hint = 'STATE_INVALID';
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
