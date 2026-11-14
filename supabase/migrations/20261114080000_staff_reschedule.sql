-- An officer's reschedule of a paid booking (decision of 2026-11-14, by the owner, on docs/PRD.md §13.1 A17's
-- "every other reschedule follows the RW's own rules, through staff"): the superadmin, or an RW admin whose RW is
-- every RW of the booking, moves one leg to another open session of the same RW. Free, at most twice per booking, and
-- only until the day before the leg's visit day. The guest asks through the kelurahan; there is no guest path. A leg
-- with an open weather notice moves through the guest's own weather right (reschedule_for_weather) instead.
--
-- The seats move as reschedule_for_weather moves them: the audit turn, the booking, the leg, then both sessions in id
-- order, released and taken in one transaction. The leg's ticket takes the new day, so the QR the PIC held before
-- fails at the gate (its HMAC names valid_on), and the ticket message goes out again with the new one.

-- The moves an officer makes for one booking.
create function internal.staff_reschedule_max() returns integer
  language sql immutable
  set search_path = ''
as $$ select 2; $$;
revoke execute on function internal.staff_reschedule_max() from public, anon, authenticated, service_role;

-- The booking_events reason of an officer's move; the hub and the dashboard name it.
create function internal.staff_reschedule_reason() returns text
  language sql immutable
  set search_path = ''
as $$ select 'staff_reschedule'; $$;
revoke execute on function internal.staff_reschedule_reason() from public, anon, authenticated, service_role;

-- Whether p_target is a session an officer may move p_leg to: open, of the leg's RW while that RW is online, not the
-- leg's own, starting at least hold_margin_before_session from now, inside booking.max_advance_days and the days the
-- package is sold for.
create function internal.is_reschedule_target(p_booking public.bookings, p_leg public.booking_legs,
  p_target public.visit_sessions) returns boolean
  language sql stable
  set search_path = ''
