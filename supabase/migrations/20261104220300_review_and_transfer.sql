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

-- Review of PR #102, M2: settle_payment may have flagged REVENUE_RULE_REFUSED before PAID_AFTER_EXPIRY_NO_QUOTA took
-- review_reason over, so the settled payment's ledger rows are looked for, the allocation tried once more, and the
-- resolution refused (LEDGER_MISSING) while they are still missing: a moved booking without them would be refunded
-- against nothing and paid out to no one.
create function internal.require_booking_ledger(p_booking public.bookings) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  payment public.payments := internal.settled_payment_of(p_booking.id);
begin
  if payment.id is null then
    raise exception 'booking % has no settled payment', p_booking.booking_code
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if exists (select 1 from public.revenue_share_entries e
             where e.payment_id = payment.id and e.entry_type = 'settlement') then
    return;
  end if;
  if not internal.try_allocate_revenue_share(p_booking.id, payment.id) then
    raise exception 'the settlement of booking % has no revenue-share rows', p_booking.booking_code
      using errcode = 'P0001', hint = 'LEDGER_MISSING';
  end if;
end;
$$;
revoke execute on function internal.require_booking_ledger(public.bookings) from public, anon, authenticated;

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
  perform internal.require_booking_ledger(booking);
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
                  and p.status in ('needs_review', 'settled'))
       or not internal.holds_its_seats_or_lapsed(booking) then
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

-- Review of PR #102, HIGH 1, L4, L5: a transfer pays for a booking whose phone was proven, that is not anonymised and
-- whose first session has not started, and that is a running hold (every leg reserved) or a lapsed one (every leg
-- released, which settle_payment takes back or leaves for review); never a quotation whose legs are unreserved.
create function internal.holds_its_seats_or_lapsed(p_booking public.bookings) returns boolean
  language sql stable
  set search_path = ''
as $$
  select p_booking.phone_verified_at is not null and p_booking.pii_purged_at is null
     and exists (select 1 from public.booking_legs l where l.booking_id = p_booking.id)
     and not exists (
       select 1 from public.booking_legs l join public.visit_sessions s on s.id = l.visit_session_id
       where l.booking_id = p_booking.id
         and (l.status <> (case when p_booking.status = 'expired' then 'released'
                                else 'reserved' end)::public.booking_leg_status
              or (s.session_date + s.start_time) at time zone 'Asia/Jakarta' <= now()));
$$;
revoke execute on function internal.holds_its_seats_or_lapsed(public.bookings) from public, anon, authenticated;

