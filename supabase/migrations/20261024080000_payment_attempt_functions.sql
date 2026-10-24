-- Task P3.7.03 (docs/PRD.md §9.2, §9.4; docs/Security.md §3.2; PAY-04, WH-16, BOOK-14): a payment attempt is one
-- payments row with its own order_id, made here and nowhere else. A booking has at most one open attempt
-- (payments_one_open_per_booking, 0003); a new one replaces only the attempt payment-service.ts has just expired at
-- Midtrans, and none is made with less than five minutes of the hold left. A quoted booking takes its seats and its one
-- deadline when its first attempt is made (Konfirmasi & Bayar on the status hub, Task P3.12.02).


-- ===== The seats of a confirmed quotation =====

-- docs/PRD.md §9.2 row quoted → pending_payment: the quotation's legs reserve their seats session by session in id
-- order, the order every quota writer keeps, and the hold gets its deadline, written this once (BOOK-14). The checks are
-- the hold's own from create_booking: time left before the first session, half a session unpaid at most (answered as
-- "pilih sesi lain", decision of 2026-10-24, Q5), two unpaid holds per proven contact. The booking row is locked by the
-- caller.
create function internal.start_quoted_hold(p_booking public.bookings, p_actor_id uuid) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  contact text := case when p_booking.phone_verified_at is not null then 'whatsapp' else 'email' end;
  session_ids uuid[];
  first_start timestamptz;
  deadline timestamptz;
  leg record;
begin
  perform 1 from public.booking_legs l where l.booking_id = p_booking.id order by l.id for update;
  select array_agg(l.visit_session_id order by l.visit_session_id),
         min((s.session_date + s.start_time) at time zone 'Asia/Jakarta')
    into session_ids, first_start
  from public.booking_legs l
  join public.visit_sessions s on s.id = l.visit_session_id
  where l.booking_id = p_booking.id and l.status = 'unreserved';
  if session_ids is null then
    raise exception 'booking % has no seats left to reserve', p_booking.id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  deadline := internal.hold_deadline(p_booking.booker_type, p_booking.pax_count, first_start);
  if deadline <= now() then
    raise exception 'no time is left to pay before the session starts' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  perform internal.lock_booking_contact(contact, p_booking.pic_phone, p_booking.pic_email::text);
  perform internal.check_unpaid_caps(contact, p_booking.pic_phone, p_booking.pic_email::text);
  if internal.over_unpaid_share(session_ids, p_booking.pax_count) then
    raise exception 'the session is taken up by unpaid holds' using errcode = 'P0001', hint = 'QUOTA_UNAVAILABLE';
  end if;

  for leg in
    select l.id, l.visit_session_id, l.pax_count from public.booking_legs l
    where l.booking_id = p_booking.id order by l.visit_session_id
  loop
    perform internal.reserve_session_quota(leg.visit_session_id, leg.pax_count);
  end loop;
  update public.booking_legs set status = 'reserved', quota_reserved_at = now() where booking_id = p_booking.id;
  update public.bookings set status = 'pending_payment', expires_at = deadline where id = p_booking.id;
  update public.quotations set status = 'accepted' where booking_id = p_booking.id and status = 'issued';
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason)
  values (p_booking.id, 'quoted', 'pending_payment',
          case when p_actor_id is null then 'visitor' else 'admin' end, p_actor_id, 'quotation_confirmed');
  perform internal.enqueue_notification(p_booking.id, 'booking_created', 'whatsapp', '{"link_scope": "manage"}');
  perform internal.enqueue_notification(p_booking.id, 'booking_created', 'email', '{"link_scope": "manage"}');
end;
$$;


-- ===== internal.create_payment_attempt =====

-- The next attempt of a booking: order_id <booking_code>-NN and the booking's own total, never an amount from outside
-- (PAY-03, PAY-05). p_replaces names the open attempt payment-service.ts expired at Midtrans just before (WH-16): it is
-- closed here as expired, and any other open attempt refuses the new one, so two Snap pages for one booking never stand
-- at once. An attempt under review blocks a new one until a superadmin resolves it (docs/Security.md §3.2).
create function internal.create_payment_attempt(p_booking_id uuid, p_replaces uuid, p_actor_id uuid) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  min_hold_left constant interval := interval '5 minutes';
  max_attempts constant integer := 99;   -- the two digits of order_id
  previous_settings jsonb;
  booking public.bookings;
  open_payment public.payments;
  attempt integer;
  payment public.payments;
