-- Follow-up of the review of PR #106 (docs/PRD.md FR-POST-07, §8.9 enqueue_visit_reminders 09:00 WIB):
--
--   enqueue_visit_reminders  The D-1 reminder goes only to a booking that holds a seat tomorrow: a leg still
--                            `reserved` in a session of tomorrow, of a booking `paid`, or `checked_in` on an earlier
--                            leg of a combo. A booking paid after its seats were gone (its legs `released`, waiting for
--                            resolve_booking_review) or a leg released by a weather refund is no longer reminded of a
--                            seat it does not have. Each reminder is scoped by its visit day (dedupe scope
--                            `visit_date:<YYYY-MM-DD>`) and carries that day as `session_date`, so a combo visiting on
--                            two days gets one reminder before each, and the worker
--                            (src/lib/notifications/compose.ts) names that day's sessions and gate.


-- Replaces the 0004_functions.sql version.
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
