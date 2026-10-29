-- Follow-up of the review of PR #106 (20261105100200_staff_hold_and_link_caps.sql; docs/PRD.md §13.1 A23, A28;
-- docs/Security.md BOOK-14; CLAUDE.md §4 no. 3):
--
--   hold_margin_before_session  The hour a web hold stops before its first session starts, in one place. A new hold
--                               (internal.hold_deadline) and an extended one (internal.latest_hold_deadline) both read
--                               it, so the two can no longer drift apart. It stays a constant, as before: no
--                               site_settings key holds it (docs/PRD.md §8.6 lists none), and the staff copy of
--                               src/lib/copy/booking-staff.ts states it. A resolved review moves a paid booking, which
--                               holds nothing, so resolve_booking_review has no margin of its own.


-- ===== hold_margin_before_session =====

create function internal.hold_margin_before_session() returns interval
  language sql immutable
  set search_path = ''
as $$ select interval '1 hour'; $$;
revoke execute on function internal.hold_margin_before_session() from public, anon, authenticated;


-- ===== hold_deadline =====

-- Replaces the 20261022120000 version: the hour before the first session is hold_margin_before_session's. Everything
-- else is unchanged (decision of 2026-10-22, Q5).
create or replace function internal.hold_deadline(p_booker_type public.booker_type, p_pax integer,
  p_first_session_start timestamptz) returns timestamptz
  language plpgsql stable
  set search_path = ''
as $$
declare
  large_group_pax constant integer := 20;
  large_group_hold constant interval := interval '30 minutes';
  hold interval;
begin
  if p_booker_type in ('school', 'university', 'government', 'company') then
    hold := make_interval(hours => (select (s.value #>> '{}')::integer from public.site_settings s
                                    where s.key = 'booking.hold_hours_institution'));
  elsif p_pax > large_group_pax then
    hold := large_group_hold;
  else
    hold := make_interval(mins => (select (s.value #>> '{}')::integer from public.site_settings s
                                   where s.key = 'booking.hold_minutes_individual'));
  end if;
  return least(now() + hold, p_first_session_start - internal.hold_margin_before_session());
end;
$$;


-- ===== latest_hold_deadline =====

-- Replaces the 20261105100200 version: a web booking's margin is hold_margin_before_session's. An officer's booking of
-- one RW still runs until 23:59 WIB of its visit day (A23), an officer's combo until its first session starts, and no
-- hold past 14 days from now.
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
                                else internal.hold_margin_before_session() end end);
$$;
