-- Staff send a first payment reminder, and a refused resend says why (docs/PRD.md FR-ADMIN-17, FR-B2B-10; docs/Security.md
-- RL, BOOK-14; CLAUDE.md §7.1):
--
--   request_notification_resend  A payment_reminder the booking never had on that channel goes out as a first one, with
--                                the poll job's own parameters, when the booking still waits for its payment: unpaid,
--                                not under review, its deadline ahead and, for an officer's hold, its pay link already
--                                sent (PAY_LINK_NOT_SENT otherwise), the job's own rules. Any other message the booking
--                                never had is refused with its own hint, NEVER_SENT, instead of STATE_INVALID.
--                                Everything else is unchanged: the 10 a day, the outbox's rules (NOT_SENT), the audit,
--                                which now says whether it was a first send.
--   payments_housekeeping        The automatic reminder close to the deadline still goes out after a staff reminder
--                                sent days before. It is skipped only when the job already queued its own, or when a
--                                reminder was queued inside the job's window (the 6 hours before the reminder is due),
--                                which then counts as the automatic one. Everything else is unchanged.


-- ===== request_notification_resend =====

-- Replaces the 20261105140200 version. A first reminder's dedupe scope, first_by_staff, differs from the poll job's
-- (which has none), so the job's own reminder can still be queued after it.
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
  -- The poll job's parameters and its link_sent statuses (internal.payments_housekeeping, 20261105100200).
  first_reminder_params constant jsonb := '{"link_scope": "pay"}';
  link_sent constant public.notification_status[] := array['sent', 'delivered', 'read'];
  booking public.bookings := internal.require_booking_staff(p_booking_id);
  previous_settings jsonb;
  last_params jsonb;
  sent_before integer;
  is_first_send boolean;
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
  is_first_send := last_params is null;
  if is_first_send and p_template <> 'payment_reminder' then
    raise exception 'booking % never had this message', booking.booking_code
      using errcode = 'P0001', hint = 'NEVER_SENT';
  end if;
  -- A first reminder goes only to a booking the poll job would remind, so it never points the PIC at a link they do
  -- not have (delta review of PR #91, L-C).
  if is_first_send and (booking.status <> 'pending_payment' or booking.needs_review
                        or booking.expires_at is null or booking.expires_at <= now()) then
    raise exception 'booking % is not waiting for its payment', booking.booking_code
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if is_first_send and booking.channel = 'admin'
     and not exists (select 1 from public.notifications n
                     where n.booking_id = booking.id and n.template = 'booking_created'
                       and n.status = any (link_sent)) then
    raise exception 'the pay link of booking % was not sent yet', booking.booking_code
      using errcode = 'P0001', hint = 'PAY_LINK_NOT_SENT';
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
  queued := internal.enqueue_notification(booking.id, p_template, p_channel,
    coalesce(last_params, first_reminder_params),
    case when is_first_send then 'first_by_staff' else 'resend:' || sent_before end);
  -- The outbox's own rules still hold: a channel switched off, an unverified number, the cap on emails before payment.
  if queued is null then
    raise exception 'this message cannot go to the PIC now' using errcode = 'P0001', hint = 'NOT_SENT';
  end if;
  perform internal.log_audit('notifications.resend', 'bookings', booking.id::text,
                             jsonb_build_object('template', p_template, 'channel', p_channel, 'notification_id', queued,
                                                'first_send', is_first_send));
  perform internal.restore_settings(previous_settings);
  return queued;
end;
$$;
revoke execute on function
  public.request_notification_resend(uuid, public.notification_template, public.notification_channel)
  from public, anon, service_role;
grant execute on function
  public.request_notification_resend(uuid, public.notification_template, public.notification_channel)
  to authenticated;


-- ===== payments_housekeeping =====

-- Replaces the 20261105100200 version: a hold is reminded unless the job queued its own reminder (the one without a
-- dedupe scope, internal.enqueue_notification's `booking:<id>:payment_reminder:<channel>`) or a reminder was queued
-- inside the window. Everything else is unchanged.
create or replace function internal.payments_housekeeping() returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  reminder_ahead constant interval := interval '6 hours';
  unpaid_too_long constant interval := interval '7 days';
  without_link_after constant interval := interval '3 hours';
  without_link_grace constant interval := interval '30 minutes';
  link_sent constant public.notification_status[] := array['sent', 'delivered', 'read'];
  previous_settings jsonb;
  orphan record;
  hold record;
  suspended integer := 0;
  reminded integer := 0;
begin
  perform internal.require_server_caller('payments_housekeeping');
  perform internal.take_audit_turn();
  previous_settings := internal.begin_scheduled_job();
  for orphan in
    select distinct t.booking_id from public.tickets_qr t join public.bookings b on b.id = t.booking_id
    where t.status = 'issued' and t.valid_until > now() and b.status not in ('paid', 'checked_in')
    order by t.booking_id
  loop
    suspended := suspended + internal.suspend_booking_tickets(orphan.booking_id, 'booking_not_paid');
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('tickets_without_payment', 'critical', 'tickets_without_payment:' || orphan.booking_id,
            'Tiket masih berlaku untuk pesanan yang tidak lunas; tiketnya ditangguhkan',
            jsonb_build_object('booking_id', orphan.booking_id))
    on conflict (fingerprint) where acknowledged_at is null do update
    set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1, notified_at = null;
  end loop;

  for hold in
    select b.id from public.bookings b
    cross join lateral (select min((s.session_date + s.start_time) at time zone 'Asia/Jakarta') as first_start
                        from public.booking_legs l join public.visit_sessions s on s.id = l.visit_session_id
                        where l.booking_id = b.id) as legs
    cross join lateral (select case when b.channel = 'admin' then least(b.expires_at, legs.first_start)
                                    else b.expires_at end as remind_by) as due
    where b.status = 'pending_payment' and not b.needs_review
      and (b.channel = 'admin' or b.booker_type in ('school', 'university', 'government', 'company'))
      and b.expires_at > now() and due.remind_by > now() and due.remind_by <= now() + reminder_ahead
      -- A staff reminder sent days before still leaves the PIC a reminder close to the deadline; one queued inside the
      -- window is that reminder, so the PIC is not reminded twice within a few hours.
      and not exists (select 1 from public.notifications n
                      where n.booking_id = b.id and n.template = 'payment_reminder'
                        and (n.dedupe_key = format('booking:%s:payment_reminder:%s', b.id, n.channel)
                             or n.created_at >= due.remind_by - reminder_ahead))
      -- Delta review of PR #91, L-C: an officer's hold is reminded only after its pay link went out.
      and (b.channel <> 'admin'
           or exists (select 1 from public.notifications n
                      where n.booking_id = b.id and n.template = 'booking_created'
                        and n.status = any (link_sent)))
    order by due.remind_by
  loop
    perform internal.enqueue_notification(hold.id, 'payment_reminder', 'whatsapp', '{"link_scope": "pay"}');
    perform internal.enqueue_notification(hold.id, 'payment_reminder', 'email', '{"link_scope": "pay"}');
    reminded := reminded + 1;
  end loop;
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  select 'admin_hold_unpaid_long', 'medium', 'admin_hold_unpaid_long:' || b.id,
         'Pemesanan petugas belum dibayar lebih dari 7 hari: ' || b.booking_code,
         jsonb_build_object('booking_id', b.id, 'rw_ids', b.rw_ids, 'created_by', b.created_by)
  from public.bookings b
  where b.channel = 'admin' and b.status = 'pending_payment' and b.created_at < now() - unpaid_too_long
    and not exists (select 1 from public.security_alerts a where a.fingerprint = 'admin_hold_unpaid_long:' || b.id)
  on conflict (fingerprint) where acknowledged_at is null do nothing;
  -- Follow-up of PR #91 (b), and of PR #102 (5): an officer's hold left without its cash and without a sent pay link
  -- is raised three hours on, or from the day before the visit, never in its first 30 minutes.
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  select 'admin_hold_without_link', 'medium', 'admin_hold_without_link:' || b.id,
         'Pemesanan petugas belum dibayar dan belum dikirimi tautan pembayaran: ' || b.booking_code,
         jsonb_build_object('booking_id', b.id, 'rw_ids', b.rw_ids, 'created_by', b.created_by)
  from public.bookings b
  where b.channel = 'admin' and b.status = 'pending_payment' and b.created_at < now() - without_link_grace
    and (b.created_at < now() - without_link_after or b.visit_date <= public.today_jkt() + 1)
    and not exists (select 1 from public.notifications n
                    where n.booking_id = b.id and n.template = 'booking_created' and n.status = any (link_sent))
    and not exists (select 1 from public.security_alerts a where a.fingerprint = 'admin_hold_without_link:' || b.id)
  on conflict (fingerprint) where acknowledged_at is null do nothing;
  update public.security_alerts a
  set acknowledged_at = now(), details = a.details || jsonb_build_object('closed', 'link_sent_or_settled')
  from public.bookings b
  where a.rule = 'admin_hold_without_link' and a.acknowledged_at is null
    and a.fingerprint = 'admin_hold_without_link:' || b.id
    and (b.status <> 'pending_payment'
         or exists (select 1 from public.notifications n
                    where n.booking_id = b.id and n.template = 'booking_created' and n.status = any (link_sent)));
  -- L-D: the alert of a booking that is no longer waiting for its payment closes by itself.
  update public.security_alerts a
  set acknowledged_at = now(), details = a.details || jsonb_build_object('closed', 'no_longer_unpaid')
  from public.bookings b
  where a.rule = 'admin_hold_unpaid_long' and a.acknowledged_at is null
    and a.fingerprint = 'admin_hold_unpaid_long:' || b.id and b.status <> 'pending_payment';
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('suspended', suspended, 'reminded', reminded);
end;
$$;
