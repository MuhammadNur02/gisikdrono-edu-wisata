-- Task P4.3.08, the rest after P4.3.10 (docs/PRD.md §8.7, §9; FR-ADMIN-05; AUTH-11, AZ-14): the booking screen's staff
-- steps, each from the staff member's own session at AAL2, the actor auth.uid() and the scope checked again here.
--
--   cancel_booking              Staff in scope cancel an unpaid booking; a paid one is the superadmin's, with a fresh
--                               code and a reason category (docs/PRD.md §13.1 A28): at the guest's request on the visit
--                               terms' refund (A16), from the kelurahan or RW in full, as cancellation_preview showed.
--                               The logic is #69's internal.cancel_booking, moved into internal.apply_cancellation so
--                               that the staff entry point reaches it without the server-only guard; the visitor's path
--                               is unchanged.
--   extend_booking_hold         A running hold moved later, at most 14 days from now and before the first session
--                               starts (an officer's booking of one RW: before 23:59 WIB of its visit day, A23).
--   reactivate_booking          An expired, unpaid booking held again, its seats reserved again (QUOTA_UNAVAILABLE when
--                               they are gone), with a new deadline by the same rules as a new hold and its pay link.
--   request_notification_resend A message the booking already had, queued again as a new outbox row.
-- resolve_booking_review and the superadmin's manual transfer are in 20261104220300.


-- ===== cancel_booking: one cancellation for the visitor and the staff =====

-- A28 (2026-10-28, owner-delegated): the whole payment back, with no visit-terms schedule, when the visitor is not at
-- fault: a cancellation from the kelurahan or RW, or a late settlement whose session filled (resolve_booking_review).
create function internal.full_refund_quote(p_booking public.bookings) returns jsonb
  language plpgsql stable
  set search_path = ''
as $$
declare
  payment public.payments := internal.settled_payment_of(p_booking.id);
begin
  if p_booking.status <> 'paid' or payment.id is null or payment.gross_amount <> p_booking.total_amount then
    raise exception 'booking % has no settled payment of its total', p_booking.id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  -- Review of PR #102, L8: as refund_quote, a visit that has passed is not refunded here.
  if p_booking.visit_date < public.today_jkt() then
    raise exception 'the visit of booking % has passed', p_booking.id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return jsonb_build_object('kind', 'cancellation', 'days_before', p_booking.visit_date - public.today_jkt(),
    'refund_pct', 100, 'package_refund', p_booking.subtotal_package - p_booking.discount_amount,
    'addon_refund', p_booking.subtotal_addons, 'fee_amount', 0, 'amount', payment.gross_amount, 'retained', 0,
    'paid', payment.gross_amount, 'method', payment.method, 'payment_id', payment.id, 'order_id', payment.order_id);
end;
$$;
revoke execute on function internal.full_refund_quote(public.bookings) from public, anon, authenticated;

create function internal.apply_cancellation(p_booking_id uuid, p_actor_id uuid, p_reason text,
  p_kind public.refund_request_kind, p_expected_amount bigint, p_expected_pct smallint,
  p_is_full_refund boolean default false) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  booking public.bookings;
  quote jsonb;
  outcome jsonb;
begin
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || internal.document_actor(p_actor_id));
  select * into booking from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if booking.needs_review then
    raise exception 'a booking under review is not cancelled here' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if booking.status in ('quoted', 'pending_payment') and p_kind = 'cancellation' then
    if p_expected_amount is distinct from 0 or p_expected_pct is not null then
      raise exception 'an unpaid booking gives nothing back' using errcode = 'P0001', hint = 'PRICE_MISMATCH';
    end if;
    outcome := internal.cancel_unpaid_booking(booking, p_actor_id, p_reason);
  elsif booking.status = 'checked_in' and p_kind = 'weather' then
    quote := internal.refund_quote(booking, p_kind);
    if (quote ->> 'amount')::bigint is distinct from p_expected_amount or p_expected_pct is not null then
      raise exception 'the refund of booking % is now %, not the % previewed', booking.id, quote ->> 'amount',
        p_expected_amount using errcode = 'P0001', hint = 'PRICE_MISMATCH';
    end if;
    outcome := internal.refund_weather_leg(booking, p_actor_id, quote,
                                           case when p_actor_id is null then 'visitor' else 'admin' end);
  elsif booking.status = 'paid' then
    quote := case when p_is_full_refund then internal.full_refund_quote(booking)
                  else internal.refund_quote(booking, p_kind) end;
    -- The visitor confirms the figures the hub previewed; when the quote has moved since (the day turned, a fee was
    -- set), nothing happens and PRICE_MISMATCH asks them to look again (review of PR #69, M3).
    if (quote ->> 'amount')::bigint is distinct from p_expected_amount
       or (quote ->> 'refund_pct')::smallint is distinct from p_expected_pct then
      raise exception 'the refund of booking % is now %, not the % previewed', booking.id, quote ->> 'amount',
        p_expected_amount using errcode = 'P0001', hint = 'PRICE_MISMATCH';
    end if;
    outcome := internal.cancel_paid_booking(booking, p_actor_id, p_reason, p_kind, quote,
                                            case when p_actor_id is null then 'visitor' else 'admin' end);
  else
    raise exception 'a % booking is not cancelled here', booking.status using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if booking.status <> 'checked_in' then
    perform internal.enqueue_notification(booking.id, 'booking_cancelled', 'whatsapp', '{}');
    perform internal.enqueue_notification(booking.id, 'booking_cancelled', 'email', '{}');
  end if;
  perform internal.restore_settings(previous_settings);
  return outcome;
end;
$$;

-- Replaces the 20261104080200 version: the server-only guard, then the same cancellation.
create or replace function internal.cancel_booking(p_booking_id uuid, p_actor_id uuid, p_reason text,
  p_kind public.refund_request_kind, p_expected_amount bigint, p_expected_pct smallint) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.require_server_caller('cancel_booking');
  return internal.apply_cancellation(p_booking_id, p_actor_id, p_reason, p_kind, p_expected_amount, p_expected_pct);
end;
$$;
revoke execute on function internal.apply_cancellation(uuid, uuid, text, public.refund_request_kind, bigint, smallint,
  boolean) from public, anon, authenticated;

-- A28: why staff cancel a paid booking, which decides its refund.
create function internal.staff_cancellation_is_full(p_category text) returns boolean
  language plpgsql immutable
  set search_path = ''
as $$
begin
  if p_category is null or p_category not in ('guest_request', 'kelurahan') then
    raise exception 'a paid booking''s cancellation names its reason category' using errcode = '22023';
  end if;
  return p_category = 'kelurahan';
end;
$$;
revoke execute on function internal.staff_cancellation_is_full(text) from public, anon, authenticated;

-- Staff in scope at AAL2: an RW admin of every RW of the booking, or the superadmin (review of PR #102, L6: the same
-- rule as src/server/actions/booking-staff.ts, so a combo is the superadmin's).
create function internal.require_booking_staff(p_booking_id uuid) returns public.bookings
  language plpgsql stable
  set search_path = ''
as $$
declare
  booking public.bookings;
begin
  if not (public.is_staff() and public.aal2()) then
    raise exception 'only staff at AAL2 take this step' using errcode = '42501';
  end if;
  select * into booking from public.bookings b where b.id = p_booking_id;
  if not found or not (public.is_superadmin()
                       or (public.is_admin_rw() and booking.rw_ids <@ array[public.app_rw_id()])) then
    raise exception 'booking % is not in this staff member''s scope', p_booking_id using errcode = 'P0002';
  end if;
  return booking;
end;
$$;
revoke execute on function internal.require_booking_staff(uuid) from public, anon, authenticated;

-- What a cancellation would give back now: nothing for an unpaid booking; for a paid one the visit terms' refund at
-- the guest's request, the whole payment from the kelurahan or RW (A28).
create function public.cancellation_preview(p_booking_id uuid, p_reason_category text default null) returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  booking public.bookings := internal.require_booking_staff(p_booking_id);
begin
  if booking.status in ('quoted', 'pending_payment') then
    return jsonb_build_object('kind', 'cancellation', 'amount', 0, 'paid', booking.amount_paid);
  end if;
  if not public.is_superadmin() then
    raise exception 'a paid booking is cancelled by the superadmin' using errcode = '42501';
  end if;
  if internal.staff_cancellation_is_full(p_reason_category) then
    return internal.full_refund_quote(booking) - 'payment_id' - 'order_id';
  end if;
  return internal.refund_quote(booking, 'cancellation') - 'payment_id' - 'order_id';
end;
$$;

create function public.cancel_booking(p_booking_id uuid, p_reason text, p_expected_amount bigint,
  p_expected_pct smallint default null, p_reason_category text default null) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  booking public.bookings := internal.require_booking_staff(p_booking_id);
  is_full_refund boolean := false;
  outcome jsonb;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'a cancellation needs a reason of 3 to 300 characters' using errcode = '22023';
  end if;
  -- A booking already over (cancelled, expired, visited, refunded) is refused as such, whoever asks.
  if booking.status not in ('quoted', 'pending_payment', 'paid') then
    raise exception 'booking % cannot be cancelled now', booking.booking_code
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if booking.status = 'paid' then
    if not public.is_superadmin() then
      raise exception 'a paid booking is cancelled by the superadmin' using errcode = '42501';
    end if;
    if not public.fresh_totp() then
      raise exception 'confirm with a fresh authenticator code first' using errcode = '42501', hint = 'FRESH_TOTP';
    end if;
    is_full_refund := internal.staff_cancellation_is_full(p_reason_category);
  end if;
  outcome := internal.apply_cancellation(booking.id, auth.uid(), btrim(p_reason), 'cancellation', p_expected_amount,
                                         p_expected_pct, is_full_refund);
  perform internal.log_audit('bookings.staff_cancelled', 'bookings', booking.id::text,
    jsonb_strip_nulls(jsonb_build_object('status', booking.status, 'reason_category', p_reason_category,
                                         'reason', btrim(p_reason), 'refund', outcome -> 'refund' -> 'amount')));
  return outcome;
end;
$$;


-- ===== extend_booking_hold =====

-- The latest a hold may run: 14 days from now, and before the first session starts; an officer's booking of one RW
-- takes cash until 23:59 WIB of its visit day, so its hold may run until then (A23).
create function internal.latest_hold_deadline(p_booking public.bookings) returns timestamptz
  language sql stable
  set search_path = ''
as $$
  select least(now() + interval '14 days',
               case when p_booking.channel = 'admin' and cardinality(p_booking.rw_ids) = 1
                    then internal.cash_deadline(p_booking.visit_date_end)
                    else (select min((s.session_date + s.start_time) at time zone 'Asia/Jakarta')
                          from public.booking_legs l join public.visit_sessions s on s.id = l.visit_session_id
                          where l.booking_id = p_booking.id) end);
$$;
revoke execute on function internal.latest_hold_deadline(public.bookings) from public, anon, authenticated;

-- Refused while the PIC has a pay page open, whose Snap expiry follows the old deadline; once it lapses, the next pay
-- page opens a new attempt with the new one.
create function public.extend_booking_hold(p_booking_id uuid, p_new_expires_at timestamptz) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  booking public.bookings := internal.require_booking_staff(p_booking_id);
  previous_settings jsonb;
begin
  perform internal.take_audit_turn();
  select * into booking from public.bookings b where b.id = booking.id for update;
  if booking.status <> 'pending_payment' or booking.needs_review or booking.expires_at <= now() then
    raise exception 'this hold is not extended now' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if exists (select 1 from public.payments p where p.booking_id = booking.id
             and p.status in ('initiated', 'pending', 'needs_review')) then
    raise exception 'the PIC has a pay page open' using errcode = 'P0001', hint = 'PAYMENT_OPEN';
  end if;
  if p_new_expires_at is null or p_new_expires_at <= booking.expires_at
     or p_new_expires_at > internal.latest_hold_deadline(booking) then
    raise exception 'a hold runs later than now and at most until %', internal.latest_hold_deadline(booking)
      using errcode = '22023';
  end if;
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1', 'app.hold_extension', '1')
    || internal.document_actor(auth.uid()));
  update public.bookings set expires_at = p_new_expires_at where id = booking.id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  values (booking.id, booking.status, booking.status, 'admin', auth.uid(), 'hold_extended',
          jsonb_build_object('from', booking.expires_at, 'to', p_new_expires_at));
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('booking_id', booking.id, 'expires_at', p_new_expires_at);
end;
$$;


-- ===== reactivate_booking =====

-- A new deadline by the rules of a new hold: an officer's by A23, the web's by its booker type and size.
create function internal.renewed_hold_deadline(p_booking public.bookings) returns timestamptz
  language sql stable
  set search_path = ''
as $$
  select case when p_booking.channel = 'admin'
              then internal.admin_hold_deadline(p_booking.rw_ids, p_booking.visit_date_end, first_start)
              else internal.hold_deadline(p_booking.booker_type, p_booking.pax_count, first_start) end
  from (select min((s.session_date + s.start_time) at time zone 'Asia/Jakarta') as first_start
        from public.booking_legs l join public.visit_sessions s on s.id = l.visit_session_id
        where l.booking_id = p_booking.id) as legs;
$$;
revoke execute on function internal.renewed_hold_deadline(public.bookings) from public, anon, authenticated;

-- A hold that lapsed: every leg released, the booking not anonymised, and for a web booking the PIC's phone proven
-- (review of PR #102, HIGH 1, L5). An officer's booking is exempt from the phone (owner-delegated decision of
-- 2026-10-28, A28): the officer entered and checked the contact (A21) and holds the seats under staff authority. A lapsed
-- quotation keeps its legs unreserved and is no hold to revive.
create function internal.is_lapsed_hold(p_booking public.bookings) returns boolean
  language sql stable
  set search_path = ''
as $$
  select (p_booking.channel = 'admin' or p_booking.phone_verified_at is not null) and p_booking.pii_purged_at is null
     and exists (select 1 from public.booking_legs l where l.booking_id = p_booking.id)
     and not exists (select 1 from public.booking_legs l where l.booking_id = p_booking.id and l.status <> 'released');
$$;
revoke execute on function internal.is_lapsed_hold(public.bookings) from public, anon, authenticated;

create function public.reactivate_booking(p_booking_id uuid) returns jsonb
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
  if not internal.revive_expired_hold(booking.id) then
    raise exception 'the seats of booking % are gone', booking.booking_code
      using errcode = 'P0001', hint = 'QUOTA_UNAVAILABLE';
  end if;
  update public.bookings set status = 'pending_payment', expires_at = deadline, expired_at = null
  where id = booking.id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  values (booking.id, 'expired', 'pending_payment', 'admin', auth.uid(), 'reactivated',
          jsonb_build_object('expires_at', deadline));
  -- The PIC's pay link again, as a new message rather than the one the first hold sent.
  perform internal.enqueue_notification(booking.id, 'booking_created', 'whatsapp', '{"link_scope": "manage"}',
                                        'reactivated:' || now());
  perform internal.enqueue_notification(booking.id, 'booking_created', 'email', '{"link_scope": "manage"}',
                                        'reactivated:' || now());
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('booking_id', booking.id, 'expires_at', deadline);
end;
$$;


-- ===== request_notification_resend =====

-- A message the booking already had, with the same parameters, as a new outbox row (its dedupe scope names the n-th
-- resend). The recipient is the booking's contact now, by the outbox's own rules: WhatsApp only to a verified number,
-- nothing while the channel is switched off (then the answer is null).
-- Review of PR #102, L7: the booking states each guest message is true in, so a resend never tells a PIC something
-- that is no longer so (a pay link for a paid booking, a ticket for a cancelled one).
create function internal.message_fits_state(p_template public.notification_template,
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
    when 'visit_reminder_d1' then array['paid']
    when 'weather_disruption' then array['paid', 'checked_in']
    when 'booking_expired' then array['expired']
    when 'booking_cancelled' then array['cancelled', 'refunded']
    when 'refund_processed' then array['cancelled', 'refunded']
    when 'checked_in_thanks' then array['checked_in', 'completed']
    when 'certificate_ready' then array['checked_in', 'completed']
    when 'review_invite' then array['completed']
    else array[]::text[] end::public.booking_status[]);
$$;
revoke execute on function internal.message_fits_state(public.notification_template, public.booking_status)
  from public, anon, authenticated;

create function public.request_notification_resend(p_booking_id uuid, p_template public.notification_template,
  p_channel public.notification_channel) returns uuid
  language plpgsql security definer
  set search_path = ''
as $$
declare
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


-- ===== Grants =====

revoke execute on function public.cancellation_preview(uuid, text),
  public.cancel_booking(uuid, text, bigint, smallint, text),
  public.extend_booking_hold(uuid, timestamptz), public.reactivate_booking(uuid),
  public.request_notification_resend(uuid, public.notification_template, public.notification_channel)
  from public, anon, service_role;
grant execute on function public.cancellation_preview(uuid, text),
  public.cancel_booking(uuid, text, bigint, smallint, text),
  public.extend_booking_hold(uuid, timestamptz), public.reactivate_booking(uuid),
  public.request_notification_resend(uuid, public.notification_template, public.notification_channel)
  to authenticated;