as $$
  select p_target.id is not null
     and p_target.status = 'open'
     and p_target.rw_id = p_leg.rw_id
     and p_target.id <> p_leg.visit_session_id
     and exists (select 1 from public.rw_units u where u.id = p_target.rw_id and u.is_active)
     and (p_target.session_date + p_target.start_time) at time zone 'Asia/Jakarta'
         > now() + internal.hold_margin_before_session()
     and p_target.session_date <= public.today_jkt()
         + (select (s.value #>> '{}')::integer from public.site_settings s where s.key = 'booking.max_advance_days')
     and not exists (select 1 from public.tour_packages p
                     where p.id = p_booking.package_id
                       and (p_target.session_date < p.valid_from or p_target.session_date > p.valid_to));
$$;
revoke execute on function internal.is_reschedule_target(public.bookings, public.booking_legs, public.visit_sessions)
  from public, anon, authenticated, service_role;

-- The refusals before any seat moves, each with its hint: the booking's state, the leg's day, the weather right, the
-- moves used and the target session.
create function internal.check_staff_reschedule(p_booking public.bookings, p_leg public.booking_legs,
  p_target public.visit_sessions) returns void
  language plpgsql stable
  set search_path = ''
as $$
begin
  if p_booking.status not in ('paid', 'checked_in') or p_booking.needs_review or p_leg.id is null
     or p_leg.status <> 'reserved'
     or not exists (select 1 from public.tickets_qr t where t.booking_leg_id = p_leg.id and t.status = 'issued') then
    raise exception 'only a paid leg that still holds its seats and its ticket is moved'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if (select s.session_date from public.visit_sessions s where s.id = p_leg.visit_session_id) <= public.today_jkt() then
    raise exception 'a leg is moved until the day before its visit' using errcode = 'P0001', hint = 'RESCHEDULE_TOO_LATE';
  end if;
  if (internal.open_weather_link(p_booking.id, p_leg.rw_id)).id is not null then
    raise exception 'this leg has an open weather notice; the PIC moves it through that'
      using errcode = 'P0001', hint = 'WEATHER_LINK_OPEN';
  end if;
  if (select count(*) from public.booking_events e
      where e.booking_id = p_booking.id and e.reason = internal.staff_reschedule_reason())
     >= internal.staff_reschedule_max() then
    raise exception 'a booking is moved by staff at most % times', internal.staff_reschedule_max()
      using errcode = 'P0001', hint = 'RESCHEDULE_LIMIT';
  end if;
  if not internal.is_reschedule_target(p_booking, p_leg, p_target) then
    raise exception 'the new session is another open session of the leg''s RW that has not started'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
end;
$$;
revoke execute on function internal.check_staff_reschedule(public.bookings, public.booking_legs, public.visit_sessions)
  from public, anon, authenticated, service_role;

-- The seats, the leg, its ticket and the booking's visit days, as reschedule_for_weather moves them.
create function internal.move_leg_to_session(p_booking_id uuid, p_leg public.booking_legs,
  p_target public.visit_sessions) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  minutes_before integer := (select (s.value #>> '{}')::integer from public.site_settings s
                             where s.key = 'checkin.grace_before_minutes');
  minutes_after integer := (select (s.value #>> '{}')::integer from public.site_settings s
                            where s.key = 'checkin.grace_after_minutes');
  step record;
begin
  for step in
    select x.session_id, x.direction from (values (p_target.id, 'take'), (p_leg.visit_session_id, 'give'))
      as x(session_id, direction)
    order by x.session_id
  loop
    if step.direction = 'take' then
      perform internal.reserve_session_quota(step.session_id, p_leg.pax_count);
    else
      update public.visit_sessions set reserved_pax = greatest(reserved_pax - p_leg.pax_count, 0)
      where id = step.session_id;
    end if;
  end loop;
  update public.booking_legs set visit_session_id = p_target.id, quota_reserved_at = now() where id = p_leg.id;
  update public.tickets_qr t
  set visit_session_id = p_target.id, valid_on = p_target.session_date,
      valid_from = (p_target.session_date + p_target.start_time) at time zone 'Asia/Jakarta'
                   - make_interval(mins => minutes_before),
      valid_until = (p_target.session_date + p_target.end_time) at time zone 'Asia/Jakarta'
                    + make_interval(mins => minutes_after)
  where t.booking_leg_id = p_leg.id and t.status = 'issued';
  update public.bookings b
  set visit_date = days.first_day, visit_date_end = days.last_day
  from (select min(s.session_date) as first_day, max(s.session_date) as last_day
        from public.booking_legs l join public.visit_sessions s on s.id = l.visit_session_id
        where l.booking_id = p_booking_id) as days
  where b.id = p_booking_id;
end;
$$;
revoke execute on function internal.move_leg_to_session(uuid, public.booking_legs, public.visit_sessions)
  from public, anon, authenticated, service_role;

-- The staff entry point: the leg is the booking's leg of the new session's RW. The reason lands on the timeline and the
-- audit log. Hints: STATE_INVALID, RESCHEDULE_TOO_LATE, WEATHER_LINK_OPEN, RESCHEDULE_LIMIT, QUOTA_UNAVAILABLE.
create function public.reschedule_booking(p_booking_id uuid, p_session_id uuid, p_reason text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  booking public.bookings := internal.require_booking_staff(p_booking_id);
  target public.visit_sessions;
  leg public.booking_legs;
  moves_done integer;
  previous_settings jsonb;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 300 then
    raise exception 'a reschedule names its reason in 10 to 300 characters' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  select * into booking from public.bookings b where b.id = booking.id for update;
  select * into target from public.visit_sessions s where s.id = p_session_id;
  select * into leg from public.booking_legs l where l.booking_id = booking.id and l.rw_id = target.rw_id for update;
  perform internal.check_staff_reschedule(booking, leg, target);
  moves_done := (select count(*) from public.booking_events e
                 where e.booking_id = booking.id and e.reason = internal.staff_reschedule_reason()) + 1;

  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || internal.document_actor(auth.uid()));
  perform internal.move_leg_to_session(booking.id, leg, target);
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  values (booking.id, booking.status, booking.status, 'admin', auth.uid(), internal.staff_reschedule_reason(),
          jsonb_build_object('moves', moves_done, 'leg_id', leg.id, 'from', leg.visit_session_id, 'to', target.id,
                             'visit_date', target.session_date, 'reason', btrim(p_reason)));
  perform internal.log_audit('bookings.rescheduled', 'bookings', booking.id::text,
    jsonb_build_object('leg_id', leg.id, 'from', leg.visit_session_id, 'to', target.id, 'moves', moves_done,
                       'reason', btrim(p_reason)));
  perform internal.queue_booking_message(booking.id, 'payment_received_ticket',
    array['whatsapp', 'email']::public.notification_channel[], '{"link_scope": "view"}',
    format('staff_move_%s', moves_done));
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('result', 'rescheduled', 'visit_date', target.session_date, 'moves', moves_done,
                            'moves_left', internal.staff_reschedule_max() - moves_done);
end;
$$;
revoke execute on function public.reschedule_booking(uuid, uuid, text) from public, anon, service_role;
grant execute on function public.reschedule_booking(uuid, uuid, text) to authenticated;