-- The manual transfer's payment, settled as a Midtrans one is: invoice and receipt numbers, ledger, tickets, messages.
-- The server ends a Midtrans order the PIC still had open before applying (review of PR #102, L3), so one still open
-- here refuses the transfer (PAYMENT_OPEN). REC-09 (b): no Status API can confirm a bank transfer, so each applied
-- transfer opens a reconciliation issue the superadmin closes once the bank statement shows it.
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
  answer jsonb;
  run_id uuid;
begin
  select * into booking from public.bookings b where b.id = p_adjustment.booking_id for update;
  if exists (select 1 from public.payments p where p.booking_id = booking.id and p.status in ('initiated', 'pending'))
  then
    raise exception 'the PIC has a pay page open' using errcode = 'P0001', hint = 'PAYMENT_OPEN';
  end if;
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
  insert into public.reconciliation_runs (run_date, source, started_at, finished_at, payments_checked, issues_found,
    summary, created_by)
  values (public.today_jkt(), 'manual', now(), now(), 1, 1,
          jsonb_build_object('reason', 'manual_transfer_applied'), auth.uid())
  returning id into run_id;
  insert into public.reconciliation_issues (run_id, booking_id, payment_id, issue_type, severity, details)
  values (run_id, booking.id, payment.id, 'manual_transfer_unmatched', 'medium',
          jsonb_build_object('adjustment_id', p_adjustment.id, 'order_id', payment.order_id,
                             'amount', payment.gross_amount));
  return jsonb_build_object('result', answer ->> 'result', 'order_id', payment.order_id,
    'close_orders', coalesce(answer -> 'close_orders', '[]'::jsonb));
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


-- ===== REC-09 (b): the bank statement match of a manual transfer =====

alter table public.reconciliation_issues drop constraint reconciliation_issues_issue_type_check;
alter table public.reconciliation_issues add constraint reconciliation_issues_issue_type_check
  check (issue_type in ('paid_without_tickets', 'ticket_without_payment', 'amount_mismatch', 'status_disagreement',
                        'pending_beyond_ttl', 'ledger_sum_mismatch', 'chain_broken', 'payout_mismatch',
                        'duplicate_settlement', 'manual_transfer_unmatched'));


-- ===== Review of PR #102, L3: the PIC's open order ended before a transfer applies =====

-- payment-service.ts ends the order at Midtrans first, then closes it here as expired with the superadmin as actor.
create function internal.close_attempt_for_transfer(p_payment_id uuid, p_actor_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  closed public.payments;
begin
  perform internal.require_server_caller('close_attempt_for_transfer');
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || internal.document_actor(p_actor_id));
  update public.payments set status = 'expired'
  where id = p_payment_id and status in ('initiated', 'pending')
  returning * into closed;
  if closed.id is not null then
    insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
    select b.id, b.status, b.status, 'admin', p_actor_id, 'payment_expired_for_transfer',
           jsonb_build_object('order_id', closed.order_id)
    from public.bookings b where b.id = closed.booking_id;
  end if;
  perform internal.restore_settings(previous_settings);
end;
$$;
revoke execute on function internal.close_attempt_for_transfer(uuid, uuid) from public, anon, authenticated;

create function public.svc_close_attempt_for_transfer(p_payment_id uuid, p_actor_id uuid) returns void
  language sql security definer
  set search_path = ''
as $$ select internal.close_attempt_for_transfer(p_payment_id, p_actor_id); $$;
revoke execute on function public.svc_close_attempt_for_transfer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.svc_close_attempt_for_transfer(uuid, uuid) to service_role;


-- ===== Follow-ups of PR #91 =====

-- (a) Replaces the 20261104220100 version: Midtrans knew no transaction for the closed order (not_charged) while the PIC
-- had its Snap page, which can still create one, so an info alert says a later payment through it is to be refunded.
drop function public.svc_close_attempt_for_cash(uuid, uuid);
drop function internal.close_attempt_for_cash(uuid, uuid);
create function internal.close_attempt_for_cash(p_payment_id uuid, p_actor_id uuid,
  p_page_may_be_live boolean default false) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  closed public.payments;
begin
  perform internal.require_server_caller('close_attempt_for_cash');
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || internal.document_actor(p_actor_id));
  update public.payments set status = 'expired'
  where id = p_payment_id and status in ('initiated', 'pending')
  returning * into closed;
  if closed.id is not null then
    insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
    select b.id, b.status, b.status, 'admin', p_actor_id, 'payment_expired_for_cash',
           jsonb_build_object('order_id', closed.order_id)
    from public.bookings b where b.id = closed.booking_id;
    if p_page_may_be_live and closed.snap_redirect_url is not null then
      insert into public.security_alerts (rule, severity, fingerprint, title, details)
      select 'cash_pay_page_open', 'info', 'cash_pay_page_open:' || closed.id,
             'Tautan pembayaran mungkin masih bisa dipakai setelah dibayar tunai: ' || b.booking_code,
             jsonb_build_object('booking_id', b.id, 'order_id', closed.order_id)
      from public.bookings b where b.id = closed.booking_id
      on conflict (fingerprint) where acknowledged_at is null do nothing;
    end if;
  end if;
  perform internal.restore_settings(previous_settings);
end;
$$;
revoke execute on function internal.close_attempt_for_cash(uuid, uuid, boolean) from public, anon, authenticated;

create function public.svc_close_attempt_for_cash(p_payment_id uuid, p_actor_id uuid,
  p_page_may_be_live boolean default false) returns void
  language sql security definer
  set search_path = ''
