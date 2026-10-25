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

-- The weather notice still open for a booking: one on a session of its legs, declared no longer ago than
-- booking.weather_window_hours (A17). Null when there is none.
create function internal.open_weather_notice(p_booking_id uuid) returns public.weather_notices
  language sql stable
  set search_path = ''
as $$
  select n.* from public.weather_notices n
  join public.booking_legs l on l.visit_session_id = n.visit_session_id
  where l.booking_id = p_booking_id
    and now() < n.declared_at + make_interval(hours => (select (s.value #>> '{}')::integer
                                                         from public.site_settings s
                                                         where s.key = 'booking.weather_window_hours'))
  order by n.declared_at desc
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
  fee bigint := 0;
  refund bigint;
begin
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
    if (internal.open_weather_notice(p_booking.id)).id is null then
      raise exception 'booking % has no open weather notice', p_booking.id
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
    fee := internal.midtrans_fee_of(payment.method, payment.gross_amount);
    if fee is null then
      raise exception 'the Midtrans fee of % payments is not set', payment.method
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
    refund := greatest(payment.gross_amount - fee, 0);
    return jsonb_build_object('kind', p_kind, 'days_before', days_before, 'refund_pct', null,
      'package_refund', 0, 'addon_refund', 0, 'fee_amount', least(fee, payment.gross_amount), 'amount', refund,
      'retained', 0, 'paid', payment.gross_amount, 'method', payment.method, 'payment_id', payment.id,
      'order_id', payment.order_id);
  end if;

  pct := internal.cancel_refund_pct(days_before);
  package_refund := (package_paid * pct) / 100;
  refund := package_refund + addon_paid;
  return jsonb_build_object('kind', p_kind, 'days_before', days_before, 'refund_pct', pct,
    'package_refund', package_refund, 'addon_refund', addon_paid, 'fee_amount', 0, 'amount', refund,
    'retained', payment.gross_amount - refund, 'paid', payment.gross_amount, 'method', payment.method,
    'payment_id', payment.id, 'order_id', payment.order_id);
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

-- A paid booking under the terms: cancelled, every ticket revoked and every seat released now; the refund the quote
-- gives is requested, never paid here. Nothing is booked in the ledger until the refund itself is (A16). The visitor
-- confirms the figures the hub previewed; when the quote has moved since (the day turned, the fee changed), nothing
-- happens and PRICE_MISMATCH asks them to look again (review of PR #69, M3).
create function internal.cancel_paid_booking(p_booking public.bookings, p_actor_id uuid, p_reason text,
  p_kind public.refund_request_kind, p_expected_amount bigint, p_expected_pct smallint) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  quote jsonb := internal.refund_quote(p_booking, p_kind);
  request public.refund_requests;
  next_refund integer;
begin
  if (quote ->> 'amount')::bigint is distinct from p_expected_amount
     or (quote ->> 'refund_pct')::smallint is distinct from p_expected_pct then
    raise exception 'the refund of booking % is now %, not the % previewed', p_booking.id, quote ->> 'amount',
      p_expected_amount using errcode = 'P0001', hint = 'PRICE_MISMATCH';
  end if;
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
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  values (p_booking.id, 'paid', 'cancelled', case when p_actor_id is null then 'visitor' else 'admin' end, p_actor_id,
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
  elsif booking.status = 'paid' then
    outcome := internal.cancel_paid_booking(booking, p_actor_id, p_reason, p_kind, p_expected_amount,
                                            p_expected_pct);
  else
    raise exception 'a % booking is not cancelled here', booking.status using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  perform internal.enqueue_notification(booking.id, 'booking_cancelled', 'whatsapp', '{}');
  perform internal.enqueue_notification(booking.id, 'booking_cancelled', 'email', '{}');
  perform internal.restore_settings(previous_settings);
  return outcome;
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
  if request.id is not null and p_status = 'failed' then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('refund_failed', 'high', 'refund_failed:' || request.refund_key,
            'Pengembalian dana QRIS ditolak Midtrans; selesaikan di Keuangan',
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
                     where r.booking_id = s.booking_id and r.entry_type = 'reversal'
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

-- The refund request of a payment that is being refunded, once its money has gone back: the payment takes Midtrans'
-- status and the cumulative refunded amount, the ledger gives back what the request names, the invoice is voided with
-- a credit note, the request is recorded and refund_processed goes out. The booking stays cancelled: its seats and
-- tickets went with the cancellation. p_refunded is the cumulative amount Midtrans (or the transfer) has returned.
create function internal.book_refund_request(p_request public.refund_requests, p_target public.payment_status,
  p_refunded bigint) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  ledger jsonb;
begin
  update public.payments set status = p_target, refunded_amount = p_refunded where id = p_request.payment_id;
  if p_request.kind = 'cancellation' then
    ledger := internal.reverse_cancellation_share(p_request.booking_id, p_request.package_refund, p_request.refund_key);
  else
    ledger := internal.reverse_revenue_share(p_request.booking_id,
      (select coalesce(sum(e.amount), 0)::bigint from public.revenue_share_entries e
       where e.booking_id = p_request.booking_id and e.entry_type in ('settlement', 'reversal')),
      p_request.refund_key, 'weather_refund');
  end if;
  update public.invoices
  set status = 'void', voided_at = now(), void_reason = case when p_request.kind = 'weather' then 'weather_refund'
                                                              else 'cancelled' end,
      credit_note_number = coalesce(credit_note_number, internal.next_document_number('credit_note', now()))
  where booking_id = p_request.booking_id and status = 'paid';
  update public.refund_requests set status = 'recorded', recorded_at = now() where id = p_request.id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, reason, payload)
  values (p_request.booking_id, 'cancelled', 'cancelled', 'webhook', 'refund_recorded',
          jsonb_build_object('refund_key', p_request.refund_key, 'amount', p_request.amount));
  perform internal.enqueue_notification(p_request.booking_id, 'refund_processed', 'whatsapp', '{}');
  perform internal.enqueue_notification(p_request.booking_id, 'refund_processed', 'email', '{}');
  return jsonb_build_object('result', 'applied', 'processing_result', 'refund_recorded', 'payment_status', p_target,
                            'booking_status', 'cancelled', 'ledger', ledger);
end;
$$;

-- A refund Midtrans reports for a payment with an open refund request (QRIS): booked when the cumulative refund_amount
-- of the confirmed answer is what was refunded before plus this request; any other amount, or none, is the refund
-- someone made by hand, which keeps the alert of 20261024095000 for the superadmin's record_refund. A request marked
-- failed still matches: a refusal Midtrans later carried out after all is booked like any other (review of PR #69, M1).
create function internal.record_requested_refund(p_payment public.payments, p_target public.payment_status,
  p_answer jsonb) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  request public.refund_requests;
  reported bigint;
begin
  select * into request from public.refund_requests r
  where r.payment_id = p_payment.id and r.status in ('requested', 'submitted', 'failed') and r.method = 'qris'
  for update;
  if request.id is null or coalesce(p_answer ->> 'refund_amount', '') !~ '^[0-9]{1,15}(\.0{1,2})?$' then
    return null;
  end if;
  reported := split_part(p_answer ->> 'refund_amount', '.', 1)::bigint;
  if reported <> p_payment.refunded_amount + request.amount then
    return null;
  end if;
  return internal.book_refund_request(request, p_target, reported);
end;
$$;

-- Replaces the 20261024100300 version. A refund notification for a payment whose cancellation requested it is booked
-- (A16); every other refund keeps the alert and waits for record_refund. Everything else is unchanged.
create or replace function internal.apply_payment_status(p_booking public.bookings, p_payment public.payments,
  p_target public.payment_status, p_answer jsonb, p_actor_type text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  is_open boolean := p_payment.status in ('initiated', 'pending');
  is_whole_refund boolean := p_target = 'refunded'
    or (coalesce(p_answer ->> 'refund_amount', '') ~ '^[0-9]{1,15}(\.0{1,2})?$'
        and split_part(p_answer ->> 'refund_amount', '.', 1)::bigint >= p_payment.gross_amount);
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
    if p_booking.status = 'cancelled' and p_payment.status in ('settled', 'partially_refunded') then
      booked := internal.record_requested_refund(p_payment, p_target, p_answer);
      if booked is not null then
        return booked;
      end if;
    end if;
    if is_whole_refund and p_payment.status in ('settled', 'partially_refunded') then
      perform internal.suspend_booking_tickets(p_booking.id, 'refund_seen');
    end if;
    return internal.note_refund_seen(p_payment, p_target);
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


-- ===== Weather (A17) =====

-- Staff RPC (docs/PRD.md §8.7): an RW admin of the session's RW, or the superadmin, at AAL2, says the weather stopped a
-- session that is today or ahead. A second call for the same session answers the notice already there.
create function public.declare_weather_disruption(p_session_id uuid, p_reason text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  session public.visit_sessions;
  notice public.weather_notices;
  affected integer;
begin
  if not (public.is_staff() and public.aal2()) then
    raise exception 'only staff at AAL2 declare the weather' using errcode = '42501';
  end if;
  select * into session from public.visit_sessions s where s.id = p_session_id;
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
  end if;
  -- The session takes no new booking and no weather move (review of PR #69, L2): closed sessions are out of
  -- v_session_availability, create_booking and reschedule_for_weather alike. Its own bookings keep their seats.
  update public.visit_sessions set status = 'closed' where id = session.id and status = 'open';
  select count(distinct l.booking_id) into affected
  from public.booking_legs l join public.bookings b on b.id = l.booking_id
  where l.visit_session_id = session.id and b.status = 'paid';
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('notice_id', notice.id, 'declared_at', notice.declared_at, 'affected_bookings', affected);
end;
$$;

-- The ticket message (payment_received_ticket, gsk_ticket_issued_v1) once more after the tickets changed, under a
-- dedupe key of its own so the outbox does not take it for the first one. The same checks as enqueue_notification:
-- a channel switched off, an unverified WhatsApp number or a missing address queues nothing.
create function internal.resend_ticket_message(p_booking_id uuid, p_occasion text) returns void
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
  foreach channel in array array['whatsapp', 'email']::public.notification_channel[] loop
    recipient := case channel when 'whatsapp' then booking.pic_phone else booking.pic_email end;
    continue when recipient is null
      or not internal.setting_is_on(case channel when 'whatsapp' then 'whatsapp_enabled' else 'email_enabled' end)
      or (channel = 'whatsapp' and booking.phone_verified_at is null);
    insert into public.notifications (booking_id, channel, template, recipient, recipient_name, params, dedupe_key)
    values (p_booking_id, channel, 'payment_received_ticket', recipient, booking.pic_first_name,
            '{"link_scope": "view"}', format('booking:%s:payment_received_ticket:%s:%s', p_booking_id, channel,
                                             p_occasion))
    on conflict (dedupe_key) do nothing;
  end loop;
end;
$$;

-- A paid booking moves, leg by leg in leg order, to the sessions p_session_ids names (A17): within the open notice's
-- window, at most booking.weather_reschedule_max times, each new session open (a session under a weather notice is
-- closed), of the leg's RW, no sooner than booking.min_lead_hours and no later than booking.max_advance_days, all on
-- one day as a combo's legs are. Seats are given back and taken in one transaction, every session locked in id order
-- (BOOK-01), so a full session refuses the whole move (QUOTA_UNAVAILABLE). The tickets keep their codes and move with
-- their legs; the QR signs the new day, so the old one no longer passes a gate, and the ticket message goes out again
-- with the new day (review of PR #69, M2).
create function internal.reschedule_for_weather(p_booking_id uuid, p_session_ids uuid[]) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  booking public.bookings;
  allowed integer := (select (s.value #>> '{}')::integer from public.site_settings s
                      where s.key = 'booking.weather_reschedule_max');
  moves integer;
  pairs jsonb;
  new_day date;
  minutes_before integer := (select (s.value #>> '{}')::integer from public.site_settings s
                             where s.key = 'checkin.grace_before_minutes');
  minutes_after integer := (select (s.value #>> '{}')::integer from public.site_settings s
                            where s.key = 'checkin.grace_after_minutes');
  lead_hours integer := (select (s.value #>> '{}')::integer from public.site_settings s
                         where s.key = 'booking.min_lead_hours');
  advance_days integer := (select (s.value #>> '{}')::integer from public.site_settings s
                           where s.key = 'booking.max_advance_days');
  step record;
begin
  perform internal.require_server_caller('reschedule_for_weather');
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings('{"app.in_rpc": "1", "app.actor_role": "visitor"}');
  select * into booking from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if booking.status <> 'paid' or booking.needs_review then
    raise exception 'only a paid booking moves for the weather' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if (internal.open_weather_notice(booking.id)).id is null then
    raise exception 'booking % has no open weather notice', booking.id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  select count(*) into moves from public.booking_events e
  where e.booking_id = booking.id and e.reason = 'weather_reschedule';
  if moves >= allowed then
    raise exception 'booking % has moved for the weather % times already', booking.id, moves
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  -- Each leg in leg order with the session it moves to.
  select jsonb_agg(jsonb_build_object('leg_id', l.id, 'from', l.visit_session_id, 'to', target.session_id,
                                      'pax', l.pax_count, 'rw_id', l.rw_id) order by l.leg_order)
    into pairs
  from public.booking_legs l
  join unnest(p_session_ids) with ordinality as target(session_id, position) on target.position = l.leg_order
  where l.booking_id = booking.id and l.status = 'reserved';
  if pairs is null or jsonb_array_length(pairs) <> cardinality(p_session_ids)
     or jsonb_array_length(pairs) <> (select count(*) from public.booking_legs l where l.booking_id = booking.id) then
    raise exception 'name one new session for every leg, in leg order' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if exists (select 1 from jsonb_array_elements(pairs) as p(pair)
             join public.visit_sessions s on s.id = (p.pair ->> 'to')::uuid
             where s.rw_id <> (p.pair ->> 'rw_id')::smallint or s.status <> 'open'
                or (s.session_date + s.start_time) at time zone 'Asia/Jakarta'
                   < now() + make_interval(hours => coalesce(lead_hours, 0))
                or (advance_days is not null and s.session_date > public.today_jkt() + advance_days)
                or s.id = (p.pair ->> 'from')::uuid)
     or (select count(*) from jsonb_array_elements(pairs) as p(pair)
         join public.visit_sessions s on s.id = (p.pair ->> 'to')::uuid) <> jsonb_array_length(pairs) then
    raise exception 'each new session is an open session of the leg''s RW, ahead, and not the one it leaves'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  select min(s.session_date) into new_day from jsonb_array_elements(pairs) as p(pair)
  join public.visit_sessions s on s.id = (p.pair ->> 'to')::uuid;
  if exists (select 1 from jsonb_array_elements(pairs) as p(pair)
             join public.visit_sessions s on s.id = (p.pair ->> 'to')::uuid where s.session_date <> new_day) then
    raise exception 'a booking''s legs take one day' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  -- Every session the move touches, in id order: seats taken on the new one, given back on the old one.
  for step in
    select x.session_id, x.pax, x.direction from (
      select (p.pair ->> 'to')::uuid as session_id, (p.pair ->> 'pax')::integer as pax, 'take' as direction
      from jsonb_array_elements(pairs) as p(pair)
      union all
      select (p.pair ->> 'from')::uuid, (p.pair ->> 'pax')::integer, 'give'
      from jsonb_array_elements(pairs) as p(pair)
    ) as x
    order by x.session_id
  loop
    if step.direction = 'take' then
      perform internal.reserve_session_quota(step.session_id, step.pax);
    else
      update public.visit_sessions set reserved_pax = greatest(reserved_pax - step.pax, 0) where id = step.session_id;
    end if;
  end loop;

  update public.booking_legs l set visit_session_id = (p.pair ->> 'to')::uuid, quota_reserved_at = now()
  from jsonb_array_elements(pairs) as p(pair) where l.id = (p.pair ->> 'leg_id')::uuid;
  update public.tickets_qr t
  set visit_session_id = s.id, valid_on = s.session_date,
      valid_from = (s.session_date + s.start_time) at time zone 'Asia/Jakarta' - make_interval(mins => minutes_before),
      valid_until = (s.session_date + s.end_time) at time zone 'Asia/Jakarta' + make_interval(mins => minutes_after)
  from jsonb_array_elements(pairs) as p(pair)
  join public.visit_sessions s on s.id = (p.pair ->> 'to')::uuid
  where t.booking_leg_id = (p.pair ->> 'leg_id')::uuid and t.status = 'issued';
  update public.bookings b set visit_date = new_day, visit_date_end = new_day where b.id = booking.id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, reason, payload)
  values (booking.id, 'paid', 'paid', 'visitor', 'weather_reschedule',
          jsonb_build_object('moves', moves + 1, 'visit_date', new_day,
                             'sessions', (select jsonb_agg(jsonb_build_object('from', p.pair -> 'from', 'to', p.pair -> 'to'))
                                          from jsonb_array_elements(pairs) as p(pair))));
  perform internal.resend_ticket_message(booking.id, 'weather_move_' || (moves + 1));
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('result', 'rescheduled', 'visit_date', new_day, 'moves', moves + 1);
end;
$$;

revoke execute on function internal.cancel_refund_pct(integer),
  internal.midtrans_fee_of(public.payment_method, bigint), internal.settled_payment_of(uuid),
  internal.open_weather_notice(uuid), internal.refund_quote(public.bookings, public.refund_request_kind),
  internal.cancel_unpaid_booking(public.bookings, uuid, text),
  internal.announce_refund_request(public.bookings, public.refund_requests),
  internal.cancel_paid_booking(public.bookings, uuid, text, public.refund_request_kind, bigint, smallint),
  internal.cancel_booking(uuid, uuid, text, public.refund_request_kind, bigint, smallint),
  internal.refund_requests_to_retry(integer),
  internal.resend_ticket_message(uuid, text),
  internal.refund_preview(uuid, public.refund_request_kind),
  internal.mark_refund_request(uuid, public.refund_request_status, text, text),
  internal.reverse_cancellation_share(uuid, bigint, text),
  internal.book_refund_request(public.refund_requests, public.payment_status, bigint),
  internal.record_requested_refund(public.payments, public.payment_status, jsonb),
  internal.reschedule_for_weather(uuid, uuid[])
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

create function public.svc_reschedule_for_weather(p_booking_id uuid, p_session_ids uuid[]) returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.reschedule_for_weather(p_booking_id, p_session_ids); $$;

revoke execute on function public.svc_cancel_booking(uuid, text, public.refund_request_kind, bigint, smallint, uuid),
  public.svc_refund_requests_to_retry(integer),
  public.svc_refund_preview(uuid, public.refund_request_kind),
  public.svc_mark_refund_request(uuid, public.refund_request_status, text, text),
  public.svc_reschedule_for_weather(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.svc_cancel_booking(uuid, text, public.refund_request_kind, bigint, smallint, uuid),
  public.svc_refund_requests_to_retry(integer),
  public.svc_refund_preview(uuid, public.refund_request_kind),
  public.svc_mark_refund_request(uuid, public.refund_request_status, text, text),
  public.svc_reschedule_for_weather(uuid, uuid[])
  to service_role;