begin
  perform internal.require_server_caller('create_payment_attempt');
  -- The audit chain's turn before the booking's row lock, the one order every writer keeps (BOOK-01).
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || internal.document_actor(p_actor_id));

  select * into booking from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if booking.needs_review then
    raise exception 'a booking under review takes no new payment' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if booking.status = 'quoted' then
    perform internal.start_quoted_hold(booking, p_actor_id);
    select * into booking from public.bookings b where b.id = p_booking_id;
  elsif booking.status <> 'pending_payment' then
    raise exception 'a % booking takes no payment', booking.status using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if booking.expires_at - now() < min_hold_left then
    raise exception 'less than five minutes of the hold are left' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  select * into open_payment from public.payments p
  where p.booking_id = booking.id and p.status in ('initiated', 'pending', 'needs_review') for update;
  if found then
    if open_payment.status = 'needs_review' or open_payment.id is distinct from p_replaces then
      raise exception 'booking % has an open payment attempt', booking.booking_code
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
    update public.payments set status = 'expired' where id = open_payment.id;
  end if;

  select coalesce(max(p.attempt_no), 0) + 1 into attempt from public.payments p where p.booking_id = booking.id;
  if attempt > max_attempts then
    raise exception 'booking % has used all its payment attempts', booking.booking_code
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  insert into public.payments (booking_id, attempt_no, provider, status, order_id, gross_amount, expiry_time)
  values (booking.id, attempt, 'midtrans', 'initiated', booking.booking_code || '-' || lpad(attempt::text, 2, '0'),
          booking.total_amount, booking.expires_at)
  returning * into payment;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  values (booking.id, booking.status, booking.status, case when p_actor_id is null then 'visitor' else 'admin' end,
          p_actor_id, 'payment_attempt', jsonb_build_object('order_id', payment.order_id));

  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('payment_id', payment.id, 'order_id', payment.order_id,
                            'gross_amount', payment.gross_amount, 'expires_at', booking.expires_at);
end;
$$;


-- ===== The Snap page of an attempt, and an attempt that failed to start =====

-- docs/PRD.md §9.4: an attempt becomes pending once Midtrans holds its order, which the Snap token says. A token is
-- attached once, to an attempt still initiated.
create function internal.attach_snap_token(p_payment_id uuid, p_snap_token text, p_redirect_url text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
begin
  perform internal.require_server_caller('attach_snap_token');
  if coalesce(p_snap_token, '') = '' or coalesce(p_redirect_url, '') = '' then
    raise exception 'a Snap page needs its token and its address' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings('{"app.in_rpc": "1", "app.actor_role": "visitor"}');
  update public.payments set status = 'pending', snap_token = p_snap_token, snap_redirect_url = p_redirect_url
  where id = p_payment_id and status = 'initiated' and snap_token is null;
  if not found then
    raise exception 'payment % takes no Snap token', p_payment_id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  perform internal.restore_settings(previous_settings);
end;
$$;

-- Closes an open attempt that will never be paid, such as one whose Snap page Midtrans refused to make. The booking
-- stays pending_payment, so the visitor may try again (docs/PRD.md §9.2, pending_payment → pending_payment).
create function internal.record_payment_failure(p_payment_id uuid, p_status public.payment_status, p_payload jsonb)
  returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  closed public.payments;
begin
  perform internal.require_server_caller('record_payment_failure');
  if p_status is null or p_status not in ('failed', 'denied', 'cancelled', 'expired') then
    raise exception 'an attempt closes as failed, denied, cancelled or expired' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings('{"app.in_rpc": "1", "app.actor_role": "visitor"}');
  update public.payments set status = p_status, last_payload = coalesce(p_payload, last_payload)
  where id = p_payment_id and status in ('initiated', 'pending')
  returning * into closed;
  if closed.id is not null then
    insert into public.booking_events (booking_id, from_status, to_status, actor_type, reason, payload)
    select b.id, b.status, b.status, 'system', 'payment_' || p_status, jsonb_build_object('order_id', closed.order_id)
    from public.bookings b where b.id = closed.booking_id;
  end if;
  perform internal.restore_settings(previous_settings);
end;
$$;

revoke execute on function internal.start_quoted_hold(public.bookings, uuid),
  internal.create_payment_attempt(uuid, uuid, uuid), internal.attach_snap_token(uuid, text, text),
  internal.record_payment_failure(uuid, public.payment_status, jsonb)
  from public, anon, authenticated;


-- ===== Entry points for payment-service.ts (service role only) =====

create function public.svc_create_payment_attempt(p_booking_id uuid, p_replaces uuid default null,
  p_actor_id uuid default null) returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.create_payment_attempt(p_booking_id, p_replaces, p_actor_id); $$;

create function public.svc_attach_snap_token(p_payment_id uuid, p_snap_token text, p_redirect_url text) returns void
  language sql security definer
  set search_path = ''
as $$ select internal.attach_snap_token(p_payment_id, p_snap_token, p_redirect_url); $$;

create function public.svc_record_payment_failure(p_payment_id uuid, p_status public.payment_status,
  p_payload jsonb default null) returns void
  language sql security definer
  set search_path = ''
as $$ select internal.record_payment_failure(p_payment_id, p_status, p_payload); $$;

revoke execute on function public.svc_create_payment_attempt(uuid, uuid, uuid),
  public.svc_attach_snap_token(uuid, text, text),
  public.svc_record_payment_failure(uuid, public.payment_status, jsonb)
  from public, anon, authenticated;
grant execute on function public.svc_create_payment_attempt(uuid, uuid, uuid),
  public.svc_attach_snap_token(uuid, text, text),
  public.svc_record_payment_failure(uuid, public.payment_status, jsonb)
  to service_role;
