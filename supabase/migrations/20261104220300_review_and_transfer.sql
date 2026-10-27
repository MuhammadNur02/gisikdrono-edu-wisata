-- Task P4.3.08, the rest (docs/PRD.md §13.1 A28, owner-delegated decisions of 2026-10-28; FR-ADMIN-05; docs/Security.md
-- REC-08, REC-09, REC-16, AUTH-11):
--
--   resolve_booking_review  A booking paid after its hold lapsed and whose session filled meanwhile
--                           (PAID_AFTER_EXPIRY_NO_QUOTA) is the superadmin's, with a fresh code and a reason: either it
--                           moves to other open sessions of its RWs, the seats reserved in one transaction and the money
--                           kept, or the whole payment goes back (internal.full_refund_quote), the visitor not at fault.
--   manual transfer         A9's bank transfer is a manual_mark_paid adjustment with its proof under dual control:
--                           propose, approve by a second superadmin (or the sole superadmin after 24 hours), apply, which
--                           settles it through internal.settle_payment. It never settles at once. propose_adjustment,
--                           check_adjustment_terms and apply_adjustment are replaced for it; every other type is
--                           unchanged.


-- ===== resolve_booking_review =====

-- The legs of a booking under review move to p_session_ids, one per leg: an open session of the leg's RW that has not
-- started, within booking.max_advance_days. The seats are reserved in session id order, all or none
-- (QUOTA_UNAVAILABLE otherwise, and nothing moves).
create function internal.move_released_legs(p_booking public.bookings, p_session_ids uuid[]) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  advance_days integer := (select (s.value #>> '{}')::integer from public.site_settings s
                           where s.key = 'booking.max_advance_days');
  step record;
begin
  perform 1 from public.booking_legs l where l.booking_id = p_booking.id order by l.id for update;
  if cardinality(coalesce(p_session_ids, '{}')) <> (select count(*) from public.booking_legs l
                                                    where l.booking_id = p_booking.id)
     or exists (
       select 1 from public.booking_legs l
       where l.booking_id = p_booking.id
         and (l.status <> 'released'
              or (select count(*) from public.visit_sessions s
                  where s.id = any (p_session_ids) and s.rw_id = l.rw_id and s.status = 'open'
                    and (s.session_date + s.start_time) at time zone 'Asia/Jakarta' > now()
                    and (advance_days is null or s.session_date <= public.today_jkt() + advance_days)) <> 1)) then
    raise exception 'each leg moves to an open session of its RW that has not started'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
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
revoke execute on function internal.move_released_legs(public.bookings, uuid[]) from public, anon, authenticated;

-- A28 (2026-10-28, owner-delegated): 'move' keeps the money and issues the tickets of the new sessions; 'refund' gives
-- the whole payment back through cancel_paid_booking. Either is audited with its reason. The answer of a refund is the
-- cancellation's, whose QRIS refund the server asks of Midtrans (payment-service.ts settleCancellation).
create function public.resolve_booking_review(p_booking_id uuid, p_resolution text, p_reason text,
  p_session_ids uuid[] default null, p_key_id text default null) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  booking public.bookings;
  outcome jsonb;
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'only the superadmin at AAL2 resolves a booking under review' using errcode = '42501';
  end if;
  if not public.fresh_totp() then
    raise exception 'confirm with a fresh authenticator code first' using errcode = '42501', hint = 'FRESH_TOTP';
  end if;
  if p_resolution is null or p_resolution not in ('move', 'refund')
     or length(btrim(coalesce(p_reason, ''))) not between 10 and 300 then
    raise exception 'a resolution is move or refund, with a reason of 10 to 300 characters' using errcode = '22023';
  end if;
  if p_resolution = 'move' and not exists (select 1 from public.site_settings s
                                          where s.key = 'qr.signing_kids' and s.value ? coalesce(p_key_id, '')) then
    raise exception 'the QR key id is not one tickets are signed with' using errcode = 'P0001', hint = 'QR_KEY_UNKNOWN';
  end if;
  perform internal.take_audit_turn();
  select * into booking from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if booking.status <> 'paid' or not booking.needs_review
     or booking.review_reason is distinct from 'PAID_AFTER_EXPIRY_NO_QUOTA' then
    raise exception 'booking % is not a paid booking waiting for seats', booking.booking_code
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || case when p_resolution = 'move' then jsonb_build_object('app.qr_key_id', p_key_id) else '{}'::jsonb end
    || internal.document_actor(auth.uid()));
  if p_resolution = 'move' then
    perform internal.move_released_legs(booking, p_session_ids);
    perform internal.issue_booking_tickets(booking.id);
    perform internal.enqueue_notification(booking.id, 'payment_received_ticket', 'whatsapp', '{"link_scope": "view"}',
                                          'review_moved');
    perform internal.enqueue_notification(booking.id, 'payment_received_ticket', 'email', '{"link_scope": "view"}',
                                          'review_moved');
    select * into booking from public.bookings b where b.id = booking.id;
    outcome := jsonb_build_object('result', 'moved', 'visit_date', booking.visit_date);
  else
    update public.bookings set needs_review = false, review_reason = null where id = booking.id
    returning * into booking;
    outcome := internal.cancel_paid_booking(booking, auth.uid(), btrim(p_reason), 'cancellation',
                                            internal.full_refund_quote(booking), 'admin');
    perform internal.enqueue_notification(booking.id, 'booking_cancelled', 'whatsapp', '{}');
    perform internal.enqueue_notification(booking.id, 'booking_cancelled', 'email', '{}');
  end if;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  select b.id, 'paid', b.status, 'admin', auth.uid(), 'review_resolved',
         jsonb_build_object('resolution', p_resolution, 'reason', btrim(p_reason))
  from public.bookings b where b.id = booking.id;
  perform internal.log_audit('bookings.review_resolved', 'bookings', booking.id::text,
    jsonb_build_object('resolution', p_resolution, 'reason', btrim(p_reason), 'sessions', to_jsonb(p_session_ids)));
  perform internal.restore_settings(previous_settings);
  return outcome;
