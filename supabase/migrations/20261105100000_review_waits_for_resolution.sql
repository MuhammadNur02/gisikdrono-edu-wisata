-- Follow-ups of PR #102 (staff booking actions), the booking under review (docs/PRD.md §13.1 A28; CLAUDE.md §7.1):
--
--   close_past_bookings        A paid booking whose seats were gone when its late payment settled
--                              (PAID_AFTER_EXPIRY_NO_QUOTA) waits for resolve_booking_review; its visit day passing
--                              makes it no no_show, since it never held a seat to miss.
--   move_released_legs         A move takes the sessions a new booking of the package could take: internal.booking_sessions
--                              checks the RW is online and the package's valid_from / valid_to, as the web and the
--                              officer's path do.
--   resolve_booking_review     Its two outcomes are written by internal.move_booking_under_review and
--                              internal.refund_booking_under_review, so the public RPC keeps the checks, the event and the
--                              audit row and writes no booking column itself.


-- ===== close_past_bookings =====

-- Replaces the 20261104080200 version: a paid booking under review for its missing seats is left to the superadmin's
-- resolution. Everything else is unchanged.
create or replace function internal.close_past_bookings() returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  past record;
  next_status public.booking_status;
  closed_count integer := 0;
begin
  perform internal.take_audit_turn();
  previous_settings := internal.begin_scheduled_job();
  for past in
    select b.id, b.status
    from public.bookings b
    where b.status in ('checked_in', 'paid') and b.visit_date_end < public.today_jkt()
      -- A booking whose weather window is still unanswered waits for the weather sweep (final review of PR #69, L-2).
      and not exists (select 1 from public.weather_notice_bookings w
                      where w.booking_id = b.id and w.resolved_at is null)
      -- Follow-up of PR #102 (1): a booking paid after its seats were gone waits for resolve_booking_review.
      and not (b.status = 'paid' and b.needs_review and b.review_reason = 'PAID_AFTER_EXPIRY_NO_QUOTA')
    order by b.id
    for update skip locked
  loop
    if past.status = 'checked_in' then
      next_status := 'completed';
      update public.bookings set status = next_status, completed_at = now() where id = past.id;
      perform internal.enqueue_notification(past.id, 'review_invite', 'whatsapp', '{"link_scope": "review"}');
      perform internal.enqueue_notification(past.id, 'review_invite', 'email', '{"link_scope": "review"}');
    else
      next_status := 'no_show';
      update public.bookings set status = next_status where id = past.id;
    end if;
    insert into public.booking_events (booking_id, from_status, to_status, actor_type)
    values (past.id, past.status, next_status, 'cron');
    closed_count := closed_count + 1;
  end loop;

  update public.tickets_qr set status = 'expired' where status = 'issued' and valid_until < now();
  perform internal.restore_settings(previous_settings);
  return closed_count;
end;
$$;


-- ===== move_released_legs =====

-- Replaces the 20261104220300 version (follow-up of PR #102, 4): the new sessions pass internal.booking_sessions with
-- the earliest start now, so each is open, of an online RW, one for each RW the package visits, inside the package's
-- valid days and booking.max_advance_days, and not started; every leg is still released and moves to its own RW's
-- session. The seats are reserved in session id order, all or none (QUOTA_UNAVAILABLE otherwise, and nothing moves).
create or replace function internal.move_released_legs(p_booking public.bookings, p_session_ids uuid[]) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  step record;
begin
  perform 1 from public.booking_legs l where l.booking_id = p_booking.id order by l.id for update;
  if cardinality(coalesce(p_session_ids, '{}')) <> (select count(*) from public.booking_legs l
                                                    where l.booking_id = p_booking.id)
     or exists (select 1 from public.booking_legs l
                where l.booking_id = p_booking.id
                  and (l.status <> 'released'
                       or (select count(*) from public.visit_sessions s
                           where s.id = any (p_session_ids) and s.rw_id = l.rw_id) <> 1)) then
    raise exception 'each leg moves to an open session of its RW that has not started'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  perform 1 from internal.booking_sessions(p_booking.package_id, p_session_ids, now(), null);
  for step in
    select l.id as leg_id, l.pax_count, s.id as session_id
    from public.booking_legs l
    join public.visit_sessions s on s.id = any (p_session_ids) and s.rw_id = l.rw_id
    where l.booking_id = p_booking.id
    order by s.id
  loop
    perform internal.reserve_session_quota(step.session_id, step.pax_count);
    update public.booking_legs
    set visit_session_id = step.session_id, status = 'reserved', quota_reserved_at = now(), quota_released_at = null
    where id = step.leg_id;
  end loop;
  update public.bookings b
  set visit_date = days.first_day, visit_date_end = days.last_day, needs_review = false, review_reason = null
  from (select min(s.session_date) as first_day, max(s.session_date) as last_day
        from public.booking_legs l join public.visit_sessions s on s.id = l.visit_session_id
        where l.booking_id = p_booking.id) as days
  where b.id = p_booking.id;
end;
$$;


-- ===== resolve_booking_review: its outcomes in internal.* =====

-- A28 (a): the legs move, the tickets of the new sessions are issued and the PIC hears of them.
create function internal.move_booking_under_review(p_booking public.bookings, p_session_ids uuid[]) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  moved public.bookings;
begin
  perform internal.move_released_legs(p_booking, p_session_ids);
  perform internal.issue_booking_tickets(p_booking.id);
  perform internal.enqueue_notification(p_booking.id, 'payment_received_ticket', 'whatsapp', '{"link_scope": "view"}',
                                        'review_moved');
  perform internal.enqueue_notification(p_booking.id, 'payment_received_ticket', 'email', '{"link_scope": "view"}',
                                        'review_moved');
  select * into moved from public.bookings b where b.id = p_booking.id;
  return jsonb_build_object('result', 'moved', 'visit_date', moved.visit_date);
end;
$$;

-- A28 (b): out of review, the whole payment goes back through cancel_paid_booking.
create function internal.refund_booking_under_review(p_booking public.bookings, p_actor_id uuid, p_reason text)
  returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  booking public.bookings;
  outcome jsonb;
begin
  update public.bookings set needs_review = false, review_reason = null where id = p_booking.id
  returning * into booking;
  outcome := internal.cancel_paid_booking(booking, p_actor_id, p_reason, 'cancellation',
                                          internal.full_refund_quote(booking), 'admin');
  perform internal.enqueue_notification(booking.id, 'booking_cancelled', 'whatsapp', '{}');
  perform internal.enqueue_notification(booking.id, 'booking_cancelled', 'email', '{}');
  return outcome;
end;
$$;
revoke execute on function internal.move_booking_under_review(public.bookings, uuid[]),
  internal.refund_booking_under_review(public.bookings, uuid, text)
  from public, anon, authenticated, service_role;

-- Replaces the 20261104220300 version: the outcomes are the two functions above; the checks, the event and the audit
-- row are unchanged.
create or replace function public.resolve_booking_review(p_booking_id uuid, p_resolution text, p_reason text,
  p_session_ids uuid[] default null, p_key_id text default null) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  booking public.bookings;
  outcome jsonb;
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'only the superadmin at AAL2 resolves a booking under review' using errcode = '42501';
  end if;
  if not public.fresh_totp() then
    raise exception 'confirm with a fresh authenticator code first' using errcode = '42501', hint = 'FRESH_TOTP';
  end if;
  if p_resolution is null or p_resolution not in ('move', 'refund')
     or length(btrim(coalesce(p_reason, ''))) not between 10 and 300 then
    raise exception 'a resolution is move or refund, with a reason of 10 to 300 characters' using errcode = '22023';
  end if;
  if p_resolution = 'move' and not exists (select 1 from public.site_settings s
                                          where s.key = 'qr.signing_kids' and s.value ? coalesce(p_key_id, '')) then
    raise exception 'the QR key id is not one tickets are signed with' using errcode = 'P0001', hint = 'QR_KEY_UNKNOWN';
  end if;
  perform internal.take_audit_turn();
  select * into booking from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if booking.status <> 'paid' or not booking.needs_review
     or booking.review_reason is distinct from 'PAID_AFTER_EXPIRY_NO_QUOTA' then
    raise exception 'booking % is not a paid booking waiting for seats', booking.booking_code
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || case when p_resolution = 'move' then jsonb_build_object('app.qr_key_id', p_key_id) else '{}'::jsonb end
    || internal.document_actor(auth.uid()));
  perform internal.require_booking_ledger(booking);
  if p_resolution = 'move' then
    outcome := internal.move_booking_under_review(booking, p_session_ids);
  else
    outcome := internal.refund_booking_under_review(booking, auth.uid(), btrim(p_reason));
  end if;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  select b.id, 'paid', b.status, 'admin', auth.uid(), 'review_resolved',
         jsonb_build_object('resolution', p_resolution, 'reason', btrim(p_reason))
  from public.bookings b where b.id = booking.id;
  perform internal.log_audit('bookings.review_resolved', 'bookings', booking.id::text,
    jsonb_build_object('resolution', p_resolution, 'reason', btrim(p_reason), 'sessions', to_jsonb(p_session_ids)));
  perform internal.restore_settings(previous_settings);
  return outcome;
end;
$$;
