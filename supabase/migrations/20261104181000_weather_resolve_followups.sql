-- Follow-ups of the delta3 review of PR #69 and the review of PR #90 (docs/PRD.md §13.1 A16–A20, Task P3.12.02), on
-- the visit terms of 20261104080100 and 20261104080200:
--
--   F-1  apply_adjustment: a manual refund Midtrans made under the adjustment's own key while the visit-terms request
--        was refunded too is applied, with refund_paid_twice_detected, only when Midtrans refunded both; otherwise it
--        is the request's own refund, rejected as already recorded, audited, with no alert.
--   F-2  a weather refund the superadmin makes by hand: a manual_refund that names a held link in
--        details.weather_link_id moves exactly that link's weather refund (the share less the payment's Midtrans
--        fee, A18), is booked as a weather refund request (the fee leaves the ledger; A20: only the stopped leg's
--        share for a visited combo), and closes the booking and the link in the same transaction (#90, H-1, M-1, M-2).
--   F-3  a held link carries its own marker (held_at, held_reason) and its own alert, weather_link_held:<link id>,
--        closed when the link is resolved (#90, L-3).
--   F-4  an answer without a transaction_status never fails a refund request.
--   F-5  resolve_weather_link resolves only a link the sweep actually held, and only as no_refund.
--   The hub tells the visitor to call the kelurahan while the weather fee is unset (WEATHER_FEE_UNSET).

-- ===== F-3: the held marker =====

alter table public.weather_notice_bookings
  add column held_at timestamptz,
  add column held_reason text check (held_reason in ('fee_unset', 'shares_short')),
  add constraint weather_notice_bookings_held_ok check ((held_at is null) = (held_reason is null));
comment on column public.weather_notice_bookings.held_at is
  'When the weather sweep first held the link for the superadmin (an unset Midtrans fee, or a leg the shares cannot fund); never cleared';
grant select (held_at, held_reason) on public.weather_notice_bookings to authenticated;
drop trigger guard_status_writes on public.weather_notice_bookings;
create trigger guard_status_writes before update on public.weather_notice_bookings
  for each row execute function internal.guard_status_writes('moves_used', 'resolution', 'open_until', 'held_at',
                                                             'held_reason');

-- The sweep holds a link once: the marker, and a high alert of its own that asks the superadmin, whatever became of
-- an earlier alert about the booking. Later runs leave both as they are.
create function internal.hold_weather_link(p_link public.weather_notice_bookings, p_booking public.bookings,
  p_reason text) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  held uuid;
begin
  update public.weather_notice_bookings set held_at = now(), held_reason = p_reason
  where id = p_link.id and held_at is null
  returning id into held;
  if held is null then
    return;
  end if;
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('weather_link_held', 'high', 'weather_link_held:' || p_link.id,
          case p_reason when 'fee_unset' then 'Waktu pilih cuaca habis, biaya Midtrans belum diatur: '
                        else 'Waktu pilih cuaca habis, bagi hasil tidak cukup untuk pengembalian dana: ' end
            || p_booking.booking_code,
          jsonb_build_object('booking_id', p_booking.id, 'link_id', p_link.id, 'reason', p_reason))
  on conflict (fingerprint) where acknowledged_at is null do nothing;
end;
$$;

-- Review of PR #90, L-3: a held link's alert closes when the link is resolved, by the superadmin who resolved it or,
-- for the sweep's own refund, with nobody's name.
create function internal.close_weather_link_alert(p_link_id uuid, p_actor_id uuid) returns void
  language sql
  set search_path = ''
as $$
  update public.security_alerts
  set acknowledged_by = p_actor_id, acknowledged_at = coalesce(acknowledged_at, now()),
      details = details || jsonb_build_object('closed', 'link_resolved')
  where fingerprint = 'weather_link_held:' || p_link_id and acknowledged_at is null;
$$;

-- L-3: the links the sweep held before this migration, told by the alerts it raised for them then, are marked once,
-- so the superadmin may resolve them without waiting for a sweep.
select set_config('app.in_rpc', '1', true), set_config('app.actor_role', 'cron', true);
update public.weather_notice_bookings w
set held_at = now(),
    held_reason = case when exists (select 1 from public.security_alerts a
                                    where a.fingerprint = 'weather_refund_fee_unset:' || w.booking_id)
                       then 'fee_unset' else 'shares_short' end
where w.resolved_at is null and w.open_until <= now() and w.held_at is null
  and exists (select 1 from public.security_alerts a
              where a.fingerprint in ('weather_refund_fee_unset:' || w.booking_id,
                                      'cancellation_needs_superadmin:' || w.booking_id));
select set_config('app.in_rpc', '', true), set_config('app.actor_role', '', true);


-- ===== The hub: the weather fee unset is the superadmin's =====

-- Replaces the 20261104080200 version: the unset fee is named by its own hint, so the hub says to call the kelurahan
-- instead of promising a refund by itself. Everything else is unchanged.
create or replace function internal.weather_quote(p_payment public.payments, p_days_before integer,
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
      using errcode = 'P0001', hint = 'WEATHER_FEE_UNSET';
  end if;
  return jsonb_build_object('kind', 'weather', 'days_before', p_days_before, 'refund_pct', null,
    'package_refund', 0, 'addon_refund', 0, 'fee_amount', least(fee, base),
    'amount', greatest(base - fee, 0), 'retained', 0, 'paid', p_payment.gross_amount,
    'method', p_payment.method, 'payment_id', p_payment.id, 'order_id', p_payment.order_id);
end;
$$;


-- ===== F-3: the sweep =====

-- Replaces the 20261104080200 version: a link it cannot settle is held through hold_weather_link (F-3) and goes to
-- the back of the queue by that marker; a link it settles closes its alert, and a link resolved meanwhile is left as
-- it is (#90, L-1, L-3). Everything else is unchanged.
create or replace function internal.settle_lapsed_weather_links(p_limit integer) returns jsonb
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
    order by w.held_at is not null, w.open_until
    limit least(greatest(p_limit, 1), 50)
  loop
    select * into booking from public.bookings b where b.id = due.booking_id for update;
    -- A20: a checked_in booking whose stopped leg is still to visit gets that leg's weather refund. A paid booking
    -- never reaches no_show or completed with its window open: close_past_bookings waits for this sweep.
    if booking.status = 'checked_in' and not booking.needs_review and due.moves_used = 0
       and exists (select 1 from public.booking_legs l where l.id = due.booking_leg_id and l.status = 'reserved') then
      payment := internal.settled_payment_of(booking.id);
      if internal.leg_pool_short(booking, (select l from public.booking_legs l where l.id = due.booking_leg_id)) then
        perform internal.hold_weather_link(due, booking, 'shares_short');
        counts := jsonb_set(counts, '{held}', to_jsonb((counts ->> 'held')::integer + 1));
        continue;
      end if;
      begin
        quote := internal.weather_quote(payment, null, internal.leg_share(booking, due.booking_leg_id))
          || jsonb_build_object('leg_id', due.booking_leg_id);
      exception when sqlstate 'P0001' then
        quote := null;
      end;
      if quote is null then
        perform internal.hold_weather_link(due, booking, 'fee_unset');
        counts := jsonb_set(counts, '{held}', to_jsonb((counts ->> 'held')::integer + 1));
        continue;
      end if;
      perform internal.refund_weather_leg(booking, null, quote, 'cron');
      perform internal.close_weather_link_alert(due.id, null);
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
        perform internal.hold_weather_link(due, booking, 'fee_unset');
        counts := jsonb_set(counts, '{held}', to_jsonb((counts ->> 'held')::integer + 1));
        continue;
      end if;
      perform internal.cancel_paid_booking(booking, null, 'Waktu memilih jadwal cuaca habis', 'weather', quote, 'cron');
      perform internal.close_weather_link_alert(due.id, null);
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
    update public.weather_notice_bookings set resolution = outcome, resolved_at = now()
    where id = due.id and resolved_at is null;
    perform internal.close_weather_link_alert(due.id, null);
    counts := jsonb_set(counts, array[outcome], to_jsonb((counts ->> outcome)::integer + 1));
  end loop;
  perform internal.restore_settings(previous_settings);
  return counts;
end;
$$;


-- ===== F-4: an answer without a transaction status =====

-- Replaces the 20261104080200 version: a missing transaction_status is not one of the statuses a failure may rest
-- on. Everything else is unchanged.
create or replace function internal.look_shows_refund_unpaid(p_request public.refund_requests) returns boolean
  language plpgsql stable
  set search_path = ''
as $$
declare
  answer public.payment_events;
  payment public.payments;
  answer_total bigint;
begin
  select * into payment from public.payments p where p.id = p_request.payment_id;
  select * into answer from public.payment_events e
  where e.id = p_request.last_checked_event_id and e.order_id = payment.order_id and e.source in ('status_api', 'poll');
  if answer.id is null or answer.status_code is distinct from '200'
     or coalesce(answer.transaction_status, '') not in ('settlement', 'capture', 'partial_refund', 'refund')
     or internal.midtrans_refunded(payment) > internal.midtrans_recorded(payment) then
    return false;
  end if;
  if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(answer.payload -> 'refunds') = 'array'
                                                     then answer.payload -> 'refunds' else '[]'::jsonb end) as x(refund)
             where x.refund ->> 'refund_key' = p_request.refund_key) then
    return false;
  end if;
  answer_total := case
    when answer.transaction_status = 'refund' then payment.gross_amount
    else greatest(coalesce(internal.midtrans_refund_total(answer.payload), 0),
                  coalesce(internal.midtrans_refund_total(answer.payload - 'refunds'), 0)) end;
  return answer_total <= internal.midtrans_recorded(payment);
end;
$$;


-- ===== F-2: a weather refund made by hand (review of PR #90, H-1, M-1, M-2) =====

-- The held link a manual_refund names in details.weather_link_id, held on the booking's settled payment (the one
-- settled_payment_of gives, so never a duplicate or disputed one). An adjustment that names no link is no weather
-- refund (null); one that names a link it may not refund is refused, so a weather refund is never booked by mistake
-- as an ordinary one or the other way round.
create function internal.named_weather_link(p_booking_id uuid, p_payment_id uuid, p_details jsonb)
  returns public.weather_notice_bookings
  language plpgsql stable
  set search_path = ''
as $$
declare
  link public.weather_notice_bookings;
begin
  if coalesce(p_details ->> 'weather_link_id', '') = '' then
    return null;
  end if;
  if p_details ->> 'weather_link_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'details.weather_link_id names a weather link by its id' using errcode = '22023';
  end if;
  select w.* into link from public.weather_notice_bookings w
  where w.id = (p_details ->> 'weather_link_id')::uuid and w.booking_id = p_booking_id
    and w.resolved_at is null and w.held_at is not null
    and p_payment_id = (internal.settled_payment_of(p_booking_id)).id;
  if link.id is null then
    raise exception 'weather link % is not held on the booking''s settled payment', p_details ->> 'weather_link_id'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return link;
end;
$$;

-- What a held link's weather refund is (A18, A20): the share, the stopped leg's for a checked_in booking, else the
-- whole payment; the Midtrans fee of that payment, which the visitor bears (WEATHER_FEE_UNSET while it is not set, so
-- the superadmin sets it first); and the refund, the share less that fee, all of it or nothing.
create function internal.held_weather_terms(p_booking public.bookings, p_link public.weather_notice_bookings,
  p_payment public.payments) returns jsonb
  language plpgsql stable
  set search_path = ''
as $$
declare
  share bigint := case when p_booking.status = 'checked_in'
                       then internal.leg_share(p_booking, p_link.booking_leg_id)
                       else p_payment.gross_amount end;
  fee bigint := internal.midtrans_fee_of(p_payment.method, p_payment.gross_amount);
begin
  if fee is null then
    raise exception 'the Midtrans fee of % payments is not set', p_payment.method
      using errcode = 'P0001', hint = 'WEATHER_FEE_UNSET';
  end if;
  return jsonb_build_object('share', share, 'fee_amount', least(fee, share), 'amount', greatest(share - fee, 0));
end;
$$;

-- A manual weather refund moves exactly the refund held_weather_terms names (REFUND_REQUEST_MISMATCH otherwise).
create function internal.check_held_weather_amount(p_booking_id uuid, p_link public.weather_notice_bookings,
  p_payment_id uuid, p_amount bigint) returns jsonb
  language plpgsql stable
  set search_path = ''
as $$
declare
  terms jsonb := internal.held_weather_terms((select b from public.bookings b where b.id = p_booking_id), p_link,
                                             (select p from public.payments p where p.id = p_payment_id));
begin
  if p_amount <> (terms ->> 'amount')::bigint then
    raise exception 'the weather refund of this link is %, not %', terms ->> 'amount', p_amount
      using errcode = 'P0001', hint = 'REFUND_REQUEST_MISMATCH';
  end if;
  return terms;
end;
$$;

-- M-1, M-2: the manual_refund naming a held link, booked and closed in one transaction, as the sweep's weather refund
-- would have been. Under the booking's lock the link and the payment's open requests are read again (L-1); the
-- refund is a weather refund request (fee_amount the payment's Midtrans fee, so recap_invariant's
-- weather_refund_fees holds), booked by book_refund_request, which reverses the ledger as a weather refund does: the
-- whole ledger for a paid booking, the stopped leg's lines alone for a visited combo (reverse_leg_share, the visited
-- RW never drawn). A refund Midtrans made under the adjustment's own id is booked under its word (L-2). Then the
-- booking is closed (close_held_weather_booking) and the link resolved as refunded_manually, so no second weather
-- refund can name it.
create function internal.record_weather_manual_refund(p_adjustment public.payment_adjustments,
  p_link public.weather_notice_bookings) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  booking public.bookings;
  link public.weather_notice_bookings;
  payment public.payments;
  request public.refund_requests;
  terms jsonb;
  is_reported boolean;
  next_refund integer;
begin
  select * into booking from public.bookings b where b.id = p_adjustment.booking_id for update;
  select * into link from public.weather_notice_bookings w where w.id = p_link.id for update;
  payment := internal.settled_payment_of(booking.id);
  if link.resolved_at is not null or link.held_at is null or payment.id is distinct from p_adjustment.payment_id
     or exists (select 1 from public.refund_requests r
                where r.payment_id = payment.id and r.status in ('requested', 'submitted', 'failed')) then
    raise exception 'weather link % is no longer held on the booking''s settled payment', p_link.id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  terms := internal.check_held_weather_amount(booking.id, link, payment.id, p_adjustment.amount);
  perform internal.require_unused_proof(booking.id, p_adjustment.evidence_path, p_adjustment.id);
  is_reported := internal.midtrans_refunded_under_key(payment.id, p_adjustment.id::text, p_adjustment.amount);
  if is_reported and internal.midtrans_refunded(payment) < internal.midtrans_recorded(payment) + p_adjustment.amount then
    raise exception 'Midtrans reports no refund of % on order %',
      internal.midtrans_recorded(payment) + p_adjustment.amount, payment.order_id
      using errcode = 'P0001', hint = 'REFUND_NOT_AT_MIDTRANS';
  end if;
  select count(*) + 1 into next_refund from public.refund_requests r where r.payment_id = payment.id;
  insert into public.refund_requests (booking_id, payment_id, booking_leg_id, kind, method, refund_key, amount,
    fee_amount, requested_by)
  values (booking.id, payment.id, case when booking.status = 'checked_in' then link.booking_leg_id end, 'weather',
          payment.method, payment.order_id || '-R' || lpad(next_refund::text, 2, '0'), p_adjustment.amount,
          (terms ->> 'fee_amount')::bigint, auth.uid())
  returning * into request;
  perform internal.book_refund_request(request,
    case when payment.refunded_amount + p_adjustment.amount >= payment.gross_amount then 'refunded'
         else 'partially_refunded' end::public.payment_status,
    payment.refunded_amount + p_adjustment.amount, is_reported, 'adjustment:' || p_adjustment.id, auth.uid());
  perform internal.close_held_weather_booking(booking, link, p_adjustment.id, auth.uid());
  update public.weather_notice_bookings set resolution = 'refunded_manually', resolved_at = now() where id = link.id;
  perform internal.close_weather_link_alert(link.id, auth.uid());
end;
$$;

-- Replaces the 20261104080200 version (F-2, H-1): a manual refund that names a held weather link gives back exactly
-- that link's weather refund, checked when it is proposed and again when it is applied. Everything else is unchanged.
create or replace function internal.check_adjustment_terms(p_type public.adjustment_type, p_booking_id uuid,
  p_payment_id uuid, p_amount bigint, p_details jsonb) returns void
  language plpgsql stable
  set search_path = ''
as $$
declare
  payment public.payments;
  link public.weather_notice_bookings;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'an adjustment moves a positive amount' using errcode = '22023';
  end if;
  if p_type = 'manual_refund' then
    select p.* into payment from public.payments p where p.id = p_payment_id and p.booking_id = p_booking_id;
    if not found or payment.status not in ('settled', 'partially_refunded', 'duplicate') then
      raise exception 'a manual refund names a settled payment of the booking'
        using errcode = 'P0001', hint = 'REFUND_NO_PAYMENT';
    end if;
    if p_amount > payment.gross_amount - payment.refunded_amount then
      raise exception 'payment % holds only % to refund', payment.order_id,
        payment.gross_amount - payment.refunded_amount using errcode = 'P0001', hint = 'REFUND_TOO_LARGE';
    end if;
    perform internal.check_refund_against_requests(payment.id, p_amount, false);
    link := internal.named_weather_link(p_booking_id, payment.id, p_details);
    if link.id is not null then
      perform internal.check_held_weather_amount(p_booking_id, link, payment.id, p_amount);
    end if;
  elsif p_type = 'reclassify_share' then
    if coalesce(p_details ->> 'from_key', '') = coalesce(p_details ->> 'to_key', '')
       or (select count(distinct e.beneficiary_key) from public.revenue_share_entries e
           where e.booking_id = p_booking_id and e.entry_type = 'settlement' and e.line_ref = p_details ->> 'line_ref'
             and e.beneficiary_key in (p_details ->> 'from_key', p_details ->> 'to_key')) < 2 then
      raise exception 'a share moves between two beneficiaries the line already pays' using errcode = '22023';
    end if;
    if p_amount > internal.share_held(p_booking_id, p_details ->> 'line_ref', p_details ->> 'from_key') then
      raise exception 'the share holds less than %', p_amount using errcode = 'P0001', hint = 'SHARE_TOO_LARGE';
    end if;
  elsif p_type <> 'write_off' then
    raise exception 'a % adjustment is not proposed here', p_type
      using errcode = 'P0001', hint = 'ADJUSTMENT_TYPE_UNSUPPORTED';
  end if;
end;
$$;


-- ===== F-1: a refund under the adjustment's own key next to the request's =====

-- F-1: a manual refund Midtrans made under the adjustment's own id while it also booked the visit-terms request R:
-- when Midtrans does not report both, that refund is R itself, already recorded, so the adjustment is rejected and
-- audited, with no alert.
create function internal.reject_recorded_refund(p_adjustment public.payment_adjustments,
  p_request public.refund_requests) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  adjustment public.payment_adjustments;
  previous_settings jsonb;
begin
  previous_settings := internal.push_settings('{"app.in_rpc": "1"}');
  update public.payment_adjustments
  set status = 'rejected',
      rejected_reason = 'Pengembalian dana ini sudah tercatat sebagai ' || p_request.refund_key
  where id = p_adjustment.id
  returning * into adjustment;
  perform internal.log_audit('adjustment.rejected', 'payment_adjustments', adjustment.id::text,
    jsonb_build_object('reason', 'already_recorded', 'refund_key', p_request.refund_key));
  perform internal.restore_settings(previous_settings);
  return to_jsonb(adjustment);
end;
$$;

-- Replaces the 20261104080200 version (F-1, F-2): next to a visit-terms request Midtrans refunded meanwhile, a refund
-- made under the adjustment's own key is applied only when Midtrans reports both, still raising
-- refund_paid_twice_detected, and is otherwise rejected as already recorded; a manual refund that names a held
-- weather link is booked as that link's weather refund, which closes the booking and the link
-- (record_weather_manual_refund). Everything else is unchanged.
create or replace function public.apply_adjustment(p_id uuid) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  adjustment public.payment_adjustments;
  overtaken public.refund_requests;
  payment public.payments;
  link public.weather_notice_bookings;
  is_paid_twice boolean := false;
  previous_settings jsonb;
begin
  perform internal.require_finance_writer();
  perform internal.take_audit_turn();
  adjustment := internal.open_adjustment(p_id, 'approved');
  if now() < adjustment.apply_not_before then
    raise exception 'this adjustment applies from %', adjustment.apply_not_before
      using errcode = 'P0001', hint = 'APPLY_TOO_EARLY';
  end if;
  if adjustment.type = 'manual_refund' then
    overtaken := internal.request_refunded_by_midtrans_since(adjustment);
    if overtaken.id is not null then
      if not internal.midtrans_refunded_under_key(adjustment.payment_id, p_id::text, adjustment.amount) then
        return internal.reject_overtaken_refund(adjustment, overtaken);
      end if;
      select * into payment from public.payments p where p.id = adjustment.payment_id;
      if internal.midtrans_refunded(payment) < internal.midtrans_recorded(payment) + adjustment.amount then
        return internal.reject_recorded_refund(adjustment, overtaken);
      end if;
      is_paid_twice := true;
    end if;
  end if;
  perform internal.check_adjustment_terms(adjustment.type, adjustment.booking_id, adjustment.payment_id,
                                          adjustment.amount, adjustment.details);

  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1', 'app.adjustment_id', p_id::text));
  if adjustment.type = 'manual_refund' then
    link := internal.named_weather_link(adjustment.booking_id, adjustment.payment_id, adjustment.details);
    if link.id is not null then
      perform internal.record_weather_manual_refund(adjustment, link);
    else
      perform internal.record_refund_core(adjustment.booking_id, adjustment.payment_id, adjustment.amount,
                                          'adjustment:' || p_id, adjustment.reason, adjustment.evidence_path,
                                          auth.uid(),
                                          internal.midtrans_refunded_under_key(adjustment.payment_id, p_id::text,
                                                                               adjustment.amount));
    end if;
  elsif adjustment.type = 'reclassify_share' then
    perform internal.apply_reclassify_share(adjustment);
  else
    insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
    select b.id, b.status, b.status, 'admin', auth.uid(), 'write_off',
           jsonb_build_object('adjustment_id', p_id, 'amount', adjustment.amount)
    from public.bookings b where b.id = adjustment.booking_id;
  end if;
  update public.payment_adjustments set status = 'applied', applied_at = now(), applied_by = auth.uid()
  where id = p_id
  returning * into adjustment;
  if is_paid_twice then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('refund_paid_twice_detected', 'high', 'refund_paid_twice_detected:' || adjustment.id,
            'Pengunjung mungkin menerima dua kali pengembalian dana: Midtrans mengembalikan '
              || overtaken.refund_key || ' dan pengembalian dana penyesuaian ini',
            jsonb_build_object('adjustment_id', adjustment.id, 'booking_id', adjustment.booking_id,
                               'refund_key', overtaken.refund_key, 'amount', adjustment.amount))
    on conflict (fingerprint) where acknowledged_at is null do nothing;
  end if;
  if adjustment.approved_by = adjustment.proposed_by then
    perform internal.raise_adjustment_alert('adjustment_self_applied',
                                            'Penyesuaian yang disetujui sendiri telah diterapkan', adjustment);
  end if;
  perform internal.restore_settings(previous_settings);
  return to_jsonb(adjustment);
end;
$$;


-- ===== F-2, F-5: closing a held link =====

-- What the weather refund of a held link does to its booking, as the sweep's weather refund would: a paid booking is
-- cancelled (its tickets revoked, its seats given back, booking_cancelled sent; book_refund_request voided its
-- invoice), a visited combo's stopped leg is released and its ticket revoked.
create function internal.close_held_weather_booking(p_booking public.bookings, p_link public.weather_notice_bookings,
  p_adjustment_id uuid, p_actor_id uuid) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  leg public.booking_legs;
begin
  if p_booking.status = 'paid' then
    update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor_id,
      cancel_reason = 'Pengembalian dana cuaca oleh kelurahan'
    where id = p_booking.id;
    perform internal.revoke_booking_tickets(p_booking.id, 'weather_refund', p_actor_id);
    perform internal.release_booking_quota(p_booking.id);
    insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
    values (p_booking.id, 'paid', 'cancelled', 'admin', p_actor_id, 'weather_refund',
            jsonb_build_object('adjustment_id', p_adjustment_id));
    perform internal.enqueue_notification(p_booking.id, 'booking_cancelled', 'whatsapp', '{}');
    perform internal.enqueue_notification(p_booking.id, 'booking_cancelled', 'email', '{}');
    return;
  end if;
  select * into leg from public.booking_legs l where l.id = p_link.booking_leg_id for update;
  if p_booking.status <> 'checked_in' or leg.status <> 'reserved' then
    return;
  end if;
  update public.visit_sessions set reserved_pax = greatest(reserved_pax - leg.pax_count, 0)
  where id = leg.visit_session_id;
  update public.booking_legs set status = 'released', quota_released_at = now() where id = leg.id;
  update public.tickets_qr
  set status = 'revoked', revoked_at = now(), revoked_by = p_actor_id, revoke_reason = 'weather_refund'
  where booking_leg_id = leg.id and status in ('issued', 'suspended');
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  values (p_booking.id, p_booking.status, p_booking.status, 'admin', p_actor_id, 'weather_refund_leg',
          jsonb_build_object('adjustment_id', p_adjustment_id, 'leg_id', leg.id));
end;
$$;

-- Replaces the 20261104080200 version (F-5; review of PR #90, M-1, M-2, L-1): only a link the sweep held (held_at),
-- and only as no_refund: a weather refund made by hand closes its link itself, when the manual_refund naming it is
-- applied, and a link that has a weather refund request is refused. The booking is locked before the link, the order
-- every writer keeps. Superadmin at AAL2 with a fresh code and a reason, audited.
create or replace function public.resolve_weather_link(p_link_id uuid, p_outcome text, p_reason text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  link public.weather_notice_bookings;
  previous_settings jsonb;
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'only a superadmin resolves a held weather link' using errcode = '42501';
  end if;
  if not public.fresh_totp() then
    raise exception 'confirm with a fresh authenticator code first' using errcode = '42501', hint = 'FRESH_TOTP';
  end if;
  if p_outcome is distinct from 'no_refund' then
    raise exception 'a held weather link is resolved here as no_refund; a refund by hand closes it when applied'
      using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 300 then
    raise exception 'say why in 10 to 300 characters' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  perform 1 from public.bookings b
  where b.id = (select w.booking_id from public.weather_notice_bookings w where w.id = p_link_id)
  for update;
  select * into link from public.weather_notice_bookings w where w.id = p_link_id for update;
  if link.id is null then
    raise exception 'weather link % does not exist', p_link_id using errcode = 'P0002';
  end if;
  if link.resolved_at is not null or link.held_at is null
     or exists (select 1 from public.refund_requests r
                where r.booking_id = link.booking_id and r.kind = 'weather'
                  and (r.booking_leg_id is null or r.booking_leg_id = link.booking_leg_id)) then
    raise exception 'weather link % is not one the sweep holds', p_link_id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || internal.document_actor(auth.uid()));
  update public.weather_notice_bookings set resolution = 'no_refund', resolved_at = now() where id = link.id
  returning * into link;
  perform internal.close_weather_link_alert(link.id, auth.uid());
  perform internal.log_audit('weather_link.resolved', 'weather_notice_bookings', link.id::text,
    jsonb_build_object('booking_id', link.booking_id, 'outcome', 'no_refund', 'reason', left(btrim(p_reason), 300)));
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('result', 'resolved', 'link_id', link.id, 'resolution', link.resolution);
end;
$$;


revoke execute on function internal.hold_weather_link(public.weather_notice_bookings, public.bookings, text),
  internal.close_weather_link_alert(uuid, uuid),
  internal.named_weather_link(uuid, uuid, jsonb),
  internal.held_weather_terms(public.bookings, public.weather_notice_bookings, public.payments),
  internal.check_held_weather_amount(uuid, public.weather_notice_bookings, uuid, bigint),
  internal.record_weather_manual_refund(public.payment_adjustments, public.weather_notice_bookings),
  internal.reject_recorded_refund(public.payment_adjustments, public.refund_requests),
  internal.close_held_weather_booking(public.bookings, public.weather_notice_bookings, uuid, uuid)
  from public, anon, authenticated;