end;
$$;
revoke execute on function public.resolve_booking_review(uuid, text, text, uuid[], text) from public, anon, service_role;
grant execute on function public.resolve_booking_review(uuid, text, text, uuid[], text) to authenticated;


-- ===== The manual transfer (A9, A28) =====

-- Replaces the 20261104190100 version: a manual_mark_paid adjustment keeps the QR key id its tickets are signed with.
create or replace function public.propose_adjustment(p_type public.adjustment_type, p_booking_id uuid, p_amount bigint,
  p_reason text, p_evidence_path text, p_details jsonb default '{}', p_payment_id uuid default null) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  proposed public.payment_adjustments;
  previous_settings jsonb;
  details jsonb := case
    when p_type = 'reclassify_share'
      then jsonb_build_object('line_ref', p_details ->> 'line_ref', 'from_key', p_details ->> 'from_key',
                              'to_key', p_details ->> 'to_key')
    when p_type = 'manual_refund'
      then jsonb_strip_nulls(jsonb_build_object('weather_link_id', lower(btrim(p_details ->> 'weather_link_id'))))
    when p_type = 'manual_mark_paid'
      then jsonb_build_object('key_id', p_details ->> 'key_id')
    else '{}' end;
begin
  perform internal.require_finance_writer();
  if p_evidence_path is null
     or p_evidence_path !~ ('^bookings/' || p_booking_id
                            || '/adjustment-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
                            || '\.(pdf|jpg|jpeg|png|webp)$') then
    raise exception 'an adjustment keeps its evidence under documents/bookings/%/', p_booking_id
      using errcode = '22023';
  end if;
  perform internal.require_document(p_evidence_path);
  -- The audit turn before any row lock, as every writer takes them (review of PR #68, L3).
  perform internal.take_audit_turn();
  perform 1 from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  -- Under the booking's lock, so two proposals naming one file cannot both pass (L2 c).
  perform internal.require_unused_proof(p_booking_id, p_evidence_path, null);
  perform internal.check_adjustment_terms(p_type, p_booking_id, p_payment_id, p_amount, details);
  if exists (select 1 from public.payment_adjustments a
             where a.booking_id = p_booking_id and a.type = p_type and a.status in ('proposed', 'approved')) then
    raise exception 'booking % already has an open % adjustment', p_booking_id, p_type
      using errcode = 'P0001', hint = 'ADJUSTMENT_OPEN';
  end if;

  previous_settings := internal.push_settings('{"app.in_rpc": "1"}');
  insert into public.payment_adjustments (booking_id, payment_id, type, amount, reason, evidence_path, proposed_by,
    details)
  values (p_booking_id, p_payment_id, p_type, p_amount, btrim(p_reason), p_evidence_path, auth.uid(), details)
  returning * into proposed;
  if internal.is_sole_superadmin(auth.uid()) then
    perform internal.raise_adjustment_alert('adjustment_proposed_alone',
                                            'Penyesuaian diusulkan oleh satu-satunya superadmin', proposed);
  end if;
  perform internal.restore_settings(previous_settings);
  return to_jsonb(proposed);
end;
$$;

-- Replaces the 20261104181000 version with the terms of a manual transfer; the other types are unchanged.
create or replace function internal.check_adjustment_terms(p_type public.adjustment_type, p_booking_id uuid,
  p_payment_id uuid, p_amount bigint, p_details jsonb) returns void
  language plpgsql stable
  set search_path = ''
as $$
declare
  payment public.payments;
  link public.weather_notice_bookings;
  booking public.bookings;
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
  elsif p_type = 'manual_mark_paid' then
    -- A28 (A9): a bank transfer the superadmin saw arrive, for the booking's whole total, while it is unpaid; the
    -- tickets are signed with a key id the list holds when the adjustment applies.
    select b.* into booking from public.bookings b where b.id = p_booking_id;
    if p_payment_id is not null then
      raise exception 'a manual transfer names no payment of its own' using errcode = '22023';
    end if;
    if booking.status not in ('pending_payment', 'expired') or booking.needs_review
       or exists (select 1 from public.payments p where p.booking_id = p_booking_id
                  and p.status in ('needs_review', 'settled')) then
      raise exception 'booking % takes no manual transfer now', p_booking_id
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
    if p_amount <> booking.total_amount then
      raise exception 'a manual transfer is the booking''s whole total, %', booking.total_amount
        using errcode = 'P0001', hint = 'PRICE_MISMATCH';
    end if;
    if not exists (select 1 from public.site_settings s
                   where s.key = 'qr.signing_kids' and s.value ? coalesce(p_details ->> 'key_id', '')) then
      raise exception 'the QR key id is not one tickets are signed with'
        using errcode = 'P0001', hint = 'QR_KEY_UNKNOWN';
    end if;
  elsif p_type <> 'write_off' then
    raise exception 'a % adjustment is not proposed here', p_type
      using errcode = 'P0001', hint = 'ADJUSTMENT_TYPE_UNSUPPORTED';
  end if;
end;
$$;

-- The manual transfer's payment, settled as a Midtrans one is: invoice and receipt numbers, ledger, tickets, messages.
-- A Midtrans order the PIC still had open is closed by settle_payment and named in close_orders for the server to end.
create function internal.apply_manual_transfer(p_adjustment public.payment_adjustments) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  max_attempts constant integer := 99;
  previous_settings jsonb;
  booking public.bookings;
  attempt integer;
  payment public.payments;
  closed_orders text[];
  answer jsonb;
begin
  select * into booking from public.bookings b where b.id = p_adjustment.booking_id for update;
  with closed as (
    update public.payments set status = 'cancelled'
    where booking_id = booking.id and status in ('initiated', 'pending')
    returning order_id)
  select coalesce(array_agg(order_id order by order_id), '{}') into closed_orders from closed;
  select coalesce(max(p.attempt_no), 0) + 1 into attempt from public.payments p where p.booking_id = booking.id;
  if attempt > max_attempts then
    raise exception 'booking % has used all its payment attempts', booking.booking_code
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  insert into public.payments (booking_id, attempt_no, provider, method, status, order_id, gross_amount,
    transaction_time, manual_reference, manual_proof_path, recorded_by)
  values (booking.id, attempt, 'manual', 'manual_transfer', 'initiated',
          booking.booking_code || '-' || lpad(attempt::text, 2, '0'), booking.total_amount, now(),
          left(p_adjustment.reason, 100), p_adjustment.evidence_path, auth.uid())
  returning * into payment;
  previous_settings := internal.push_settings(jsonb_build_object('app.qr_key_id', p_adjustment.details ->> 'key_id'));
  answer := internal.settle_payment(booking, payment,
    jsonb_build_object('source', 'manual_transfer', 'adjustment_id', p_adjustment.id), 'admin');
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('result', answer ->> 'result', 'order_id', payment.order_id,
    'close_orders', to_jsonb(closed_orders) || coalesce(answer -> 'close_orders', '[]'::jsonb));
end;
$$;
revoke execute on function internal.apply_manual_transfer(public.payment_adjustments) from public, anon, authenticated;

-- Replaces the 20261104181000 version: a manual_mark_paid adjustment settles the booking, and the answer carries
-- the settlement's outcome, whose close_orders the server ends at Midtrans. Every other type is unchanged.
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
  transfer jsonb := '{}';
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
  elsif adjustment.type = 'manual_mark_paid' then
    transfer := jsonb_build_object('transfer', internal.apply_manual_transfer(adjustment));
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
  return to_jsonb(adjustment) || transfer;
end;
$$;
