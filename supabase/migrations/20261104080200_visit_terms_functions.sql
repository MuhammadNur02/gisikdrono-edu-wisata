-- Task P3.12.02 with the owner's visit terms (docs/PRD.md §9.2, §13.1 A16–A18, FR-BOOK-17, FR-BOOK-23..25): a visitor
-- cancels an unpaid booking; a paid one is cancelled under the refund schedule, its tickets revoked and seats released
-- at once, and the refund requested; the refund is booked when Midtrans reports it (QRIS) or the superadmin records the
-- transfer (Virtual Account, Task P4.7.03); a session the weather stopped lets its bookings move within the window or
-- take the weather refund. Money is integer rupiah; every share is rounded down and the rest goes by largest remainder,
-- so refund + retained = paid exactly (CLAUDE.md §7.1).


-- ===== The refund the terms give =====

-- The percentage of the package part returned when the visit is p_days away (H-n, calendar days in Asia/Jakarta to the
-- first leg's date, decision of 2026-10-25): the first schedule entry whose min_days p_days reaches. A visit day already
-- passed (negative days) returns nothing.
create function internal.cancel_refund_pct(p_days integer) returns smallint
  language plpgsql stable
  set search_path = ''
as $$
declare
  schedule jsonb := (select s.value from public.site_settings s where s.key = 'booking.cancel_refund_schedule');
  pct smallint;
begin
  if p_days is null or p_days < 0 then
    return 0;
  end if;
  select (e.entry ->> 'pct')::smallint into pct
  from jsonb_array_elements(schedule) as e(entry)
  where (e.entry ->> 'min_days')::integer <= p_days
  order by (e.entry ->> 'min_days')::integer desc
  limit 1;
  return coalesce(pct, 0);
end;
$$;

-- The Midtrans fee of a payment for the weather refund (A18), from the superadmin's settings: QRIS in permille of the
-- amount, rounded half up; a Virtual Account a flat rupiah amount. Null while the method's fee is not set.
create function internal.midtrans_fee_of(p_method public.payment_method, p_amount bigint) returns bigint
  language plpgsql stable
  set search_path = ''
as $$
declare
  setting jsonb;
begin
  if p_method = 'qris' then
    setting := (select s.value from public.site_settings s where s.key = 'midtrans.fee_qris_permille');
    if jsonb_typeof(setting) <> 'number' or (setting #>> '{}')::numeric < 0 then
      return null;
    end if;
    return round(p_amount * (setting #>> '{}')::numeric / 1000)::bigint;
  elsif p_method = 'virtual_account' then
    setting := (select s.value from public.site_settings s where s.key = 'midtrans.fee_va_idr');
    if jsonb_typeof(setting) <> 'number' or (setting #>> '{}')::numeric < 0 then
      return null;
    end if;
    return (setting #>> '{}')::bigint;
  end if;
  return null;
end;
$$;

-- The settled payment a paid booking's refund comes from, or null.
create function internal.settled_payment_of(p_booking_id uuid) returns public.payments
  language sql stable
  set search_path = ''
as $$
  select p.* from public.payments p
  where p.booking_id = p_booking_id and p.status = 'settled'
  order by p.attempt_no desc
  limit 1;
$$;

-- The weather rights still open for a booking (decision of 2026-10-25, rule 1): a notice's link to it, not yet
-- resolved, inside its window. With p_rw_id, the link of that RW's leg only. Null when there is none.
create function internal.open_weather_link(p_booking_id uuid, p_rw_id smallint default null)
  returns public.weather_notice_bookings
  language sql stable
  set search_path = ''
as $$
  select w.* from public.weather_notice_bookings w
  where w.booking_id = p_booking_id and w.resolved_at is null and now() < w.open_until
    and (p_rw_id is null or w.rw_id = p_rw_id)
  order by w.open_until desc
  limit 1;
$$;

-- What a paid booking would get back now (A16, A18), written nowhere: the days left, the percentage, the package and
-- add-on parts, the fee, the refund and what is kept. The package part is what the package line was paid after the
-- discount; add-ons come back whole for a cancellation, since nothing was handed over. Raises STATE_INVALID for a
-- booking these terms do not cover, so the preview and the cancellation refuse alike.
create function internal.refund_quote(p_booking public.bookings, p_kind public.refund_request_kind) returns jsonb
  language plpgsql stable
  set search_path = ''
as $$
declare
  payment public.payments;
  days_before integer := p_booking.visit_date - public.today_jkt();
  package_paid bigint := p_booking.subtotal_package - p_booking.discount_amount;
  addon_paid bigint := p_booking.subtotal_addons;
  pct smallint;
  package_refund bigint := 0;
  refund bigint;
begin
  -- A20: a booking whose other leg was already visited is checked_in; only its stopped leg's weather refund remains.
  if p_booking.status = 'checked_in' and p_kind = 'weather' and not p_booking.needs_review then
    return internal.weather_leg_quote(p_booking);
  end if;
  if p_booking.status <> 'paid' or p_booking.needs_review then
    raise exception 'booking % is not a paid booking the visit terms refund', p_booking.id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if days_before < 0 then
    raise exception 'the visit of booking % has passed', p_booking.id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  payment := internal.settled_payment_of(p_booking.id);
  if payment.id is null or payment.gross_amount <> p_booking.total_amount then
    raise exception 'booking % has no settled payment of its total', p_booking.id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  if p_kind = 'weather' then
    if (internal.open_weather_link(p_booking.id)).id is null then
      raise exception 'booking % has no open weather notice', p_booking.id
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
    return internal.weather_quote(payment, days_before);
  end if;

  pct := internal.cancel_refund_pct(days_before);
  package_refund := (package_paid * pct) / 100;
  refund := package_refund + addon_paid;
  -- Review of PR #69, M-C: the kept package part stays with the kelurahan and RW treasury lines only (A16), so a
  -- package rule that pays a vendor more than the refund gives back cannot be booked later. Refused here, before
  -- any money moves, rather than when Midtrans reports the refund.
  if package_paid - package_refund > internal.package_keeper_holdings(p_booking.id) then
    raise exception 'booking % would keep % of its package, more than its kelurahan and RW treasury shares hold; the superadmin cancels it by hand',
      p_booking.id, package_paid - package_refund using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return jsonb_build_object('kind', p_kind, 'days_before', days_before, 'refund_pct', pct,
    'package_refund', package_refund, 'addon_refund', addon_paid, 'fee_amount', 0, 'amount', refund,
    'retained', payment.gross_amount - refund, 'paid', payment.gross_amount, 'method', payment.method,
    'payment_id', payment.id, 'order_id', payment.order_id);
end;
$$;

-- What the kelurahan and RW treasury package lines of a booking's ledger still hold: the most a cancellation may keep
-- (A16, review of PR #69, M-C). The same sums reverse_cancellation_share splits.
create function internal.package_keeper_holdings(p_booking_id uuid) returns bigint
  language sql stable
  set search_path = ''
as $$
  select coalesce(sum(s.amount + coalesce((select sum(r.amount) from public.revenue_share_entries r
                                           where r.booking_id = s.booking_id and r.entry_type in ('reversal', 'adjustment')
                                             and r.line_ref = s.line_ref and r.beneficiary_key = s.beneficiary_key), 0)),
                  0)::bigint
  from public.revenue_share_entries s
  where s.booking_id = p_booking_id and s.entry_type = 'settlement' and s.line_ref = 'package'
    and s.beneficiary in ('kelurahan', 'rw_treasury');
$$;

-- The weather refund (A18): what was paid minus the Midtrans fee of its method. STATE_INVALID while the fee is not
-- set, never a guess. The window is the caller's to check: the hub and the visitor within it, the sweep after it.
create function internal.weather_quote(p_payment public.payments, p_days_before integer,
  p_base bigint default null) returns jsonb
  language plpgsql stable
  set search_path = ''
as $$
declare
  fee bigint := internal.midtrans_fee_of(p_payment.method, p_payment.gross_amount);
  base bigint := coalesce(p_base, p_payment.gross_amount);
begin
  if fee is null then
    raise exception 'the Midtrans fee of % payments is not set', p_payment.method
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return jsonb_build_object('kind', 'weather', 'days_before', p_days_before, 'refund_pct', null,
    'package_refund', 0, 'addon_refund', 0, 'fee_amount', least(fee, base),
    'amount', greatest(base - fee, 0), 'retained', 0, 'paid', p_payment.gross_amount,
    'method', p_payment.method, 'payment_id', p_payment.id, 'order_id', p_payment.order_id);
end;
$$;

-- A20 (decision of 2026-10-25 on M-B): what one leg of a booking was paid for, the share a weather refund gives back
-- when the booking's other leg was already visited: the leg's part of the package after the discount (the legs share
-- the package equally, any rupiah left over by largest remainder in leg order) and the add-ons of the leg's RW.
create function internal.leg_share(p_booking public.bookings, p_leg_id uuid) returns bigint
  language plpgsql stable
  set search_path = ''
as $$
declare
  legs uuid[] := array(select l.id from public.booking_legs l where l.booking_id = p_booking.id order by l.leg_order);
  parts bigint[];
  position integer := array_position(legs, p_leg_id);
begin
  if position is null then
    raise exception 'leg % is not one of booking %', p_leg_id, p_booking.id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  parts := internal.largest_remainder_split(p_booking.subtotal_package - p_booking.discount_amount,
    array(select 1::numeric from unnest(legs)));
  return parts[position] + coalesce((select sum(a.line_total) from public.booking_addons a
                                     join public.booking_legs l on l.id = p_leg_id
                                     where a.booking_id = p_booking.id and a.rw_id = l.rw_id), 0)::bigint;
end;
$$;

-- A20: the weather refund of a checked_in booking's stopped leg: its share minus the Midtrans fee, never below 0.
create function internal.weather_leg_quote(p_booking public.bookings) returns jsonb
  language plpgsql stable
  set search_path = ''
as $$
declare
  link public.weather_notice_bookings := internal.open_weather_link(p_booking.id);
  leg public.booking_legs;
  payment public.payments := internal.settled_payment_of(p_booking.id);
begin
  select * into leg from public.booking_legs l where l.id = link.booking_leg_id;
  if link.id is null or leg.status <> 'reserved' then
    raise exception 'booking % has no open weather notice for a leg still to visit', p_booking.id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if payment.id is null then
    raise exception 'booking % has no settled payment', p_booking.id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return internal.weather_quote(payment, null, internal.leg_share(p_booking, leg.id))
    || jsonb_build_object('leg_id', leg.id);
end;
$$;


-- ===== internal.cancel_booking =====

-- An unpaid booking (quoted, pending_payment): cancelled, seats given back, open attempts closed (their orders end at
-- Midtrans after the commit, best effort), the quotation void (docs/PRD.md §9.2).
create function internal.cancel_unpaid_booking(p_booking public.bookings, p_actor_id uuid, p_reason text)
  returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  closed_orders text[];
begin
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor_id,
    cancel_reason = left(p_reason, 200)
  where id = p_booking.id;
  perform internal.release_booking_quota(p_booking.id);
  with closed as (
    update public.payments set status = 'cancelled'
    where booking_id = p_booking.id and status in ('initiated', 'pending')
    returning order_id)
  select coalesce(array_agg(order_id), '{}') into closed_orders from closed;
  update public.quotations set status = 'void' where booking_id = p_booking.id and status = 'issued';
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason)
  values (p_booking.id, p_booking.status, 'cancelled', case when p_actor_id is null then 'visitor' else 'admin' end,
          p_actor_id, 'cancelled_unpaid');
  return jsonb_build_object('result', 'cancelled', 'close_orders', to_jsonb(closed_orders), 'refund', null);
end;
$$;

-- A refund promised is somebody's work until it is booked (review of PR #69, H1): the superadmin sees an alert and
-- the staff of the booking get the review message, whatever the method.
create function internal.announce_refund_request(p_booking public.bookings, p_request public.refund_requests)
  returns void
  language plpgsql
  set search_path = ''
as $$
begin
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('refund_requested', 'medium', 'refund_requested:' || p_request.refund_key,
          'Pengembalian dana menunggu: ' || p_booking.booking_code,
          jsonb_build_object('booking_id', p_booking.id, 'refund_key', p_request.refund_key,
                             'method', p_request.method, 'amount', p_request.amount))
  on conflict (fingerprint) where acknowledged_at is null do update
  set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1;
  perform internal.notify_staff(p_booking, 'admin_booking_needs_review', 'REFUND_REQUESTED', p_request.refund_key);
end;
$$;

-- A paid booking under the terms: cancelled, every ticket revoked and every seat released now; the refund p_quote
-- gives (refund_quote, or weather_quote for the sweep) is requested, never paid here. Nothing is booked in the ledger
-- until the refund itself is (A16). Its weather rights end with it.
create function internal.cancel_paid_booking(p_booking public.bookings, p_actor_id uuid, p_reason text,
  p_kind public.refund_request_kind, p_quote jsonb, p_actor_type text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  quote jsonb := p_quote;
  request public.refund_requests;
  next_refund integer;
begin
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor_id,
    cancel_reason = left(p_reason, 200)
  where id = p_booking.id;
  perform internal.revoke_booking_tickets(p_booking.id, case when p_kind = 'weather' then 'weather_refund'
                                                             else 'cancelled' end, p_actor_id);
  perform internal.release_booking_quota(p_booking.id);
  if (quote ->> 'amount')::bigint > 0 then
    select count(*) + 1 into next_refund from public.refund_requests r where r.payment_id = (quote ->> 'payment_id')::uuid;
    insert into public.refund_requests (booking_id, payment_id, kind, method, refund_key, amount, package_refund,
      addon_refund, fee_amount, refund_pct, days_before, requested_by)
    values (p_booking.id, (quote ->> 'payment_id')::uuid, p_kind, (quote ->> 'method')::public.payment_method,
            (quote ->> 'order_id') || '-R' || lpad(next_refund::text, 2, '0'), (quote ->> 'amount')::bigint,
            (quote ->> 'package_refund')::bigint, (quote ->> 'addon_refund')::bigint,
            (quote ->> 'fee_amount')::bigint, (quote ->> 'refund_pct')::smallint, (quote ->> 'days_before')::integer,
            p_actor_id)
    returning * into request;
    perform internal.announce_refund_request(p_booking, request);
  end if;
  update public.weather_notice_bookings
  set resolution = case when p_actor_type = 'cron' then 'auto_refunded'
                        when p_kind = 'weather' then 'refunded' else 'cancelled' end,
      resolved_at = now()
  where booking_id = p_booking.id and resolved_at is null;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  values (p_booking.id, 'paid', 'cancelled', p_actor_type, p_actor_id,
          case when p_kind = 'weather' then 'weather_refund' else 'cancelled_paid' end,
          quote - 'payment_id' - 'order_id');
  return jsonb_build_object('result', 'cancelled', 'close_orders', '[]'::jsonb,
    'refund', case when request.id is null then null else jsonb_build_object(
      'request_id', request.id, 'amount', request.amount, 'method', request.method, 'refund_key', request.refund_key,
      'order_id', quote ->> 'order_id') end);
end;
$$;

-- docs/PRD.md §8.7 cancel_booking for the visitor's manage link (p_actor_id null) and the server: an unpaid booking is
-- cancelled for free; a paid one under the refund terms, for a cancellation or, after a weather notice, the weather
-- refund. A booking under review, past its visit or in any other state is refused (STATE_INVALID), so a second call
-- changes nothing. p_expected_amount and p_expected_pct are the refund the hub showed (0 and null for an unpaid
-- booking). The booking row is locked after the audit chain's turn, the order every writer keeps (BOOK-01).
create function internal.cancel_booking(p_booking_id uuid, p_actor_id uuid, p_reason text,
  p_kind public.refund_request_kind, p_expected_amount bigint, p_expected_pct smallint) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  booking public.bookings;
  quote jsonb;
  outcome jsonb;
begin
  perform internal.require_server_caller('cancel_booking');
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
    quote := internal.refund_quote(booking, p_kind);
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

-- A20: the weather refund of the stopped leg of a booking whose other leg was already visited. The booking stays
-- checked_in; that leg's seats are released and its ticket revoked, the visited leg is never refunded.
create function internal.refund_weather_leg(p_booking public.bookings, p_actor_id uuid, p_quote jsonb,
  p_actor_type text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  leg public.booking_legs;
  request public.refund_requests;
  next_refund integer;
begin
  select * into leg from public.booking_legs l where l.id = (p_quote ->> 'leg_id')::uuid for update;
  update public.visit_sessions set reserved_pax = greatest(reserved_pax - leg.pax_count, 0)
  where id = leg.visit_session_id;
  update public.booking_legs set status = 'released', quota_released_at = now() where id = leg.id;
  update public.tickets_qr
  set status = 'revoked', revoked_at = now(), revoked_by = p_actor_id, revoke_reason = 'weather_refund'
  where booking_leg_id = leg.id and status in ('issued', 'suspended');
  if (p_quote ->> 'amount')::bigint > 0 then
    select count(*) + 1 into next_refund from public.refund_requests r
    where r.payment_id = (p_quote ->> 'payment_id')::uuid;
    insert into public.refund_requests (booking_id, payment_id, booking_leg_id, kind, method, refund_key, amount,
      fee_amount, requested_by)
    values (p_booking.id, (p_quote ->> 'payment_id')::uuid, leg.id, 'weather',
            (p_quote ->> 'method')::public.payment_method,
            (p_quote ->> 'order_id') || '-R' || lpad(next_refund::text, 2, '0'), (p_quote ->> 'amount')::bigint,
            (p_quote ->> 'fee_amount')::bigint, p_actor_id)
    returning * into request;
    perform internal.announce_refund_request(p_booking, request);
  end if;
  update public.weather_notice_bookings
  set resolution = case when p_actor_type = 'cron' then 'auto_refunded' else 'refunded' end, resolved_at = now()
  where booking_id = p_booking.id and booking_leg_id = leg.id and resolved_at is null;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  values (p_booking.id, p_booking.status, p_booking.status, p_actor_type, p_actor_id, 'weather_refund_leg',
          p_quote - 'payment_id' - 'order_id');
  return jsonb_build_object('result', 'cancelled', 'close_orders', '[]'::jsonb,
    'refund', case when request.id is null then null else jsonb_build_object(
      'request_id', request.id, 'amount', request.amount, 'method', request.method, 'refund_key', request.refund_key,
      'order_id', p_quote ->> 'order_id') end);
end;
$$;

-- The status hub's preview (FR-BOOK-23): the same quote the cancellation writes, for a paid booking; an unpaid booking
-- previews no refund.
create function internal.refund_preview(p_booking_id uuid, p_kind public.refund_request_kind) returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  booking public.bookings;
begin
  perform internal.require_server_caller('refund_preview');
  select * into booking from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if booking.status in ('quoted', 'pending_payment') and p_kind = 'cancellation' then
    return jsonb_build_object('kind', p_kind, 'amount', 0, 'paid', booking.amount_paid);
  end if;
  return internal.refund_quote(booking, p_kind) - 'payment_id' - 'order_id';
end;
$$;


-- ===== The refund's way through Midtrans (QRIS) =====

-- payment-service.ts calls Midtrans' refund API after the cancelling commit, and payments-poll again later, and
-- reports here. submitted: Midtrans took it; the refund notification books it. failed: Midtrans refused it in so many
-- words, so the superadmin finishes it by hand. requested: no answer came (a timeout, Midtrans out of reach), so the
-- request stays for the next run of payments-poll, which first asks the Status API whether the refund went through
-- after all (review of PR #69, M1). Every report counts the call.
create function internal.mark_refund_request(p_request_id uuid, p_status public.refund_request_status,
  p_status_code text, p_reason text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  request public.refund_requests;
begin
  perform internal.require_server_caller('mark_refund_request');
  if p_status not in ('requested', 'submitted', 'failed') then
    raise exception 'a refund request is marked requested, submitted or failed'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  perform internal.take_audit_turn();
  -- The server reports on the visitor's own cancellation.
  previous_settings := internal.push_settings('{"app.in_rpc": "1", "app.actor_role": "visitor"}');
  update public.refund_requests
  set status = p_status,
      submitted_at = case when p_status = 'submitted' then coalesce(submitted_at, now()) else submitted_at end,
      provider_status_code = case when p_status_code ~ '^[0-9]{3}$' then p_status_code else provider_status_code end,
      failure_reason = case when p_status = 'failed' then left(coalesce(p_reason, 'refused'), 200) end,
      attempts = attempts + 1, last_attempt_at = now()
  where id = p_request_id
    and (status = 'requested' or (p_status = 'submitted' and status in ('submitted', 'failed')))
  returning * into request;
  -- Review of PR #69, L-5: a refund Midtrans took whose notification never comes is somebody's to chase.
  if request.id is not null and request.status = 'submitted' and request.attempts >= 6 then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('refund_unconfirmed', 'high', 'refund_unconfirmed:' || request.refund_key,
            'Pengembalian dana QRIS belum dikonfirmasi Midtrans; periksa di Keuangan',
            jsonb_build_object('booking_id', request.booking_id, 'refund_key', request.refund_key,
                               'attempts', request.attempts))
    on conflict (fingerprint) where acknowledged_at is null do nothing;
  end if;
  if request.id is not null and p_status = 'failed' then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('refund_failed', 'high', 'refund_failed:' || request.refund_key,
            'Midtrans menolak pengembalian dana QRIS; transfer manual lewat penyesuaian manual_refund di Keuangan',
            jsonb_build_object('booking_id', request.booking_id, 'refund_key', request.refund_key,
                               'status_code', request.provider_status_code))
    on conflict (fingerprint) where acknowledged_at is null do update
    set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1, notified_at = null;
  end if;
  perform internal.restore_settings(previous_settings);
end;
$$;


-- The QRIS refunds payments-poll looks at again (review of PR #69, H1): a request no answer came for, or one Midtrans
-- took whose refund notification has not arrived, last tried more than ten minutes ago, oldest first. payment-service.ts
-- asks the Status API for each order first and calls the refund API again (same refund_key) only for a request still
-- requested.
create function internal.refund_requests_to_retry(p_limit integer) returns jsonb
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('request_id', due.id, 'status', due.status,
                                               'refund_key', due.refund_key, 'order_id', due.order_id,
                                               'amount', due.amount) order by due.last_try), '[]'::jsonb)
  from (
    select r.id, r.status, r.refund_key, p.order_id, r.amount, coalesce(r.last_attempt_at, r.requested_at) as last_try
    from public.refund_requests r
    join public.payments p on p.id = r.payment_id
    where r.method = 'qris' and r.status in ('requested', 'submitted')
      and coalesce(r.last_attempt_at, r.requested_at) < now() - interval '10 minutes'
    order by coalesce(r.last_attempt_at, r.requested_at)
    limit least(greatest(p_limit, 1), 50)
  ) as due;
$$;


-- ===== The ledger of a cancellation refund =====

-- A16: the add-ons come back whole, and of the package part only what the terms keep stays, with the kelurahan and the
-- RW treasury alone (decision of 2026-10-25, Q4: no vendor share of a cancellation). Each add-on row, and any package
-- row of another beneficiary, gives back all it still holds; the kelurahan and RW treasury package rows keep the
-- retained amount split over what each still holds by largest remainder (review of PR #69, L1), and give back the
-- rest. One set of reversal rows per refund reference, as reverse_revenue_share (20261024100300).
create function internal.reverse_cancellation_share(p_booking_id uuid, p_package_refund bigint, p_reference text)
  returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  package_total bigint;
  keeper_ids bigint[];
  keeper_remaining numeric[];
  keeper_total bigint;
  retained bigint;
  kept bigint[];
  written bigint;
begin
  if exists (select 1 from public.revenue_share_entries e
             where e.booking_id = p_booking_id and e.entry_type = 'reversal'
               and e.rule_version ->> 'refund_reference' = p_reference) then
    return jsonb_build_object('result', 'already_reversed');
  end if;

  create temporary table held on commit drop as
  select s.id, s.line_ref, s.beneficiary, s.amount + coalesce(given_back.amount, 0) as remaining
  from public.revenue_share_entries s
  left join lateral (select sum(r.amount) as amount from public.revenue_share_entries r
                     where r.booking_id = s.booking_id and r.entry_type in ('reversal', 'adjustment')
                       and r.line_ref = s.line_ref and r.beneficiary_key = s.beneficiary_key) as given_back on true
  where s.booking_id = p_booking_id and s.entry_type = 'settlement';
  if not exists (select 1 from held) then
    drop table held;
    raise exception 'booking % has no ledger to reverse', p_booking_id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  select coalesce(sum(h.remaining), 0) into package_total from held h where h.line_ref = 'package';
  select array_agg(h.id order by h.id), array_agg(h.remaining order by h.id), coalesce(sum(h.remaining), 0)
    into keeper_ids, keeper_remaining, keeper_total
  from held h where h.line_ref = 'package' and h.beneficiary in ('kelurahan', 'rw_treasury');
  retained := package_total - p_package_refund;
  if p_package_refund < 0 or retained < 0 or retained > keeper_total then
    drop table held;
    raise exception 'booking % cannot give back % of its package', p_booking_id, p_package_refund
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if retained > 0 then
    kept := internal.largest_remainder_split(retained, keeper_remaining);
  end if;

  insert into public.revenue_share_entries (booking_id, payment_id, entry_type, line_ref, booking_addon_id, rule_id,
    rule_version, beneficiary, beneficiary_key, rw_id, vendor_id, base_amount, pct, amount)
  select s.booking_id, s.payment_id, 'reversal', s.line_ref, s.booking_addon_id, s.rule_id,
         s.rule_version || jsonb_build_object('reason', 'cancellation_refund', 'refund_reference', p_reference),
         s.beneficiary, s.beneficiary_key, s.rw_id, s.vendor_id, -back.amount, s.pct, -back.amount
  from (
    select h.id, h.remaining - coalesce(keep.kept, 0) as amount
    from held h
    left join unnest(keeper_ids, kept) as keep(id, kept) on keep.id = h.id
  ) as back
  join public.revenue_share_entries s on s.id = back.id
  where back.amount > 0
  order by s.id;

  select coalesce(-sum(e.amount), 0) into written from public.revenue_share_entries e
  where e.booking_id = p_booking_id and e.entry_type = 'reversal' and e.rule_version ->> 'refund_reference' = p_reference;
  drop table held;
  return jsonb_build_object('result', 'reversed', 'amount', -written);
end;
$$;


-- ===== Booking the refund =====

-- The refund request of a payment that is being refunded, once its money has gone back: the payment takes the
-- refunded status and the cumulative amount, the ledger gives back what the request names, the invoice is voided with
-- a credit note, the request is recorded and refund_processed goes out, once per refund (p_dedupe_scope 'refund:'
-- and its refund_key, 20261101130200). The booking keeps its status: its seats and tickets went with the cancellation.
-- p_refunded is the cumulative amount returned; p_reported whether Midtrans itself reports this refund (a QRIS refund
-- its notification booked, or a record_refund under its word) rather than a bank transfer, which
-- internal.midtrans_recorded counts from the event's payload; p_reference is the refund's own name in the event.
create function internal.book_refund_request(p_request public.refund_requests, p_target public.payment_status,
  p_refunded bigint, p_reported boolean, p_reference text, p_actor uuid) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  ledger jsonb;
  payment public.payments;
begin
  update public.payments set status = p_target, refunded_amount = p_refunded where id = p_request.payment_id
  returning * into payment;
  -- The money is already back with the visitor (review of PR #69, M-C): a ledger that cannot take the reversal is
  -- the superadmin's to settle, never a reason to refuse the refund, which would fail the webhook and the poll forever.
  begin
    if p_request.kind = 'cancellation' then
      ledger := internal.reverse_cancellation_share(p_request.booking_id, p_request.package_refund, p_request.refund_key);
    elsif p_request.booking_leg_id is not null then
      -- A20: the leg's share comes off every line in proportion, the fee included, which nobody keeps (A18).
      ledger := internal.reverse_revenue_share(p_request.booking_id, p_request.amount + p_request.fee_amount,
        p_request.refund_key, 'weather_refund_leg');
    else
      ledger := internal.reverse_revenue_share(p_request.booking_id,
        (select coalesce(sum(e.amount), 0)::bigint from public.revenue_share_entries e
         where e.booking_id = p_request.booking_id and e.entry_type in ('settlement', 'reversal', 'adjustment')),
        p_request.refund_key, 'weather_refund');
    end if;
  exception when sqlstate 'P0001' then
    ledger := jsonb_build_object('result', 'not_reversed');
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('refund_ledger_unbalanced', 'high', 'refund_ledger_unbalanced:' || p_request.refund_key,
            'Pengembalian dana tercatat, buku bagi hasil belum dibalik; selesaikan di Keuangan',
            jsonb_build_object('booking_id', p_request.booking_id, 'refund_key', p_request.refund_key,
                               'package_refund', p_request.package_refund))
    on conflict (fingerprint) where acknowledged_at is null do update
    set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1;
  end;
  -- A leg's refund leaves the visited leg's invoice standing; the superadmin issues its credit note (P4.7).
  update public.invoices
  set status = 'void', voided_at = now(), void_reason = case when p_request.kind = 'weather' then 'weather_refund'
                                                              else 'cancelled' end,
      credit_note_number = coalesce(credit_note_number, internal.next_document_number('credit_note', now()))
  where booking_id = p_request.booking_id and status = 'paid' and p_request.booking_leg_id is null;
  update public.refund_requests set status = 'recorded', recorded_at = now() where id = p_request.id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  select p_request.booking_id, b.status, b.status, case when p_actor is null then 'webhook' else 'admin' end, p_actor,
         'refund_recorded',
         jsonb_build_object('refund_reference', p_reference, 'refund_key', p_request.refund_key,
                            'amount', p_request.amount, 'order_id', payment.order_id, 'reported', p_reported,
                            'whole', p_target = 'refunded')
  from public.bookings b where b.id = p_request.booking_id;
  if p_reported then
    perform internal.close_refund_alert('refund_seen:' || payment.order_id, internal.midtrans_recorded(payment),
                                        p_actor);
  end if;
  perform internal.enqueue_notification(p_request.booking_id, 'refund_processed', 'whatsapp',
                                        jsonb_build_object('refund_amount', p_request.amount),
                                        'refund:' || p_request.refund_key);
  perform internal.enqueue_notification(p_request.booking_id, 'refund_processed', 'email',
                                        jsonb_build_object('refund_amount', p_request.amount),
                                        'refund:' || p_request.refund_key);
  return jsonb_build_object('result', 'applied', 'processing_result', 'refund_recorded', 'payment_status', p_target,
                            'booking_status', (select b.status from public.bookings b where b.id = p_request.booking_id),
                            'ledger', ledger);
end;
$$;

-- A refund Midtrans reports for a payment with an open QRIS refund request: booked when the cumulative refunded
-- amount of the confirmed answer (internal.midtrans_refund_total, 20261101130200) is what was refunded before plus this
-- request; any other amount, or none, is a refund someone made by hand, which keeps note_refund_seen's alert. A request
-- marked failed still matches: a refusal Midtrans later carried out after all is booked like any other (review of PR
-- #69, M1).
create function internal.record_requested_refund(p_payment public.payments, p_target public.payment_status,
  p_answer jsonb) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  request public.refund_requests;
  reported bigint := internal.midtrans_refund_total(p_answer);
begin
  select * into request from public.refund_requests r
  where r.payment_id = p_payment.id and r.status in ('requested', 'submitted', 'failed') and r.method = 'qris'
  for update;
  if request.id is null or reported is null or reported <> p_payment.refunded_amount + request.amount then
    return null;
  end if;
  return internal.book_refund_request(request, p_target, reported, true, request.refund_key, null);
end;
$$;

-- Replaces the 20261101130200 version. A refund Midtrans reports for a payment whose cancellation requested it is
-- booked (A16); every other refund goes to note_refund_seen with the confirmed answer, which also stays silent about one
-- already recorded (review of PR #69, L-2). Everything else is unchanged.
create or replace function internal.apply_payment_status(p_booking public.bookings, p_payment public.payments,
  p_target public.payment_status, p_answer jsonb, p_actor_type text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  is_open boolean := p_payment.status in ('initiated', 'pending');
  is_whole_refund boolean := p_target = 'refunded'
    or coalesce(internal.midtrans_refund_total(p_answer) >= p_payment.gross_amount, false);
  ignored jsonb := jsonb_build_object('result', 'ignored', 'processing_result', 'ignored_transition',
                                      'payment_status', p_payment.status, 'booking_status', p_booking.status);
  applied jsonb := jsonb_build_object('result', 'applied', 'processing_result', p_target,
                                      'payment_status', p_target, 'booking_status', p_booking.status);
  booked jsonb;
begin
  if p_target = 'settled' then
    if p_payment.status = 'settled' then
      return internal.complete_paid_booking(p_booking, p_payment, p_actor_type);
    end if;
    if p_payment.status in ('refunded', 'partially_refunded', 'disputed', 'duplicate') then
      return ignored;
    end if;
    return internal.settle_payment(p_booking, p_payment, p_answer, p_actor_type);
  elsif p_target in ('refunded', 'partially_refunded') then
    if p_booking.status in ('cancelled', 'checked_in') and p_payment.status in ('settled', 'partially_refunded') then
      booked := internal.record_requested_refund(p_payment, p_target, p_answer);
      if booked is not null then
        return booked;
      end if;
    end if;
    if is_whole_refund and p_payment.status in ('settled', 'partially_refunded') then
      perform internal.suspend_booking_tickets(p_booking.id, 'refund_seen');
    end if;
    return internal.note_refund_seen(p_payment, p_target, p_answer);
  elsif p_target = 'disputed' then
    if p_payment.status in ('duplicate', 'refunded') then
      perform internal.flag_payment_review(p_booking, p_payment, 'CHARGEBACK', 'critical', p_actor_type);
      return jsonb_build_object('result', 'needs_review', 'processing_result', 'chargeback_on_' || p_payment.status,
                                'payment_status', p_payment.status, 'booking_status', p_booking.status);
    end if;
    if p_payment.status not in ('settled', 'partially_refunded') then
      return ignored;
    end if;
    update public.payments set status = 'disputed' where id = p_payment.id;
    perform internal.suspend_booking_tickets(p_booking.id, 'chargeback');
    perform internal.flag_payment_review(p_booking, p_payment, 'CHARGEBACK', 'critical', p_actor_type);
  elsif p_target = 'pending' then
    if not is_open then
      return ignored;
    end if;
    perform internal.store_payment_answer(p_payment.id, 'pending', p_answer);
  elsif p_target = 'needs_review' then
    if not is_open then
      return ignored;
    end if;
    perform internal.store_payment_answer(p_payment.id, 'needs_review', p_answer);
    perform internal.flag_payment_review(p_booking, p_payment, 'PAYMENT_CHALLENGE', 'high', p_actor_type);
  else
    -- denied, failed, cancelled, expired: the attempt closes and the booking stays pending_payment.
    if not (is_open or p_payment.status = 'needs_review') then
      return ignored;
    end if;
    perform internal.store_payment_answer(p_payment.id, p_target, p_answer);
    insert into public.booking_events (booking_id, from_status, to_status, actor_type, reason, payload)
    values (p_booking.id, p_booking.status, p_booking.status, p_actor_type, 'payment_' || p_target,
            jsonb_build_object('order_id', p_payment.order_id));
  end if;
  return applied;
end;
$$;

-- Replaces the 20261101130200 version (review of PR #69, H1, on #68): a refund that answers an open visit-terms
-- request, by record_refund under Midtrans' word or by a manual_refund adjustment's bank transfer, is booked through
-- book_refund_request, so a cancellation keeps the A16 split and the booking stays cancelled (or checked_in for a leg,
-- A20). Every other refund is unchanged.
create or replace function internal.record_refund_core(p_booking_id uuid, p_payment_id uuid, p_amount bigint, p_reference text,
  p_reason text, p_proof_path text, p_actor uuid, p_reported_only boolean) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  reference text := btrim(coalesce(p_reference, ''));
  booking public.bookings;
  payment public.payments;
  recorded bigint;
  is_whole boolean;
  credit_note text;
  previous_settings jsonb;
  request public.refund_requests;
  is_whole_request boolean;
begin
  if reference = '' or length(reference) > 100 then
    raise exception 'a refund names its transfer in 1 to 100 characters' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'a refund says why in at least 10 characters' using errcode = '22023';
  end if;
  if p_proof_path is null
     or p_proof_path !~ ('^bookings/' || p_booking_id
                         || '/(refund|adjustment)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
                         || '\.(pdf|jpg|jpeg|png|webp)$') then
    raise exception 'a refund keeps its proof under documents/bookings/%/', p_booking_id using errcode = '22023';
  end if;
  perform internal.require_document(p_proof_path);
  perform internal.take_audit_turn();
  select b.* into booking from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  select (e.payload ->> 'amount')::bigint into recorded from public.booking_events e
  where e.booking_id = p_booking_id and e.reason = 'refund_recorded' and e.payload ->> 'refund_reference' = reference;
  if recorded is not null then
    if recorded <> p_amount then
      raise exception 'refund % was recorded for %, not %', reference, recorded, p_amount
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
    return jsonb_build_object('result', 'already_recorded', 'amount', p_amount);
  end if;
  -- A Midtrans refund whose refund_key is an applied adjustment's id was booked by that adjustment (N17).
  if p_reported_only and regexp_replace(reference, '^adjustment:', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and exists (select 1 from public.payment_adjustments a
                 where a.id = regexp_replace(reference, '^adjustment:', '')::uuid and a.booking_id = p_booking_id
                   and a.status = 'applied') then
    raise exception 'refund % was recorded when its adjustment was applied', reference
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  perform internal.require_unused_proof(p_booking_id, p_proof_path,
                                        nullif(current_setting('app.adjustment_id', true), '')::uuid);
  payment := internal.refund_payment_of(p_booking_id, p_payment_id);
  -- Review of PR #69, H1: a refund of the amount a cancellation under the visit terms requested books that request,
  -- so its ledger keeps the A16 split and the booking keeps its status. Midtrans' word is checked as for any other.
  select * into request from public.refund_requests r
  where r.payment_id = payment.id and r.status in ('requested', 'submitted', 'failed') and r.amount = p_amount
  for update;
  if request.id is not null then
    if p_reported_only and internal.midtrans_refunded(payment) < internal.midtrans_recorded(payment) + p_amount then
      raise exception 'Midtrans reports no refund of % on order %', internal.midtrans_recorded(payment) + p_amount,
        payment.order_id using errcode = 'P0001', hint = 'REFUND_NOT_AT_MIDTRANS';
    end if;
    is_whole_request := payment.refunded_amount + p_amount >= payment.gross_amount;
    previous_settings := internal.push_settings('{"app.in_rpc": "1"}');
    perform internal.book_refund_request(request,
      case when is_whole_request then 'refunded' else 'partially_refunded' end::public.payment_status,
      payment.refunded_amount + p_amount, p_reported_only, reference, p_actor);
    perform internal.restore_settings(previous_settings);
    return jsonb_build_object('result', 'recorded', 'amount', p_amount, 'whole', is_whole_request,
                              'credit_note_number', null);
  end if;
  perform internal.check_refund_amount(booking, payment, p_amount);
  -- What Midtrans reports is compared with what was recorded under its word alone (delta review of PR #68, N16): a
  -- bank-transfer refund before it neither counts towards it nor blocks a genuine Midtrans refund after it.
  if p_reported_only
     and internal.midtrans_refunded(payment) < internal.midtrans_recorded(payment) + p_amount then
    raise exception 'Midtrans reports no refund of % on order %', internal.midtrans_recorded(payment) + p_amount,
      payment.order_id using errcode = 'P0001', hint = 'REFUND_NOT_AT_MIDTRANS';
  end if;
  is_whole := payment.refunded_amount + p_amount = payment.gross_amount;

  previous_settings := internal.push_settings('{"app.in_rpc": "1", "app.recording_refund": "1"}');
  credit_note := internal.refund_booking_side(booking, payment, p_amount, is_whole, reference, p_reason, p_actor);
  -- A duplicate payment stays duplicate, its refund shown in refunded_amount alone (M1).
  update public.payments
  set status = case when status = 'duplicate' then status
                    when is_whole then 'refunded'::public.payment_status
                    else 'partially_refunded' end,
      refunded_amount = refunded_amount + p_amount
  where id = payment.id;
  -- Only a refund recorded under Midtrans' word answers the alert of a refund Midtrans made (N16).
  perform internal.close_refund_alert('refund_seen:' || payment.order_id,
    internal.midtrans_recorded(payment) + case when p_reported_only then p_amount else 0 end, p_actor);
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  select booking.id, booking.status, b.status, 'admin', p_actor, 'refund_recorded',
         jsonb_build_object('refund_reference', reference, 'amount', p_amount, 'order_id', payment.order_id,
                            'whole', is_whole, 'proof_path', p_proof_path, 'credit_note_number', credit_note,
                            'reported', p_reported_only)
  from public.bookings b where b.id = booking.id;
  -- Each refund sends its own message with its own amount (L4).
  if payment.status <> 'duplicate' then
    perform internal.enqueue_notification(booking.id, 'refund_processed', 'whatsapp',
                                          jsonb_build_object('refund_amount', p_amount), 'refund:' || reference);
    perform internal.enqueue_notification(booking.id, 'refund_processed', 'email',
                                          jsonb_build_object('refund_amount', p_amount), 'refund:' || reference);
  end if;
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('result', 'recorded', 'amount', p_amount, 'whole', is_whole,
                            'credit_note_number', credit_note);
end;
$$;


-- ===== Weather (A17, decision of 2026-10-25 on the weather) =====

-- A message about a booking that the outbox would otherwise take for one already queued, under a dedupe key of its
-- own occasion: the ticket again after a weather move, the weather notice per notice. The same checks as
-- enqueue_notification: a channel switched off, an unverified WhatsApp number or a missing address queues nothing.
create function internal.queue_booking_message(p_booking_id uuid, p_template public.notification_template,
  p_channels public.notification_channel[], p_params jsonb, p_occasion text) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  booking record;
  channel public.notification_channel;
  recipient text;
begin
  select b.pic_phone, b.pic_email, b.pic_first_name, b.phone_verified_at into booking
  from public.bookings b where b.id = p_booking_id;
  foreach channel in array p_channels loop
    recipient := case channel when 'whatsapp' then booking.pic_phone else booking.pic_email end;
    continue when recipient is null
      or not internal.setting_is_on(case channel when 'whatsapp' then 'whatsapp_enabled' else 'email_enabled' end)
      or (channel = 'whatsapp' and booking.phone_verified_at is null);
    insert into public.notifications (booking_id, channel, template, recipient, recipient_name, params, dedupe_key)
    values (p_booking_id, channel, p_template, recipient, booking.pic_first_name, coalesce(p_params, '{}'),
            format('booking:%s:%s:%s:%s', p_booking_id, p_template, channel, p_occasion))
    on conflict (dedupe_key) do nothing;
  end loop;
end;
$$;

-- Rule 4: the weather notice to one booking, and its manage link in a message of its own. The notice goes by email,
-- and by WhatsApp too once the superadmin has set whatsapp.weather_template_approved after Meta approved
-- gsk_weather_disruption_v1 (docs/notifications.md); the link goes on both channels as booking_link, an approved
-- template.
create function internal.queue_weather_messages(p_link public.weather_notice_bookings,
  p_session public.visit_sessions) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  perform internal.queue_booking_message(p_link.booking_id, 'weather_disruption',
    case when internal.setting_is_on('whatsapp.weather_template_approved')
         then array['whatsapp', 'email'] else array['email'] end::public.notification_channel[],
    jsonb_build_object('rw_name', (select r.name from public.rw_units r where r.id = p_session.rw_id),
                       'session_date', p_session.session_date, 'open_until', p_link.open_until,
                       'moves_max', (select (s.value #>> '{}')::integer from public.site_settings s
                                     where s.key = 'booking.weather_reschedule_max')),
    'notice_' || p_link.notice_id);
  perform internal.queue_booking_message(p_link.booking_id, 'booking_link',
    array['whatsapp', 'email']::public.notification_channel[], '{"link_scope": "manage"}',
    'weather_' || p_link.notice_id);
end;
$$;

-- Staff RPC (docs/PRD.md §8.7): an RW admin of the session's RW, or the superadmin, at AAL2, says the weather stopped a
-- session that is today or ahead. Every paid booking with a leg on it gets its rights (weather_notice_bookings, with
-- the window from now) and the weather message; the session closes to new bookings and moves (L2). A second call for
-- the same session answers the notice already there and adds nothing.
create function public.declare_weather_disruption(p_session_id uuid, p_reason text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  session public.visit_sessions;
  notice public.weather_notices;
  link public.weather_notice_bookings;
  window_hours integer := (select (s.value #>> '{}')::integer from public.site_settings s
                           where s.key = 'booking.weather_window_hours');
  affected integer := 0;
begin
  if not (public.is_staff() and public.aal2()) then
    raise exception 'only staff at AAL2 declare the weather' using errcode = '42501';
  end if;
  perform internal.take_audit_turn();
  select * into session from public.visit_sessions s where s.id = p_session_id for update;
  if not found or not (public.is_superadmin() or public.owns_rw(session.rw_id)) then
    raise exception 'session % is not one this account declares the weather for', p_session_id
      using errcode = '42501';
  end if;
  if session.session_date < public.today_jkt() then
    raise exception 'session % has passed', p_session_id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || internal.document_actor(auth.uid()));
  insert into public.weather_notices (visit_session_id, rw_id, declared_by, reason)
  values (session.id, session.rw_id, auth.uid(), nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (visit_session_id) do nothing
  returning * into notice;
  if notice.id is null then
    select * into notice from public.weather_notices n where n.visit_session_id = session.id;
  else
    for link in
      insert into public.weather_notice_bookings (notice_id, booking_id, booking_leg_id, rw_id, open_until)
      select notice.id, l.booking_id, l.id, l.rw_id, notice.declared_at + make_interval(hours => window_hours)
      from public.booking_legs l join public.bookings b on b.id = l.booking_id
      where l.visit_session_id = session.id and l.status = 'reserved' and b.status in ('paid', 'checked_in')
        and not b.needs_review
      returning *
    loop
      perform internal.queue_weather_messages(link, session);
      affected := affected + 1;
    end loop;
  end if;
  update public.visit_sessions set status = 'closed' where id = session.id and status = 'open';
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('notice_id', notice.id, 'declared_at', notice.declared_at, 'affected_bookings', affected);
end;
$$;

-- Rule 1 and 3: the leg the weather stopped moves to p_session_id, an open session of its RW, no sooner than
-- booking.min_lead_hours and no later than booking.max_advance_days, at most booking.weather_reschedule_max times per
-- notice while its window is open. A combo's other leg keeps its day, so the booking's dates are its legs' first and
-- last. The seats move in one transaction, both sessions locked in id order (BOOK-01): a full session refuses the move
-- (QUOTA_UNAVAILABLE). The leg's ticket keeps its code and takes the new day, so the old QR no longer passes a gate,
-- and the ticket message goes out again (review of PR #69, M2). The rights stay open after a move.
create function internal.reschedule_for_weather(p_booking_id uuid, p_session_id uuid) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  booking public.bookings;
  target public.visit_sessions;
  link public.weather_notice_bookings;
  leg public.booking_legs;
  allowed integer := (select (s.value #>> '{}')::integer from public.site_settings s
                      where s.key = 'booking.weather_reschedule_max');
  lead_hours integer := (select (s.value #>> '{}')::integer from public.site_settings s
                         where s.key = 'booking.min_lead_hours');
  advance_days integer := (select (s.value #>> '{}')::integer from public.site_settings s
                           where s.key = 'booking.max_advance_days');
  minutes_before integer := (select (s.value #>> '{}')::integer from public.site_settings s
                             where s.key = 'checkin.grace_before_minutes');
  minutes_after integer := (select (s.value #>> '{}')::integer from public.site_settings s
                            where s.key = 'checkin.grace_after_minutes');
  step record;
begin
  perform internal.require_server_caller('reschedule_for_weather');
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings('{"app.in_rpc": "1", "app.actor_role": "visitor"}');
  select * into booking from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if booking.status not in ('paid', 'checked_in') or booking.needs_review then
    raise exception 'only a paid booking moves for the weather' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  select * into target from public.visit_sessions s where s.id = p_session_id;
  link := internal.open_weather_link(booking.id, target.rw_id);
  if target.id is null or link.id is null then
    raise exception 'booking % has no open weather notice for that RW', booking.id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if link.moves_used >= allowed then
    raise exception 'booking % has moved for this notice % times already', booking.id, link.moves_used
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  select * into leg from public.booking_legs l where l.id = link.booking_leg_id for update;
  if leg.status <> 'reserved' or target.status <> 'open' or target.id = leg.visit_session_id
     or (target.session_date + target.start_time) at time zone 'Asia/Jakarta'
        < now() + make_interval(hours => coalesce(lead_hours, 0))
     or (advance_days is not null and target.session_date > public.today_jkt() + advance_days) then
    raise exception 'the new session is an open session of the leg''s RW, inside the booking window, and not the one it leaves'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  for step in
    select x.session_id, x.direction from (values (target.id, 'take'), (leg.visit_session_id, 'give'))
      as x(session_id, direction)
    order by x.session_id
  loop
    if step.direction = 'take' then
      perform internal.reserve_session_quota(step.session_id, leg.pax_count);
    else
      update public.visit_sessions set reserved_pax = greatest(reserved_pax - leg.pax_count, 0)
      where id = step.session_id;
    end if;
  end loop;

  update public.booking_legs set visit_session_id = target.id, quota_reserved_at = now() where id = leg.id;
  update public.tickets_qr t
  set visit_session_id = target.id, valid_on = target.session_date,
      valid_from = (target.session_date + target.start_time) at time zone 'Asia/Jakarta'
                   - make_interval(mins => minutes_before),
      valid_until = (target.session_date + target.end_time) at time zone 'Asia/Jakarta'
                    + make_interval(mins => minutes_after)
  where t.booking_leg_id = leg.id and t.status = 'issued';
  update public.bookings b
  set visit_date = days.first_day, visit_date_end = days.last_day
  from (select min(s.session_date) as first_day, max(s.session_date) as last_day
        from public.booking_legs l join public.visit_sessions s on s.id = l.visit_session_id
        where l.booking_id = booking.id) as days
  where b.id = booking.id;
  update public.weather_notice_bookings set moves_used = moves_used + 1 where id = link.id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, reason, payload)
  values (booking.id, 'paid', 'paid', 'visitor', 'weather_reschedule',
          jsonb_build_object('notice_id', link.notice_id, 'moves', link.moves_used + 1, 'leg_id', leg.id,
                             'from', leg.visit_session_id, 'to', target.id, 'visit_date', target.session_date));
  perform internal.queue_booking_message(booking.id, 'payment_received_ticket',
    array['whatsapp', 'email']::public.notification_channel[], '{"link_scope": "view"}',
    format('weather_move_%s_%s', link.id, link.moves_used + 1));
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('result', 'rescheduled', 'visit_date', target.session_date,
                            'moves', link.moves_used + 1, 'moves_left', allowed - link.moves_used - 1);
end;
$$;

-- Rule 2, run by payments-poll every five minutes: the weather rights whose window has closed. A booking no longer
-- paid ends them as cancelled; one that moved keeps its new day (kept); one that chose nothing is cancelled and the
-- weather refund requested (auto_refunded), with a superadmin alert, and its QRIS refund is asked of Midtrans by the
-- same job's refund retries. While the method's Midtrans fee is not set the booking stays paid and a high alert asks
-- the superadmin to decide; the next run tries again. A batch at a time, oldest first.
create function internal.settle_lapsed_weather_links(p_limit integer) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  due public.weather_notice_bookings;
  booking public.bookings;
  payment public.payments;
  quote jsonb;
  counts jsonb := '{"auto_refunded": 0, "kept": 0, "cancelled": 0, "held": 0}';
  outcome text;
begin
  perform internal.require_server_caller('settle_lapsed_weather_links');
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings('{"app.in_rpc": "1", "app.actor_role": "cron"}');
  for due in
    select w.* from public.weather_notice_bookings w
    where w.resolved_at is null and w.open_until <= now()
    order by exists (select 1 from public.security_alerts a
                     where a.fingerprint = 'weather_refund_fee_unset:' || w.booking_id and a.acknowledged_at is null),
             w.open_until
    limit least(greatest(p_limit, 1), 50)
  loop
    select * into booking from public.bookings b where b.id = due.booking_id for update;
    if booking.status = 'checked_in' and not booking.needs_review and due.moves_used = 0
       and exists (select 1 from public.booking_legs l where l.id = due.booking_leg_id and l.status = 'reserved') then
      payment := internal.settled_payment_of(booking.id);
      begin
        quote := internal.weather_quote(payment, null, internal.leg_share(booking, due.booking_leg_id))
          || jsonb_build_object('leg_id', due.booking_leg_id);
      exception when sqlstate 'P0001' then
        quote := null;
      end;
      if quote is null then
        insert into public.security_alerts (rule, severity, fingerprint, title, details)
        values ('weather_refund_fee_unset', 'high', 'weather_refund_fee_unset:' || booking.id,
                'Waktu pilih cuaca habis, biaya Midtrans belum diatur: ' || booking.booking_code,
                jsonb_build_object('booking_id', booking.id, 'method', payment.method))
        on conflict (fingerprint) where acknowledged_at is null do update
        set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1;
        counts := jsonb_set(counts, '{held}', to_jsonb((counts ->> 'held')::integer + 1));
        continue;
      end if;
      perform internal.refund_weather_leg(booking, null, quote, 'cron');
      counts := jsonb_set(counts, '{auto_refunded}', to_jsonb((counts ->> 'auto_refunded')::integer + 1));
      continue;
    end if;
    if booking.status not in ('paid', 'checked_in') or booking.needs_review then
      outcome := 'cancelled';
    elsif booking.status = 'checked_in' then
      outcome := 'kept';
    elsif due.moves_used > 0 then
      outcome := 'kept';
    else
      payment := internal.settled_payment_of(booking.id);
      begin
        quote := internal.weather_quote(payment, booking.visit_date - public.today_jkt());
      exception when sqlstate 'P0001' then
        quote := null;
      end;
      if quote is null then
        insert into public.security_alerts (rule, severity, fingerprint, title, details)
        values ('weather_refund_fee_unset', 'high', 'weather_refund_fee_unset:' || booking.id,
                'Waktu pilih cuaca habis, biaya Midtrans belum diatur: ' || booking.booking_code,
                jsonb_build_object('booking_id', booking.id, 'method', payment.method))
        on conflict (fingerprint) where acknowledged_at is null do update
        set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1;
        counts := jsonb_set(counts, '{held}', to_jsonb((counts ->> 'held')::integer + 1));
        continue;
      end if;
      perform internal.cancel_paid_booking(booking, null, 'Waktu memilih jadwal cuaca habis', 'weather', quote, 'cron');
      perform internal.enqueue_notification(booking.id, 'booking_cancelled', 'whatsapp', '{}');
      perform internal.enqueue_notification(booking.id, 'booking_cancelled', 'email', '{}');
      insert into public.security_alerts (rule, severity, fingerprint, title, details)
      values ('weather_auto_refund', 'high', 'weather_auto_refund:' || booking.id,
              'Pengembalian dana cuaca otomatis: ' || booking.booking_code,
              jsonb_build_object('booking_id', booking.id, 'amount', quote -> 'amount', 'method', payment.method))
      on conflict (fingerprint) where acknowledged_at is null do nothing;
      counts := jsonb_set(counts, '{auto_refunded}', to_jsonb((counts ->> 'auto_refunded')::integer + 1));
      continue;
    end if;
    update public.weather_notice_bookings set resolution = outcome, resolved_at = now() where id = due.id;
    counts := jsonb_set(counts, array[outcome], to_jsonb((counts ->> outcome)::integer + 1));
  end loop;
  perform internal.restore_settings(previous_settings);
  return counts;
end;
$$;

-- "Konfirmasi & Bayar": whether the number the visitor just proved is the booking's own. The number travels in the
-- RPC body rather than a query string (review of PR #69, L-7); only the answer comes back.
create function internal.is_booking_phone(p_booking_id uuid, p_phone text) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (select 1 from public.bookings b where b.id = p_booking_id and b.pic_phone = p_phone);
$$;

-- A19 (decision of 2026-10-25 on M-A): a hold on a session under a weather notice that is paid later, or a booking
-- whose review clears, gets the same rights as one paid before the notice, its 24 h counted from now, and the same
-- messages. Fired by the booking's own status change, so every way to paid (the webhook, the poll, a superadmin) is
-- covered.
create function internal.grant_weather_rights_on_paid() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  link public.weather_notice_bookings;
  session public.visit_sessions;
  window_hours integer := (select (s.value #>> '{}')::integer from public.site_settings s
                           where s.key = 'booking.weather_window_hours');
begin
  if new.status <> 'paid' or new.needs_review or (old.status = 'paid' and not old.needs_review) then
    return new;
  end if;
  for link in
    insert into public.weather_notice_bookings (notice_id, booking_id, booking_leg_id, rw_id, open_until)
    select n.id, l.booking_id, l.id, l.rw_id, now() + make_interval(hours => window_hours)
    from public.booking_legs l
    join public.weather_notices n on n.visit_session_id = l.visit_session_id
    join public.visit_sessions s on s.id = l.visit_session_id
    where l.booking_id = new.id and l.status = 'reserved' and s.session_date >= public.today_jkt()
    on conflict (notice_id, booking_id) do nothing
    returning *
  loop
    select s.* into session from public.visit_sessions s
    join public.booking_legs l on l.visit_session_id = s.id where l.id = link.booking_leg_id;
    perform internal.queue_weather_messages(link, session);
  end loop;
  return new;
end;
$$;
create trigger grant_weather_rights after update of status, needs_review on public.bookings
  for each row execute function internal.grant_weather_rights_on_paid();

revoke execute on function internal.cancel_refund_pct(integer),
  internal.grant_weather_rights_on_paid(), internal.leg_share(public.bookings, uuid),
  internal.weather_leg_quote(public.bookings),
  internal.refund_weather_leg(public.bookings, uuid, jsonb, text),
  internal.package_keeper_holdings(uuid), internal.is_booking_phone(uuid, text),
  internal.midtrans_fee_of(public.payment_method, bigint), internal.settled_payment_of(uuid),
  internal.open_weather_link(uuid, smallint), internal.refund_quote(public.bookings, public.refund_request_kind),
  internal.weather_quote(public.payments, integer, bigint),
  internal.cancel_unpaid_booking(public.bookings, uuid, text),
  internal.announce_refund_request(public.bookings, public.refund_requests),
  internal.cancel_paid_booking(public.bookings, uuid, text, public.refund_request_kind, jsonb, text),
  internal.cancel_booking(uuid, uuid, text, public.refund_request_kind, bigint, smallint),
  internal.refund_requests_to_retry(integer),
  internal.queue_booking_message(uuid, public.notification_template, public.notification_channel[], jsonb, text),
  internal.queue_weather_messages(public.weather_notice_bookings, public.visit_sessions),
  internal.refund_preview(uuid, public.refund_request_kind),
  internal.mark_refund_request(uuid, public.refund_request_status, text, text),
  internal.reverse_cancellation_share(uuid, bigint, text),
  internal.book_refund_request(public.refund_requests, public.payment_status, bigint, boolean, text, uuid),
  internal.record_requested_refund(public.payments, public.payment_status, jsonb),
  internal.reschedule_for_weather(uuid, uuid),
  internal.settle_lapsed_weather_links(integer)
  from public, anon, authenticated;
revoke execute on function public.declare_weather_disruption(uuid, text) from public, anon, service_role;
grant execute on function public.declare_weather_disruption(uuid, text) to authenticated;


-- ===== Entry points for booking-service.ts and payment-service.ts (service role only) =====

create function public.svc_cancel_booking(p_booking_id uuid, p_reason text, p_kind public.refund_request_kind,
  p_expected_amount bigint, p_expected_pct smallint default null, p_actor_id uuid default null) returns jsonb
  language sql security definer
  set search_path = ''
as $$
  select internal.cancel_booking(p_booking_id, p_actor_id, p_reason, p_kind, p_expected_amount, p_expected_pct);
$$;

create function public.svc_refund_requests_to_retry(p_limit integer default 10) returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.refund_requests_to_retry(p_limit); $$;

create function public.svc_settle_lapsed_weather_links(p_limit integer default 20) returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.settle_lapsed_weather_links(p_limit); $$;

create function public.svc_is_booking_phone(p_booking_id uuid, p_phone text) returns boolean
  language sql security definer
  set search_path = ''
as $$ select internal.is_booking_phone(p_booking_id, p_phone); $$;

create function public.svc_refund_preview(p_booking_id uuid,
  p_kind public.refund_request_kind default 'cancellation') returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.refund_preview(p_booking_id, p_kind); $$;

create function public.svc_mark_refund_request(p_request_id uuid, p_status public.refund_request_status,
  p_status_code text default null, p_reason text default null) returns void
  language sql security definer
  set search_path = ''
as $$ select internal.mark_refund_request(p_request_id, p_status, p_status_code, p_reason); $$;

create function public.svc_reschedule_for_weather(p_booking_id uuid, p_session_id uuid) returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.reschedule_for_weather(p_booking_id, p_session_id); $$;

revoke execute on function public.svc_cancel_booking(uuid, text, public.refund_request_kind, bigint, smallint, uuid),
  public.svc_refund_requests_to_retry(integer),
  public.svc_settle_lapsed_weather_links(integer),
  public.svc_is_booking_phone(uuid, text),
  public.svc_refund_preview(uuid, public.refund_request_kind),
  public.svc_mark_refund_request(uuid, public.refund_request_status, text, text),
  public.svc_reschedule_for_weather(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_cancel_booking(uuid, text, public.refund_request_kind, bigint, smallint, uuid),
  public.svc_refund_requests_to_retry(integer),
  public.svc_settle_lapsed_weather_links(integer),
  public.svc_is_booking_phone(uuid, text),
  public.svc_refund_preview(uuid, public.refund_request_kind),
  public.svc_mark_refund_request(uuid, public.refund_request_status, text, text),
  public.svc_reschedule_for_weather(uuid, uuid)
  to service_role;
