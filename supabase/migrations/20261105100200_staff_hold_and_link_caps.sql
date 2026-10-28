-- Follow-ups of PR #102 (staff booking actions), the hold and the PIC's messages (docs/PRD.md §13.1 A23, A28;
-- docs/Security.md BOOK-14, RL; CLAUDE.md §7.1):
--
--   latest_hold_deadline        A web booking's hold is extended at most until an hour before its first session, as
--                               internal.hold_deadline sets every web hold; the 14 days and the officer's rules stay.
--   send_admin_booking_link     Asked at most 5 times an hour per booking (RATE_LIMITED beyond).
--   request_notification_resend Sent again at most 10 times a day per booking (RATE_LIMITED beyond).
--   reactivate_booking          Its status write is internal.reactivate_hold's.
--   payments_housekeeping       admin_hold_without_link waits 30 minutes from the booking's creation, and counts the
--                               pay link as gone only once its message was sent; the alert closes then.


-- ===== latest_hold_deadline =====

-- Replaces the 20261104220200 version: the latest a hold may run is 14 days from now and, for a web booking, an hour
-- before its first session starts (the margin of internal.hold_deadline); an officer's booking of one RW still runs
-- until 23:59 WIB of its visit day (A23), an officer's combo until its first session starts.
create or replace function internal.latest_hold_deadline(p_booking public.bookings) returns timestamptz
  language sql stable
  set search_path = ''
as $$
  select least(now() + interval '14 days',
               case when p_booking.channel = 'admin' and cardinality(p_booking.rw_ids) = 1
                    then internal.cash_deadline(p_booking.visit_date_end)
                    else (select min((s.session_date + s.start_time) at time zone 'Asia/Jakarta')
                          from public.booking_legs l join public.visit_sessions s on s.id = l.visit_session_id
                          where l.booking_id = p_booking.id)
                         - case when p_booking.channel = 'admin' then interval '0 hours'
                                else interval '1 hour' end end);
$$;


-- ===== send_admin_booking_link =====

-- Replaces the 20261104220100 version (follow-up of PR #102, 6): the link is asked for at most link_cap times an hour
-- per booking, counted once the booking is found in the officer's scope (so an officer of another RW learns nothing of
-- it) and kept only by a call that goes through. Everything else is unchanged.
create or replace function public.send_admin_booking_link(p_booking_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  link_cap constant integer := 5;
  link_window constant integer := 3600;
  previous_settings jsonb;
  booking public.bookings;
begin
  if not (public.is_staff() and public.aal2()) then
    raise exception 'only an officer at AAL2 sends a pay link' using errcode = '42501';
  end if;
  perform internal.take_audit_turn();
  select * into booking from public.bookings b where b.id = p_booking_id for update;
  -- Every RW of the booking is the officer's (delta review of PR #91, L-5); a combo is the superadmin's.
  if not found or not (public.is_superadmin()
                       or (public.is_admin_rw() and booking.rw_ids <@ array[public.app_rw_id()])) then
    raise exception 'booking % is not in this officer''s RW', p_booking_id using errcode = 'P0002';
  end if;
  if not internal.rate_limit_hit('admin_pay_link:booking:' || booking.id::text, link_cap, link_window) then
    raise exception 'the pay link of this booking was asked for % times this hour', link_cap
      using errcode = 'P0001', hint = 'RATE_LIMITED';
  end if;
  if booking.channel <> 'admin' or booking.status <> 'pending_payment' or booking.expires_at <= now() then
    raise exception 'this booking takes no pay link now' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || internal.document_actor(auth.uid()));
  if internal.queue_admin_pay_link(booking.id) > 0 then
    insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason)
    values (booking.id, booking.status, booking.status, 'admin', auth.uid(), 'admin_pay_link_sent');
  end if;
  perform internal.restore_settings(previous_settings);
end;
$$;


-- ===== request_notification_resend =====

-- Replaces the 20261104220200 version (follow-up of PR #102, 6): every resend is a new message to the PIC, so a
-- booking takes at most resend_cap of them a day. Everything else is unchanged.
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


-- ===== reactivate_booking =====

-- The seats of an expired hold reserved again, the booking unpaid again until p_deadline, and the PIC's pay link as a
-- new message rather than the one the first hold sent (QUOTA_UNAVAILABLE when the seats are gone).
create function internal.reactivate_hold(p_booking public.bookings, p_deadline timestamptz, p_actor_id uuid)
  returns void
  language plpgsql
  set search_path = ''
as $$
begin
  if not internal.revive_expired_hold(p_booking.id) then
    raise exception 'the seats of booking % are gone', p_booking.booking_code
      using errcode = 'P0001', hint = 'QUOTA_UNAVAILABLE';
  end if;
  update public.bookings set status = 'pending_payment', expires_at = p_deadline, expired_at = null
  where id = p_booking.id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  values (p_booking.id, 'expired', 'pending_payment', 'admin', p_actor_id, 'reactivated',
          jsonb_build_object('expires_at', p_deadline));
  perform internal.enqueue_notification(p_booking.id, 'booking_created', 'whatsapp', '{"link_scope": "manage"}',
                                        'reactivated:' || now());
  perform internal.enqueue_notification(p_booking.id, 'booking_created', 'email', '{"link_scope": "manage"}',
                                        'reactivated:' || now());
end;
$$;
revoke execute on function internal.reactivate_hold(public.bookings, timestamptz, uuid)
  from public, anon, authenticated, service_role;

-- Replaces the 20261104220200 version (follow-up of PR #102, 8): the checks are unchanged; the write is
-- internal.reactivate_hold's.
create or replace function public.reactivate_booking(p_booking_id uuid) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  min_hold_left constant interval := interval '5 minutes';
  booking public.bookings := internal.require_booking_staff(p_booking_id);
  previous_settings jsonb;
  deadline timestamptz;
begin
  perform internal.take_audit_turn();
  select * into booking from public.bookings b where b.id = booking.id for update;
  if booking.status <> 'expired' or booking.needs_review
     or exists (select 1 from public.payments p where p.booking_id = booking.id
                and p.status in ('initiated', 'pending', 'needs_review', 'settled')) then
    raise exception 'only an expired, unpaid booking is held again' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  -- Review of PR #102, HIGH 1 and L5: a hold that lapsed (every leg released), not a quotation that lapsed with its
  -- legs unreserved, which never passed the phone code and the reservation; of a proven phone; not anonymised.
  if not internal.is_lapsed_hold(booking) then
    raise exception 'only a lapsed hold of a verified phone is held again' using errcode = 'P0001',
      hint = 'STATE_INVALID';
  end if;
  deadline := internal.renewed_hold_deadline(booking);
  if deadline is null or deadline < now() + min_hold_left then
    raise exception 'too little time is left to pay before the visit' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1', 'app.hold_extension', '1')
    || internal.document_actor(auth.uid()));
  perform internal.reactivate_hold(booking, deadline, auth.uid());
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('booking_id', booking.id, 'expires_at', deadline);
end;
$$;


-- ===== payments_housekeeping =====

-- Replaces the 20261104220300 version (follow-up of PR #102, 5): an officer's hold without its pay link is raised
-- without_link_grace after it was made at the earliest, so an officer still at the cash step is not flagged, and a
-- link counts as gone only once its message was sent (a link queued but failed or dead still raises); the alert closes
-- once the booking is no longer unpaid or a link message was sent. Everything else is unchanged.
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
      and not exists (select 1 from public.notifications n
                      where n.booking_id = b.id and n.template = 'payment_reminder')
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
