-- Follow-up of the independent review of PR #109, L3 (decision of the coordinator; docs/PRD.md §13.1 A28): a booking
-- resolved by a move takes only sessions that start at least internal.hold_margin_before_session() from now, the hour
-- a web hold keeps before its first session, since a visitor told of the move cannot reach a session that starts in
-- two minutes. This corrects the header of 20261105130000_hold_margin.sql, which said the review move had no margin;
-- that applied migration is left as it is (CLAUDE.md §6.4).


-- ===== move_released_legs =====

-- Replaces the 20261105100000 version: the earliest start is now() + hold_margin_before_session() instead of now().
-- Everything else is unchanged.
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
  perform 1 from internal.booking_sessions(p_booking.package_id, p_session_ids,
                                           now() + internal.hold_margin_before_session(), null);
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
