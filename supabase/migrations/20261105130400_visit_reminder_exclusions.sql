-- Follow-ups of the independent review of PR #109 (20261105130200_visit_reminder_per_day.sql; docs/PRD.md FR-POST-07,
-- §13.1 A20, A28):
--
--   enqueue_visit_reminders  A leg whose session the weather stopped (declare_weather_disruption) keeps its seat
--                            `reserved` while the guest's window is open, so it is left out until its notice is
--                            resolved (M2). A booking under review is left out too, except REVENUE_RULE_REFUSED, whose
--                            tickets stand: a CHARGEBACK booking's tickets are suspended, so no reminder (L6).
--   message_fits_state       visit_reminder_d1 fits a `checked_in` booking too, so staff can send again the reminder of
--                            a combo's second day after its first leg was checked in (L1). Every other template is
--                            unchanged.


-- ===== enqueue_visit_reminders =====

-- Replaces the 20261105130200 version.
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
      and not exists (select 1 from public.weather_notice_bookings w
                      where w.booking_leg_id = l.id and w.resolved_at is null)
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


-- ===== message_fits_state =====

-- Replaces the 20261104220200 version.
create or replace function internal.message_fits_state(p_template public.notification_template,
  p_status public.booking_status) returns boolean
  language sql immutable
  set search_path = ''
as $$
  select p_status = any (case p_template
    when 'booking_created' then array['pending_payment']
    when 'payment_reminder' then array['pending_payment']
    when 'quotation_ready' then array['quoted']
    when 'booking_link' then array['quoted', 'pending_payment', 'paid', 'checked_in']
    when 'payment_received_ticket' then array['paid', 'checked_in']
    when 'visit_reminder_d1' then array['paid', 'checked_in']
    when 'weather_disruption' then array['paid', 'checked_in']
    when 'booking_expired' then array['expired']
    when 'booking_cancelled' then array['cancelled', 'refunded']
    when 'refund_processed' then array['cancelled', 'refunded']
    when 'checked_in_thanks' then array['checked_in', 'completed']
    when 'certificate_ready' then array['checked_in', 'completed']
    when 'review_invite' then array['completed']
    else array[]::text[] end::public.booking_status[]);
$$;
