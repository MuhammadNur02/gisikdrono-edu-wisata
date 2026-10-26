-- Review of PR #76, F-76-7: the booking window refusal of internal.require_booking_pii_access gets a hint of its own,
-- OUTSIDE_WINDOW, so the dashboard tells an officer that the visit lies outside the window only when that is the
-- reason, and keeps its plain FORBIDDEN text for a booking of another RW or a session without its authenticator.
-- Replaces the 0004 version; everything else is unchanged. (The window is a visit at most 30 days ahead and at most
-- 7 days past; the old message's wording is corrected with it.)

create or replace function internal.require_booking_pii_access(p_booking_id uuid) returns smallint[]
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  booking record;
begin
  if not (public.is_staff() and public.aal2()) then
    raise exception 'personal data is shown to staff with a verified authenticator only' using errcode = '42501';
  end if;
  select b.rw_ids, b.visit_date, b.visit_date_end into booking from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if not (public.is_superadmin() or public.owns_any_rw(booking.rw_ids)) then
    raise exception 'this booking belongs to another RW' using errcode = '42501';
  end if;
  if booking.visit_date_end < public.today_jkt() - 7 or booking.visit_date > public.today_jkt() + 30 then
    raise exception 'personal data is shown only from 30 days before to 7 days after the visit'
      using errcode = '42501', hint = 'OUTSIDE_WINDOW';
  end if;
  return booking.rw_ids;
end;
$$;
