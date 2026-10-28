-- Follow-ups of PR #102 (staff booking actions), a payment the staff record (docs/PRD.md §13.1 A9, A23, A28;
-- CLAUDE.md §7.1):
--
--   open_manual_payment        The manual payment row of the RW admin's cash and of the superadmin's bank transfer, in
--                              one internal.* function: the attempt number and its cap, then PAYMENT_OPEN while the PIC
--                              still has a Midtrans order open, so that refusal comes after every other check of the
--                              step (adjustment-service.ts ends that order only on it, then applies once more).
--   apply_manual_transfer      The terms of the transfer are checked again under the booking's lock: apply_adjustment
--                              read them before it, and a settlement or a lapse may have come in between.
--   mark_booking_paid_manually Its payment row through open_manual_payment; the checks and the settlement are unchanged.


-- ===== open_manual_payment =====

create function internal.open_manual_payment(p_booking public.bookings, p_method public.payment_method,
  p_reference text, p_proof_path text, p_actor_id uuid) returns public.payments
  language plpgsql
  set search_path = ''
as $$
declare
  max_attempts constant integer := 99;
  attempt integer;
  payment public.payments;
begin
  select coalesce(max(p.attempt_no), 0) + 1 into attempt from public.payments p where p.booking_id = p_booking.id;
  if attempt > max_attempts then
    raise exception 'booking % has used all its payment attempts', p_booking.booking_code
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if exists (select 1 from public.payments p
             where p.booking_id = p_booking.id and p.status in ('initiated', 'pending')) then
    raise exception 'the PIC has a pay page open' using errcode = 'P0001', hint = 'PAYMENT_OPEN';
  end if;
  insert into public.payments (booking_id, attempt_no, provider, method, status, order_id, gross_amount,
    transaction_time, manual_reference, manual_proof_path, recorded_by)
  values (p_booking.id, attempt, 'manual', p_method, 'initiated',
          p_booking.booking_code || '-' || lpad(attempt::text, 2, '0'), p_booking.total_amount, now(),
          p_reference, p_proof_path, p_actor_id)
  returning * into payment;
  return payment;
end;
$$;
revoke execute on function internal.open_manual_payment(public.bookings, public.payment_method, text, text, uuid)
  from public, anon, authenticated, service_role;


-- ===== apply_manual_transfer =====

-- Replaces the 20261104220300 version (follow-up of PR #102, 3): the booking is locked first and the transfer's terms
-- checked again under the lock; the payment row is open_manual_payment's. The settlement, the reconciliation issue
-- (REC-09 b) and the answer are unchanged.
create or replace function internal.apply_manual_transfer(p_adjustment public.payment_adjustments) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  booking public.bookings;
  payment public.payments;
  answer jsonb;
  run_id uuid;
begin
  select * into booking from public.bookings b where b.id = p_adjustment.booking_id for update;
  perform internal.check_adjustment_terms('manual_mark_paid', booking.id, p_adjustment.payment_id, p_adjustment.amount,
                                          p_adjustment.details);
  payment := internal.open_manual_payment(booking, 'manual_transfer', left(p_adjustment.reason, 100),
                                          p_adjustment.evidence_path, auth.uid());
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


-- ===== mark_booking_paid_manually =====

-- Replaces the 20261104220100 version: the cash's payment row is open_manual_payment's (CLAUDE.md §7.1). Everything
-- else is unchanged; an open order is already refused above, so its PAYMENT_OPEN never fires here.
create or replace function public.mark_booking_paid_manually(p_booking_id uuid, p_method public.payment_method,
  p_amount bigint, p_key_id text, p_reference text default null, p_proof_path text default null,
  p_attendee_count integer default null)
  returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  booking public.bookings;
  payment public.payments;
  answer jsonb;
begin
  if not (public.is_staff() and public.aal2()) then
    raise exception 'only an officer at AAL2 records a payment' using errcode = '42501';
  end if;
  if not public.fresh_totp() then
    raise exception 'confirm with a fresh authenticator code first' using errcode = '42501', hint = 'FRESH_TOTP';
  end if;
  if p_method is distinct from 'cash' or p_proof_path is not null then
    raise exception 'only cash for an officer''s booking is recorded here' using errcode = 'P0001',
      hint = 'STATE_INVALID';
  end if;
  if length(coalesce(p_reference, '')) > 100 then
    raise exception 'a receipt reference has at most 100 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.site_settings s
                 where s.key = 'qr.signing_kids' and s.value ? coalesce(p_key_id, '')) then
    raise exception 'the QR key id is not one tickets are signed with'
      using errcode = 'P0001', hint = 'QR_KEY_UNKNOWN';
  end if;
  perform internal.take_audit_turn();
  select * into booking from public.bookings b where b.id = p_booking_id for update;
  -- A9: cash is the RW admin's, for a booking of their own RW.
  if not found or not (public.is_admin_rw() and cardinality(booking.rw_ids) = 1
                       and public.owns_rw(booking.rw_ids[1])) then
    raise exception 'booking % is not one this RW admin takes cash for', p_booking_id using errcode = 'P0002';
  end if;
  if booking.channel <> 'admin' or booking.status <> 'pending_payment' or booking.needs_review
     or booking.expires_at <= now() or now() >= internal.cash_deadline(booking.visit_date_end)
     or exists (select 1 from public.payments p where p.booking_id = booking.id
                and p.status in ('initiated', 'pending', 'needs_review', 'settled')) then
    raise exception 'this booking takes no cash now' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if p_amount is distinct from booking.total_amount then
    raise exception 'the cash is the booking''s whole total' using errcode = 'P0001', hint = 'PRICE_MISMATCH';
  end if;
  -- A23 addendum (delta review of PR #91, L-3): cash after the session started is taken from a group that came, so the
  -- officer counts it in; before, nobody is counted in yet.
  if (internal.session_has_started(booking.id)) <> (p_attendee_count is not null) then
    raise exception 'cash after the session started counts the group in, and only then'
      using errcode = 'P0001', hint = 'ATTENDANCE_REQUIRED';
  end if;

  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1', 'app.qr_key_id', p_key_id)
    || internal.document_actor(auth.uid()));
  payment := internal.open_manual_payment(booking, 'cash', nullif(btrim(coalesce(p_reference, '')), ''), null,
                                          auth.uid());
  answer := internal.settle_payment(booking, payment, jsonb_build_object('source', 'cash'), 'admin');
  if p_attendee_count is not null and answer ->> 'result' = 'applied' then
    perform internal.check_in_at_cash(booking.id, p_attendee_count);
  end if;
  -- The officer who took the cash needs no email that the booking is paid (internal.notify_staff's key).
  update public.notifications n set status = 'cancelled', last_error_code = 'recorded_by_recipient'
  where n.dedupe_key = concat_ws(':', 'booking', booking.id, 'admin_new_paid_booking', 'email', auth.uid())
    and n.status = 'queued';
  perform internal.restore_settings(previous_settings);
  return answer || jsonb_build_object('order_id', payment.order_id);
end;
$$;
