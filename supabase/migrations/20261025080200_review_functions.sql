-- Task P4.11.01 (docs/PRD.md FR-POST-05, FR-POST-06; GUEST-05, GUEST-09): a visitor's review, sent from
-- /reservasi/<code>/ulasan behind its review link (submitReviewAction, Task P4.11.02) through svc_submit_review. A booking
-- is reviewed once, after a visit that was checked in, and its review waits as pending for the superadmin. The link
-- dies with that review: requireGuestToken refuses a review link once the booking has one (verifyGuestAccess), which
-- leaves the booking's other links alive, as bumping token_version would not. close_past_bookings already sends
-- review_invite with the 14-day link when it completes a booking (20261022120000).


-- ===== A featured review is a published one =====

-- The moderation form refuses it already (src/lib/validations/review.ts); the table now does too, for every writer.
alter table public.reviews add constraint reviews_featured_published check (not is_featured or status = 'published');


-- ===== submit_review =====

-- FR-POST-06: the booking's rw_ids and institution come from the booking, never from the form. A second review raises
-- the unique violation of reviews.booking_id, which the action reads as CONFLICT; rating, title, body and name keep
-- their CHECKs (1 to 5, at most 120, 10 to 2000, 2 to 60 characters).
create function internal.submit_review(
  p_booking_id uuid, p_rating integer, p_title text, p_body text, p_reviewer_name text, p_is_anonymous boolean
) returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  booking record;
  review_id uuid;
  previous_settings jsonb;
begin
  perform internal.require_server_caller('submit_review');
  select b.id, b.status, b.rw_ids, b.institution_name into booking from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if booking.status not in ('checked_in', 'completed')
     or not exists (select 1 from public.tickets_qr t where t.booking_id = p_booking_id and t.status = 'used') then
    raise exception 'a review follows a visit that was checked in' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  previous_settings := internal.push_settings('{"app.actor_role": "visitor"}');
  insert into public.reviews (booking_id, rw_ids, rating, title, body, reviewer_name, institution_name, is_anonymous)
  values (p_booking_id, booking.rw_ids, p_rating, nullif(btrim(p_title), ''), btrim(p_body), btrim(p_reviewer_name),
          booking.institution_name, coalesce(p_is_anonymous, false))
  returning id into review_id;
  perform internal.restore_settings(previous_settings);
  return review_id;
end;
$$;
revoke execute on function internal.submit_review(uuid, integer, text, text, text, boolean)
  from public, anon, authenticated, service_role;

create function public.svc_submit_review(
  p_booking_id uuid, p_rating integer, p_title text, p_body text, p_reviewer_name text, p_is_anonymous boolean
) returns uuid
  language sql security definer
  set search_path = ''
as $$
  select internal.submit_review(p_booking_id, p_rating, p_title, p_body, p_reviewer_name, p_is_anonymous);
$$;
revoke execute on function public.svc_submit_review(uuid, integer, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.svc_submit_review(uuid, integer, text, text, text, boolean) to service_role;