as $$ select internal.close_attempt_for_cash(p_payment_id, p_actor_id, p_page_may_be_live); $$;
revoke execute on function public.svc_close_attempt_for_cash(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.svc_close_attempt_for_cash(uuid, uuid, boolean) to service_role;

-- (b) Replaces the 20261104220100 version with the alert of an officer's hold left without its pay link; everything
-- else is unchanged.
create or replace function internal.payments_housekeeping() returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  reminder_ahead constant interval := interval '6 hours';
  unpaid_too_long constant interval := interval '7 days';
  without_link_after constant interval := interval '3 hours';
  previous_settings jsonb;
  orphan record;
  hold record;
  suspended integer := 0;
  reminded integer := 0;
begin
  perform internal.require_server_caller('payments_housekeeping');
  perform internal.take_audit_turn();
  previous_settings := internal.begin_scheduled_job();
  for orphan in
    select distinct t.booking_id from public.tickets_qr t join public.bookings b on b.id = t.booking_id
    where t.status = 'issued' and t.valid_until > now() and b.status not in ('paid', 'checked_in')
    order by t.booking_id
  loop
    suspended := suspended + internal.suspend_booking_tickets(orphan.booking_id, 'booking_not_paid');
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('tickets_without_payment', 'critical', 'tickets_without_payment:' || orphan.booking_id,
            'Tiket masih berlaku untuk pesanan yang tidak lunas; tiketnya ditangguhkan',
            jsonb_build_object('booking_id', orphan.booking_id))
    on conflict (fingerprint) where acknowledged_at is null do update
    set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1, notified_at = null;
  end loop;

  for hold in
    select b.id from public.bookings b
    cross join lateral (select min((s.session_date + s.start_time) at time zone 'Asia/Jakarta') as first_start
                        from public.booking_legs l join public.visit_sessions s on s.id = l.visit_session_id
                        where l.booking_id = b.id) as legs
    cross join lateral (select case when b.channel = 'admin' then least(b.expires_at, legs.first_start)
                                    else b.expires_at end as remind_by) as due
    where b.status = 'pending_payment' and not b.needs_review
      and (b.channel = 'admin' or b.booker_type in ('school', 'university', 'government', 'company'))
      and b.expires_at > now() and due.remind_by > now() and due.remind_by <= now() + reminder_ahead
      and not exists (select 1 from public.notifications n
                      where n.booking_id = b.id and n.template = 'payment_reminder')
      -- Delta review of PR #91, L-C: an officer's hold is reminded only after its pay link went out.
      and (b.channel <> 'admin'
           or exists (select 1 from public.notifications n
                      where n.booking_id = b.id and n.template = 'booking_created'
                        and n.status in ('sent', 'delivered', 'read')))
    order by due.remind_by
  loop
    perform internal.enqueue_notification(hold.id, 'payment_reminder', 'whatsapp', '{"link_scope": "pay"}');
    perform internal.enqueue_notification(hold.id, 'payment_reminder', 'email', '{"link_scope": "pay"}');
    reminded := reminded + 1;
  end loop;
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  select 'admin_hold_unpaid_long', 'medium', 'admin_hold_unpaid_long:' || b.id,
         'Pemesanan petugas belum dibayar lebih dari 7 hari: ' || b.booking_code,
         jsonb_build_object('booking_id', b.id, 'rw_ids', b.rw_ids, 'created_by', b.created_by)
  from public.bookings b
  where b.channel = 'admin' and b.status = 'pending_payment' and b.created_at < now() - unpaid_too_long
    and not exists (select 1 from public.security_alerts a where a.fingerprint = 'admin_hold_unpaid_long:' || b.id)
  on conflict (fingerprint) where acknowledged_at is null do nothing;
  -- Follow-up of PR #91 (b): an officer's hold left without its cash and without the PIC's pay link (the cash step
  -- was left and the link never queued) is raised three hours on, or from the day before the visit.
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  select 'admin_hold_without_link', 'medium', 'admin_hold_without_link:' || b.id,
         'Pemesanan petugas belum dibayar dan belum dikirimi tautan pembayaran: ' || b.booking_code,
         jsonb_build_object('booking_id', b.id, 'rw_ids', b.rw_ids, 'created_by', b.created_by)
  from public.bookings b
  where b.channel = 'admin' and b.status = 'pending_payment'
    and (b.created_at < now() - without_link_after or b.visit_date <= public.today_jkt() + 1)
    and not exists (select 1 from public.notifications n where n.booking_id = b.id and n.template = 'booking_created')
    and not exists (select 1 from public.security_alerts a where a.fingerprint = 'admin_hold_without_link:' || b.id)
  on conflict (fingerprint) where acknowledged_at is null do nothing;
  update public.security_alerts a
  set acknowledged_at = now(), details = a.details || jsonb_build_object('closed', 'link_sent_or_settled')
  from public.bookings b
  where a.rule = 'admin_hold_without_link' and a.acknowledged_at is null
    and a.fingerprint = 'admin_hold_without_link:' || b.id
    and (b.status <> 'pending_payment'
         or exists (select 1 from public.notifications n where n.booking_id = b.id and n.template = 'booking_created'));
  -- L-D: the alert of a booking that is no longer waiting for its payment closes by itself.
  update public.security_alerts a
  set acknowledged_at = now(), details = a.details || jsonb_build_object('closed', 'no_longer_unpaid')
  from public.bookings b
  where a.rule = 'admin_hold_unpaid_long' and a.acknowledged_at is null
    and a.fingerprint = 'admin_hold_unpaid_long:' || b.id and b.status <> 'pending_payment';
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('suspended', suspended, 'reminded', reminded);
end;
$$;
