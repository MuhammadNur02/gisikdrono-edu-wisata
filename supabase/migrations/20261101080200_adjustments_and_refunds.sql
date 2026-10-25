-- Task P4.7.03 (docs/PRD.md §8.7.1, §9.2, §10.3; docs/Security.md REC-08, REC-09, REC-16, AUTH-11): dual-control money
-- adjustments and the one way a refund is recorded.
--
--   payment_adjustments_workflow  the trigger the RPCs rely on (security review of PR #3, L4): proposed -> approved or
--                                 rejected, approved -> applied, nothing else; the row's terms never change; a
--                                 proposer approves their own adjustment only with a 24 h delay; the delay never moves
--                                 earlier and nothing applies before it; the approver meets REC-16
--   propose_adjustment            a manual refund, a reclassified share or a written-off shortfall, with evidence under
--                                 documents/bookings/<id>/; manual_mark_paid and pax_correction are refused for now
--                                 (mark_booking_paid_manually of Task P4.3 is the manual payment's path)
--   approve_adjustment / reject_adjustment / apply_adjustment
--   record_refund                 a refund already made at Midtrans or by bank transfer, with its proof: payment
--                                 refunded or partly refunded, a whole refund refunds the booking, revokes its tickets,
--                                 frees the seats of a visit ahead, voids the invoice with a credit note; the ledger is
--                                 reversed under the refund's reference, once; refund_processed is queued
--
-- Each RPC answers with the adjustment row as jsonb. Every write needs the superadmin with a TOTP code verified in the last five minutes (fresh_totp).
-- Refusals carry hints that adjustment-service.ts turns into Indonesian copy: ADJUSTMENT_TYPE_UNSUPPORTED,
-- ADJUSTMENT_OPEN, ADJUSTMENT_STATE, APPROVER_INELIGIBLE, APPLY_TOO_EARLY, REFUND_NO_PAYMENT, REFUND_TOO_LARGE,
-- SHARE_TOO_LARGE; and STATE_INVALID for a retried refund with another amount.


-- ===== The terms an adjustment carries beyond its amount =====

-- reclassify_share: {line_ref, from_key, to_key}. applied_by names who applied it.
alter table public.payment_adjustments
  add column details jsonb not null default '{}',
  add column applied_by uuid references public.profiles(id);
grant select (details, applied_by) on public.payment_adjustments to authenticated;


-- ===== The workflow =====

-- REC-16: an approver whose account is at least 7 days old, whose authenticator was verified before the adjustment was
-- proposed, and who was not invited by the proposer in the last 30 days (a sockpuppet approver).
create function internal.approver_is_eligible(p_approver uuid, p_proposer uuid, p_proposed_at timestamptz)
  returns boolean
  language sql stable
  set search_path = ''
as $$
  select exists (
    select 1 from public.profiles a
    where a.id = p_approver and a.role = 'superadmin' and a.is_active
      and a.created_at <= now() - interval '7 days'
      and exists (select 1 from auth.mfa_factors f
                  where f.user_id = a.id and f.status = 'verified' and f.created_at < p_proposed_at)
      and not (a.created_by = p_proposer and a.created_at > now() - interval '30 days' and a.id <> p_proposer));
$$;
revoke execute on function internal.approver_is_eligible(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;

create function internal.payment_adjustments_workflow() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'payment adjustments are never deleted' using errcode = '42501';
  end if;
  if not internal.in_rpc() then
    raise exception 'payment adjustments are written by their RPCs only' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'proposed' or new.approved_by is not null or new.approved_at is not null
       or new.applied_at is not null or new.applied_by is not null or new.apply_not_before is not null then
      raise exception 'an adjustment starts as proposed' using errcode = 'P0001', hint = 'ADJUSTMENT_STATE';
    end if;
    return new;
  end if;

  if (new.booking_id, new.payment_id, new.type, new.amount, new.reason, new.evidence_path, new.proposed_by,
      new.proposed_at, new.details)
     is distinct from
     (old.booking_id, old.payment_id, old.type, old.amount, old.reason, old.evidence_path, old.proposed_by,
      old.proposed_at, old.details) then
    raise exception 'the terms of an adjustment never change' using errcode = '42501';
  end if;
  if (old.status::text, new.status::text) not in (('proposed', 'approved'), ('proposed', 'rejected'),
                                                    ('approved', 'applied')) then
    raise exception 'an adjustment does not go from % to %', old.status, new.status
      using errcode = 'P0001', hint = 'ADJUSTMENT_STATE';
  end if;
  if new.apply_not_before < old.apply_not_before then
    raise exception 'the delay of an adjustment never shortens' using errcode = '42501';
  end if;

  if new.status = 'approved' then
    if new.approved_by is null or new.approved_at is null or new.apply_not_before is null then
      raise exception 'an approval names its approver, its time and when it may apply' using errcode = '22023';
    end if;
    if new.approved_by = new.proposed_by and new.apply_not_before < new.approved_at + interval '24 hours' then
      raise exception 'a proposer approving their own adjustment waits 24 hours before it applies'
        using errcode = 'P0001', hint = 'APPROVER_INELIGIBLE';
    end if;
    if not internal.approver_is_eligible(new.approved_by, new.proposed_by, new.proposed_at) then
      raise exception 'the approver does not meet the dual-control conditions' using errcode = 'P0001',
        hint = 'APPROVER_INELIGIBLE';
    end if;
  elsif new.status = 'rejected' then
    if length(btrim(coalesce(new.rejected_reason, ''))) < 10 then
      raise exception 'a rejection says why in at least 10 characters' using errcode = '22023';
    end if;
  elsif new.status = 'applied' then
    if new.applied_at is null or new.applied_by is null then
      raise exception 'an applied adjustment names when and by whom' using errcode = '22023';
    end if;
    if new.applied_at < old.apply_not_before then
      raise exception 'this adjustment applies from %', old.apply_not_before
        using errcode = 'P0001', hint = 'APPLY_TOO_EARLY';
    end if;
  end if;
  return new;
end;
$$;
create trigger payment_adjustments_workflow before insert or update or delete on public.payment_adjustments
  for each row execute function internal.payment_adjustments_workflow();
revoke execute on function internal.payment_adjustments_workflow() from public, anon, authenticated;


-- ===== A booking refunded while its payment is partly refunded =====

-- Replaces the 0004 version: a booking is refunded while money is held for it in a settled payment, or in one partly
-- refunded already, since the second refund of a payment completes its first. Everything else is unchanged.
create or replace function internal.bookings_status_transition() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if (old.status::text, new.status::text) not in (
    ('quoted', 'pending_payment'), ('quoted', 'expired'), ('quoted', 'cancelled'),
    ('pending_payment', 'paid'), ('pending_payment', 'expired'), ('pending_payment', 'cancelled'),
    ('pending_payment', 'refunded'),
    ('expired', 'paid'), ('expired', 'pending_payment'),
    ('paid', 'checked_in'), ('paid', 'no_show'), ('paid', 'cancelled'), ('paid', 'refunded'),
    ('checked_in', 'completed'), ('checked_in', 'refunded'), ('checked_in', 'paid'),
    ('cancelled', 'refunded'), ('completed', 'refunded'), ('no_show', 'refunded')
  ) then
    raise exception 'a booking does not go from % to %', old.status, new.status
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if new.status = 'refunded' then
    if not (internal.recording_refund() and public.is_superadmin() and public.aal2()) then
      raise exception 'a booking becomes refunded only through record_refund, by a superadmin at AAL2'
        using errcode = '42501';
    end if;
    if not exists (select 1 from public.payments p
                   where p.booking_id = new.id and p.status in ('settled', 'partially_refunded')) then
      raise exception 'a booking is refunded only while it has a settled payment'
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
  end if;
  return new;
end;
$$;


-- ===== A reclassified share is part of what a row holds =====

-- Replaces the 20261024100300 version (re-review of PR #42): what a settlement row still holds counts the reversals
-- and now also the adjustment rows of its line and beneficiary, so a refund after reclassify_share gives back each
-- party's share as it stands, not as it was first split. Everything else is unchanged.
create or replace function internal.reverse_revenue_share(p_booking_id uuid, p_amount bigint, p_reference text,
  p_reason text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  reference text := btrim(coalesce(p_reference, ''));
  already_reversed bigint;
  settled_ids bigint[];
  remaining numeric[];
  parts bigint[];
begin
  if reference = '' or length(reference) > 100 then
    raise exception 'a reversal names its refund in 1 to 100 characters' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  perform 1 from public.bookings b where b.id = p_booking_id for update;
  select -sum(e.amount) into already_reversed from public.revenue_share_entries e
  where e.booking_id = p_booking_id and e.entry_type = 'reversal' and e.rule_version ->> 'refund_reference' = reference;
  if already_reversed is not null then
    if already_reversed <> p_amount then
      raise exception 'refund % of booking % gave back %, not %', reference, p_booking_id, already_reversed, p_amount
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
    return jsonb_build_object('result', 'already_reversed', 'amount', -p_amount);
  end if;

  select array_agg(s.id order by s.id), array_agg(s.amount + coalesce(moved.amount, 0) order by s.id)
    into settled_ids, remaining
  from public.revenue_share_entries s
  left join lateral (select sum(r.amount) as amount from public.revenue_share_entries r
                     where r.booking_id = s.booking_id and r.entry_type in ('reversal', 'adjustment')
                       and r.line_ref = s.line_ref and r.beneficiary_key = s.beneficiary_key) as moved on true
  where s.booking_id = p_booking_id and s.entry_type = 'settlement';
  if settled_ids is null then
    raise exception 'booking % has no ledger to reverse', p_booking_id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > (select sum(w.amount) from unnest(remaining) as w(amount)) then
    raise exception 'booking % cannot give back % more', p_booking_id, p_amount
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  parts := internal.largest_remainder_split(p_amount, remaining);

  insert into public.revenue_share_entries (booking_id, payment_id, entry_type, line_ref, booking_addon_id, rule_id,
    rule_version, beneficiary, beneficiary_key, rw_id, vendor_id, base_amount, pct, amount)
  select s.booking_id, s.payment_id, 'reversal', s.line_ref, s.booking_addon_id, s.rule_id,
         s.rule_version || jsonb_build_object('reason', left(p_reason, 200), 'refund_reference', reference),
         s.beneficiary, s.beneficiary_key, s.rw_id, s.vendor_id, -p_amount, s.pct, -part.amount
  from unnest(settled_ids, parts) as part(settled_id, amount)
  join public.revenue_share_entries s on s.id = part.settled_id
  where part.amount > 0
  order by s.id;
  return jsonb_build_object('result', 'reversed', 'amount', -p_amount);
end;
$$;


-- ===== record_refund =====

-- The payment a refund comes out of: the one named, or the booking's settled (or partly refunded) one.
create function internal.refund_payment_of(p_booking_id uuid, p_payment_id uuid) returns public.payments
  language plpgsql
  set search_path = ''
as $$
declare
  payment public.payments;
begin
  select p.* into payment from public.payments p
  where p.booking_id = p_booking_id
    and (p.id = p_payment_id
         or (p_payment_id is null and p.status in ('settled', 'partially_refunded')))
  order by p.attempt_no desc
  limit 1
  for update;
  if not found then
    raise exception 'booking % has no payment to refund', p_booking_id
      using errcode = 'P0001', hint = 'REFUND_NO_PAYMENT';
  end if;
  return payment;
end;
$$;

-- What a whole refund does beyond the payment: the booking refunded, its tickets revoked, the seats of a visit ahead
-- freed, the invoice voided under a credit note. Returns the credit note's number.
create function internal.close_refunded_booking(p_booking public.bookings, p_payment public.payments, p_reason text,
  p_actor uuid) returns text
  language plpgsql
  set search_path = ''
as $$
declare
  credit_note text;
begin
  if p_booking.status <> 'refunded' then
    update public.bookings set status = 'refunded', needs_review = false, review_reason = null where id = p_booking.id;
  end if;
  perform internal.revoke_booking_tickets(p_booking.id, 'refund', p_actor);
  if p_booking.visit_date >= public.today_jkt() then
    perform internal.release_booking_quota(p_booking.id);
  end if;
  update public.invoices
  set status = 'void', void_reason = left(p_reason, 200), voided_at = now(),
      credit_note_number = coalesce(credit_note_number, internal.next_document_number('credit_note', now()))
  where booking_id = p_booking.id and payment_id = p_payment.id and status = 'paid'
  returning credit_note_number into credit_note;
  return credit_note;
end;
$$;

-- The refund of a payment already moved at Midtrans or by bank transfer. p_reference names it (the Midtrans refund key
-- or the transfer's reference); the same reference with the same amount is the same refund and records nothing again.
create function internal.record_refund_core(p_booking_id uuid, p_payment_id uuid, p_amount bigint, p_reference text,
  p_reason text, p_proof_path text, p_actor uuid) returns jsonb
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
begin
  if reference = '' or length(reference) > 100 then
    raise exception 'a refund names its transfer in 1 to 100 characters' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'a refund says why in at least 10 characters' using errcode = '22023';
  end if;
  if p_proof_path is null or p_proof_path !~ ('^bookings/' || p_booking_id || '/[A-Za-z0-9._-]{1,120}$') then
    raise exception 'a refund keeps its proof under documents/bookings/%/', p_booking_id using errcode = '22023';
  end if;
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
  payment := internal.refund_payment_of(p_booking_id, p_payment_id);
  if payment.status not in ('settled', 'partially_refunded', 'duplicate') then
    raise exception 'a % payment is not refunded', payment.status using errcode = 'P0001', hint = 'REFUND_NO_PAYMENT';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > payment.gross_amount - payment.refunded_amount
     or (payment.status = 'duplicate' and p_amount <> payment.gross_amount - payment.refunded_amount) then
    raise exception 'payment % cannot refund %', payment.order_id, p_amount
      using errcode = 'P0001', hint = 'REFUND_TOO_LARGE';
  end if;
  is_whole := payment.refunded_amount + p_amount = payment.gross_amount;

  previous_settings := internal.push_settings('{"app.in_rpc": "1", "app.recording_refund": "1"}');
  -- A duplicate payment carries no booking money: only the payment itself is refunded.
  if payment.status <> 'duplicate' then
    if is_whole then
      credit_note := internal.close_refunded_booking(booking, payment, p_reason, p_actor);
    elsif booking.needs_review then
      update public.bookings set needs_review = false, review_reason = null where id = booking.id;
    end if;
    if exists (select 1 from public.revenue_share_entries e
               where e.booking_id = booking.id and e.entry_type = 'settlement') then
      perform internal.reverse_revenue_share(booking.id, p_amount, reference, p_reason);
    end if;
  end if;
  update public.payments
  set status = case when is_whole then 'refunded'::public.payment_status else 'partially_refunded' end,
      refunded_amount = refunded_amount + p_amount
  where id = payment.id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  select booking.id, booking.status, b.status, 'admin', p_actor, 'refund_recorded',
         jsonb_build_object('refund_reference', reference, 'amount', p_amount, 'order_id', payment.order_id,
                            'whole', is_whole, 'proof_path', p_proof_path, 'credit_note_number', credit_note)
  from public.bookings b where b.id = booking.id;
  if payment.status <> 'duplicate' then
    perform internal.enqueue_notification(booking.id, 'refund_processed', 'whatsapp', '{}');
    perform internal.enqueue_notification(booking.id, 'refund_processed', 'email', '{}');
  end if;
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('result', 'recorded', 'amount', p_amount, 'whole', is_whole,
                            'credit_note_number', credit_note);
end;
$$;

revoke execute on function internal.refund_payment_of(uuid, uuid),
  internal.close_refunded_booking(public.bookings, public.payments, text, uuid),
  internal.record_refund_core(uuid, uuid, bigint, text, text, text, uuid)
  from public, anon, authenticated, service_role;

create function internal.require_finance_writer() returns void
  language plpgsql stable
  set search_path = ''
as $$
begin
  if not (public.is_superadmin() and public.fresh_totp()) then
    raise exception 'money is moved by the superadmin with a fresh authenticator code' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function internal.require_finance_writer() from public, anon, authenticated, service_role;

-- A refund made at Midtrans or by bank transfer, with its proof, recorded by the superadmin.
create function public.record_refund(p_booking_id uuid, p_amount bigint, p_reference text, p_reason text,
  p_payment_id uuid default null, p_proof_path text default null) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.require_finance_writer();
  return internal.record_refund_core(p_booking_id, p_payment_id, p_amount, p_reference, p_reason, p_proof_path,
                                     auth.uid());
end;
$$;


-- ===== propose_adjustment =====

-- What the ledger holds for one line and beneficiary of a booking: its settlement, reversals and adjustments.
create function internal.share_held(p_booking_id uuid, p_line_ref text, p_key text) returns bigint
  language sql stable
  set search_path = ''
as $$
  select coalesce(sum(e.amount), 0)::bigint from public.revenue_share_entries e
  where e.booking_id = p_booking_id and e.line_ref = p_line_ref and e.beneficiary_key = p_key;
$$;
revoke execute on function internal.share_held(uuid, text, text) from public, anon, authenticated, service_role;

-- The terms of each type, checked when proposed and again when applied.
create function internal.check_adjustment_terms(p_type public.adjustment_type, p_booking_id uuid, p_payment_id uuid,
  p_amount bigint, p_details jsonb) returns void
  language plpgsql stable
  set search_path = ''
as $$
declare
  payment public.payments;
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
revoke execute on function internal.check_adjustment_terms(public.adjustment_type, uuid, uuid, bigint, jsonb)
  from public, anon, authenticated, service_role;

create function public.propose_adjustment(p_type public.adjustment_type, p_booking_id uuid, p_payment_id uuid,
  p_amount bigint, p_reason text, p_evidence_path text, p_details jsonb default '{}') returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  proposed public.payment_adjustments;
  previous_settings jsonb;
  details jsonb := case when p_type = 'reclassify_share'
                        then jsonb_build_object('line_ref', p_details ->> 'line_ref', 'from_key', p_details ->> 'from_key',
                                                'to_key', p_details ->> 'to_key')
                        else '{}' end;
begin
  perform internal.require_finance_writer();
  if p_evidence_path is null
     or p_evidence_path !~ ('^bookings/' || p_booking_id || '/adjustment-[0-9a-f-]{36}\.(pdf|jpg|jpeg|png|webp)$') then
    raise exception 'an adjustment keeps its evidence under documents/bookings/%/', p_booking_id
      using errcode = '22023';
  end if;
  perform 1 from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
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
  perform internal.restore_settings(previous_settings);
  return to_jsonb(proposed);
end;
$$;


-- ===== approve, reject =====

create function internal.open_adjustment(p_id uuid, p_status public.adjustment_status)
  returns public.payment_adjustments
  language plpgsql
  set search_path = ''
as $$
declare
  adjustment public.payment_adjustments;
begin
  select a.* into adjustment from public.payment_adjustments a where a.id = p_id for update;
  if not found then
    raise exception 'adjustment % does not exist', p_id using errcode = 'P0002';
  end if;
  if adjustment.status <> p_status then
    raise exception 'adjustment % is %', p_id, adjustment.status using errcode = 'P0001', hint = 'ADJUSTMENT_STATE';
  end if;
  return adjustment;
end;
$$;
revoke execute on function internal.open_adjustment(uuid, public.adjustment_status)
  from public, anon, authenticated, service_role;

-- Another superadmin approves at once. The proposer approves their own only while they are the one active superadmin
-- (decision OD-2): it applies 24 hours later, and a high alert tells the kelurahan head (security alert delivery).
create function public.approve_adjustment(p_id uuid) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  adjustment public.payment_adjustments;
  is_own boolean;
  previous_settings jsonb;
begin
  perform internal.require_finance_writer();
  adjustment := internal.open_adjustment(p_id, 'proposed');
  is_own := adjustment.proposed_by = auth.uid();
  if is_own and (select count(*) from public.profiles p where p.role = 'superadmin' and p.is_active) > 1 then
    raise exception 'another superadmin approves this adjustment' using errcode = 'P0001', hint = 'APPROVER_INELIGIBLE';
  end if;

  previous_settings := internal.push_settings('{"app.in_rpc": "1"}');
  update public.payment_adjustments
  set status = 'approved', approved_by = auth.uid(), approved_at = now(),
      apply_not_before = case when is_own then now() + interval '24 hours' else now() end
  where id = p_id
  returning * into adjustment;
  if is_own then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('adjustment_self_approved', 'high', 'adjustment_self_approved:' || p_id,
            'Penyesuaian disetujui oleh pengusulnya sendiri',
            jsonb_build_object('adjustment_id', p_id, 'booking_id', adjustment.booking_id, 'type', adjustment.type,
                               'amount', adjustment.amount, 'apply_not_before', adjustment.apply_not_before))
    on conflict (fingerprint) where acknowledged_at is null do nothing;
  end if;
  perform internal.restore_settings(previous_settings);
  return to_jsonb(adjustment);
end;
$$;

-- The proposer withdraws, or another superadmin turns it down, saying why.
create function public.reject_adjustment(p_id uuid, p_reason text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  adjustment public.payment_adjustments;
  previous_settings jsonb;
begin
  perform internal.require_finance_writer();
  perform internal.open_adjustment(p_id, 'proposed');
  previous_settings := internal.push_settings('{"app.in_rpc": "1"}');
  update public.payment_adjustments set status = 'rejected', rejected_reason = btrim(p_reason)
  where id = p_id
  returning * into adjustment;
  perform internal.restore_settings(previous_settings);
  return to_jsonb(adjustment);
end;
$$;


-- ===== apply_adjustment =====

-- reclassify_share: the amount leaves one beneficiary's share of a line and joins another's, as two adjustment rows
-- shaped like the line's settlement rows, so the ledger still adds up to what was paid.
create function internal.apply_reclassify_share(p_adjustment public.payment_adjustments) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  line text := p_adjustment.details ->> 'line_ref';
begin
  insert into public.revenue_share_entries (booking_id, payment_id, adjustment_id, entry_type, line_ref,
    booking_addon_id, rule_id, rule_version, beneficiary, beneficiary_key, rw_id, vendor_id, base_amount, pct, amount)
  select s.booking_id, s.payment_id, p_adjustment.id, 'adjustment', s.line_ref, s.booking_addon_id, s.rule_id,
         s.rule_version || jsonb_build_object('adjustment_id', p_adjustment.id, 'reason', left(p_adjustment.reason, 200)),
         s.beneficiary, s.beneficiary_key, s.rw_id, s.vendor_id, p_adjustment.amount, s.pct,
         case when s.beneficiary_key = p_adjustment.details ->> 'from_key' then -p_adjustment.amount
              else p_adjustment.amount end
  from (select distinct on (e.beneficiary_key) e.*
        from public.revenue_share_entries e
        where e.booking_id = p_adjustment.booking_id and e.entry_type = 'settlement' and e.line_ref = line
          and e.beneficiary_key in (p_adjustment.details ->> 'from_key', p_adjustment.details ->> 'to_key')
        order by e.beneficiary_key, e.id) as s
  order by s.beneficiary_key = p_adjustment.details ->> 'from_key' desc;
end;
$$;
revoke execute on function internal.apply_reclassify_share(public.payment_adjustments)
  from public, anon, authenticated, service_role;

-- An approved adjustment takes effect, once its delay has passed: a manual refund through record_refund's path (the
-- refund itself already made, at Midtrans under refund_key = the adjustment's id, or by bank transfer whose proof is
-- the evidence), a reclassified share in the ledger, a write-off recorded on the booking. The adjustment is applied in
-- the same transaction, under app.adjustment_id.
create function public.apply_adjustment(p_id uuid) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  adjustment public.payment_adjustments;
  previous_settings jsonb;
begin
  perform internal.require_finance_writer();
  perform internal.take_audit_turn();
  adjustment := internal.open_adjustment(p_id, 'approved');
  if now() < adjustment.apply_not_before then
    raise exception 'this adjustment applies from %', adjustment.apply_not_before
      using errcode = 'P0001', hint = 'APPLY_TOO_EARLY';
  end if;
  perform internal.check_adjustment_terms(adjustment.type, adjustment.booking_id, adjustment.payment_id,
                                          adjustment.amount, adjustment.details);

  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1', 'app.adjustment_id', p_id::text));
  if adjustment.type = 'manual_refund' then
    perform internal.record_refund_core(adjustment.booking_id, adjustment.payment_id, adjustment.amount,
                                        'adjustment:' || p_id, adjustment.reason, adjustment.evidence_path, auth.uid());
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
  perform internal.restore_settings(previous_settings);
  return to_jsonb(adjustment);
end;
$$;

revoke execute on function public.record_refund(uuid, bigint, text, text, uuid, text),
  public.propose_adjustment(public.adjustment_type, uuid, uuid, bigint, text, text, jsonb),
  public.approve_adjustment(uuid), public.reject_adjustment(uuid, text), public.apply_adjustment(uuid)
  from public, anon, service_role;
grant execute on function public.record_refund(uuid, bigint, text, text, uuid, text),
  public.propose_adjustment(public.adjustment_type, uuid, uuid, bigint, text, text, jsonb),
  public.approve_adjustment(uuid), public.reject_adjustment(uuid, text), public.apply_adjustment(uuid)
  to authenticated;
