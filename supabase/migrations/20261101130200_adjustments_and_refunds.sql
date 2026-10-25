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
-- SHARE_TOO_LARGE, LEDGER_MISSING (a partial refund of a booking whose split never reached the ledger), PROOF_MISSING
-- (20261101130100); and STATE_INVALID for a retried refund with another amount.


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
  -- The retention run of 0004's append_only trigger may still prune or anonymise (review of PR #68, L2).
  if internal.in_purge() then
    return coalesce(new, old);
  end if;
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
  if new.apply_not_before < old.apply_not_before then
    raise exception 'the delay of an adjustment never shortens' using errcode = '42501';
  end if;
  if (old.status::text, new.status::text) not in (('proposed', 'approved'), ('proposed', 'rejected'),
                                                    ('approved', 'applied')) then
    raise exception 'an adjustment does not go from % to %', old.status, new.status
      using errcode = 'P0001', hint = 'ADJUSTMENT_STATE';
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
    if (new.approved_by, new.approved_at, new.rejected_reason, new.apply_not_before)
       is distinct from (old.approved_by, old.approved_at, old.rejected_reason, old.apply_not_before) then
      raise exception 'an approval is applied as it was given' using errcode = '42501';
    end if;
    if not exists (select 1 from public.profiles a
                   where a.id = old.approved_by and a.role = 'superadmin' and a.is_active) then
      raise exception 'the approver is no longer an active superadmin' using errcode = 'P0001',
        hint = 'APPROVER_INELIGIBLE';
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


-- ===== A booking refunded while its payment is partly refunded, or held for review =====

-- docs/PRD.md §9.2 (review of PR #68, M5): a payment held for review counts as money received once Midtrans itself
-- answered settlement for its order, through the Status API or the poll ("Cek status Midtrans"); a webhook alone does
-- not, since holding it for review is what the webhook's word earned.
create function internal.midtrans_confirmed_settled(p_order_id text) returns boolean
  language sql stable
  set search_path = ''
as $$
  select exists (select 1 from public.payment_events e
                 where e.order_id = p_order_id and e.source <> 'webhook'
                   and internal.midtrans_payment_status(e.transaction_status, e.fraud_status) = 'settled');
$$;
revoke execute on function internal.midtrans_confirmed_settled(text) from public, anon, authenticated, service_role;

-- Replaces the 0004 version: a booking is refunded while money is held for it in a settled payment, or in one partly
-- refunded already, since the second refund of a payment completes its first; a booking still pending payment is
-- refunded while its payment is held for review and Midtrans confirmed the settlement (M5). Everything else is
-- unchanged.
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
                   where p.booking_id = new.id
                     and (p.status = any (array['settled', 'partially_refunded']::public.payment_status[])
                          or (old.status = 'pending_payment' and p.status = 'needs_review'
                              and internal.midtrans_confirmed_settled(p.order_id)))) then
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


-- ===== Messages and alerts of a refund =====

-- Replaces the 20261024120000 version, adding p_dedupe_scope (review of PR #68, L4): a message that may rightly go more
-- than once for one booking, such as refund_processed for each of its refunds, names what it is about, and only a
-- repeat about the same thing is the row already queued. Everything else is unchanged.
drop function internal.enqueue_notification(uuid, public.notification_template, public.notification_channel, jsonb);
create function internal.enqueue_notification(
  p_booking_id uuid, p_template public.notification_template, p_channel public.notification_channel, p_params jsonb,
  p_dedupe_scope text default null
) returns uuid
  language plpgsql security definer
  set search_path = ''
as $$
declare
  emails_before_payment constant integer := 3;
  pre_payment_templates constant public.notification_template[] :=
    array['booking_created', 'quotation_ready', 'payment_reminder', 'booking_expired', 'booking_link'];
  booking record;
  recipient text;
  dedupe text := format('booking:%s:%s:%s', p_booking_id, p_template, p_channel)
    || coalesce(':' || md5(p_dedupe_scope), '');
  notification_id uuid;
begin
  select b.pic_phone, b.pic_email, b.pic_first_name, b.phone_verified_at, b.paid_at into booking
  from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if not internal.setting_is_on(case p_channel when 'whatsapp' then 'whatsapp_enabled' else 'email_enabled' end) then
    return null;
  end if;

  if p_channel = 'whatsapp' and p_template <> 'phone_otp' and booking.phone_verified_at is null then
    return null;
  end if;
  recipient := case p_channel when 'whatsapp' then booking.pic_phone else booking.pic_email end;
  if recipient is null then
    return null;
  end if;
  if p_channel = 'email' and p_template = any (pre_payment_templates) and booking.paid_at is null
     and not exists (select 1 from public.notifications n where n.dedupe_key = dedupe)
     and (select count(*) from public.notifications n
          where n.channel = 'email' and n.recipient = booking.pic_email and n.template = any (pre_payment_templates)
            and n.created_at > now() - interval '1 day') >= emails_before_payment then
    insert into public.security_events (event_type, severity, entity_type, entity_id, details)
    values ('rate_limited', 'info', 'bookings', p_booking_id::text,
            jsonb_build_object('limit', 'email_before_payment', 'template', p_template));
    return null;
  end if;

  insert into public.notifications (booking_id, channel, template, recipient, recipient_name, params, dedupe_key)
  values (p_booking_id, p_channel, p_template, recipient, booking.pic_first_name, coalesce(p_params, '{}'), dedupe)
  on conflict (dedupe_key) do nothing
  returning id into notification_id;
  if notification_id is null then
    select n.id into notification_id from public.notifications n where n.dedupe_key = dedupe;
  end if;
  return notification_id;
end;
$$;
revoke execute on function internal.enqueue_notification(uuid, public.notification_template,
  public.notification_channel, jsonb, text) from public, anon, authenticated;

-- Replaces the 20261024095000 version (review of PR #68, L5): Midtrans telling of a refund the superadmin has already
-- recorded, in whole, raises nothing; one that goes beyond what was recorded still raises the high alert. What Midtrans
-- refunded is read from the event being applied (its refund_amount, or the whole payment for a refunded status).
create or replace function internal.note_refund_seen(p_payment public.payments, p_target public.payment_status)
  returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  told jsonb;
  refunded_at_midtrans bigint;
begin
  select e.payload into told from public.payment_events e
  where e.order_id = p_payment.order_id and e.processed_at is null
  order by e.id desc
  limit 1;
  refunded_at_midtrans := case
    when p_target = 'refunded' then p_payment.gross_amount
    when coalesce(told ->> 'refund_amount', '') ~ '^[0-9]{1,15}(\.0{1,2})?$'
      then split_part(told ->> 'refund_amount', '.', 1)::bigint
  end;
  if refunded_at_midtrans is not null and p_payment.refunded_amount >= refunded_at_midtrans then
    return jsonb_build_object('result', 'ignored', 'processing_result', 'refund_already_recorded',
                              'payment_status', p_payment.status);
  end if;
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('refund_seen', 'high', 'refund_seen:' || p_payment.order_id,
          'Refund terlihat di Midtrans; catat di Keuangan',
          jsonb_build_object('booking_id', p_payment.booking_id, 'order_id', p_payment.order_id, 'status', p_target))
  on conflict (fingerprint) where acknowledged_at is null do update
  set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1, details = excluded.details,
      notified_at = null;
  return jsonb_build_object('result', 'ignored', 'processing_result', 'refund_awaiting_record',
                            'payment_status', p_payment.status);
end;
$$;

-- An open alert a recorded refund answers is closed in the recording superadmin's name.
create function internal.close_refund_alert(p_fingerprint text, p_actor uuid) returns void
  language sql
  set search_path = ''
as $$
  update public.security_alerts set acknowledged_by = p_actor
  where fingerprint = p_fingerprint and acknowledged_at is null;
$$;
revoke execute on function internal.close_refund_alert(text, uuid) from public, anon, authenticated, service_role;


-- ===== record_refund =====

-- The payment a refund comes out of: the one named, or the booking's settled (or partly refunded) one, or the one
-- held for review (M5).
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
         or (p_payment_id is null and p.status in ('settled', 'partially_refunded', 'needs_review')))
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

-- What a payment may give back now (REFUND_NO_PAYMENT or REFUND_TOO_LARGE otherwise): a settled or partly refunded
-- payment any part of what it still holds; a duplicate one, or one held for review that Midtrans confirmed settled
-- while its booking still waits for payment (M5), all of it at once.
create function internal.check_refund_amount(p_booking public.bookings, p_payment public.payments, p_amount bigint)
  returns void
  language plpgsql stable
  set search_path = ''
as $$
declare
  holds bigint := p_payment.gross_amount - p_payment.refunded_amount;
  is_held boolean := p_payment.status = 'needs_review';
begin
  if not (p_payment.status in ('settled', 'partially_refunded', 'duplicate')
          or (is_held and p_booking.status = 'pending_payment'
              and internal.midtrans_confirmed_settled(p_payment.order_id))) then
    raise exception 'a % payment is not refunded', p_payment.status using errcode = 'P0001', hint = 'REFUND_NO_PAYMENT';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > holds
     or ((p_payment.status = 'duplicate' or is_held) and p_amount <> holds) then
    raise exception 'payment % cannot refund %', p_payment.order_id, p_amount
      using errcode = 'P0001', hint = 'REFUND_TOO_LARGE';
  end if;
end;
$$;

-- The seats of the legs whose session is still ahead go back to their sessions; a leg already visited keeps its count
-- (review of PR #68, L6).
create function internal.release_quota_ahead(p_booking_id uuid) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  leg record;
begin
  for leg in
    select l.id, l.visit_session_id, l.pax_count
    from public.booking_legs l
    join public.visit_sessions s on s.id = l.visit_session_id
    where l.booking_id = p_booking_id and l.status = 'reserved' and l.quota_released_at is null
      and (s.session_date + s.start_time) at time zone 'Asia/Jakarta' > now()
    order by l.visit_session_id
    for update of l
  loop
    update public.visit_sessions set reserved_pax = greatest(reserved_pax - leg.pax_count, 0)
    where id = leg.visit_session_id;
    update public.booking_legs set status = 'released', quota_released_at = now() where id = leg.id;
  end loop;
end;
$$;

-- What a whole refund does beyond the payment: the booking refunded, its tickets revoked, the seats of the legs ahead
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
  perform internal.release_quota_ahead(p_booking.id);
  update public.invoices
  set status = 'void', void_reason = left(p_reason, 200), voided_at = now(),
      credit_note_number = coalesce(credit_note_number, internal.next_document_number('credit_note', now()))
  where booking_id = p_booking.id and payment_id = p_payment.id and status = 'paid'
  returning credit_note_number into credit_note;
  return credit_note;
end;
$$;

-- The booking's side of a refund (review of PR #68, M1, M2, M5): a duplicate payment carries no booking money, so its
-- refund leaves the booking and the ledger alone and answers its own alert; a whole refund closes the booking, which
-- answers every review it was under; a partial one changes no review, and needs a settlement ledger to reverse
-- (LEDGER_MISSING). Returns the credit note's number of a whole refund.
create function internal.refund_booking_side(p_booking public.bookings, p_payment public.payments, p_amount bigint,
  p_is_whole boolean, p_reference text, p_reason text, p_actor uuid) returns text
  language plpgsql
  set search_path = ''
as $$
declare
  has_ledger boolean := exists (select 1 from public.revenue_share_entries e
                                where e.booking_id = p_booking.id and e.entry_type = 'settlement');
  credit_note text;
begin
  if p_payment.status = 'duplicate' then
    perform internal.close_refund_alert('duplicate_settlement:' || p_payment.order_id, p_actor);
    return null;
  end if;
  if not p_is_whole and not has_ledger then
    raise exception 'booking % has no settlement ledger to take a partial refund from', p_booking.booking_code
      using errcode = 'P0001', hint = 'LEDGER_MISSING';
  end if;
  if p_is_whole then
    credit_note := internal.close_refunded_booking(p_booking, p_payment, p_reason, p_actor);
  end if;
  if has_ledger then
    perform internal.reverse_revenue_share(p_booking.id, p_amount, p_reference, p_reason);
  end if;
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
  payment := internal.refund_payment_of(p_booking_id, p_payment_id);
  perform internal.check_refund_amount(booking, payment, p_amount);
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
  perform internal.close_refund_alert('refund_seen:' || payment.order_id, p_actor);
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  select booking.id, booking.status, b.status, 'admin', p_actor, 'refund_recorded',
         jsonb_build_object('refund_reference', reference, 'amount', p_amount, 'order_id', payment.order_id,
                            'whole', is_whole, 'proof_path', p_proof_path, 'credit_note_number', credit_note)
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

revoke execute on function internal.refund_payment_of(uuid, uuid),
  internal.check_refund_amount(public.bookings, public.payments, bigint),
  internal.release_quota_ahead(uuid),
  internal.close_refunded_booking(public.bookings, public.payments, text, uuid),
  internal.refund_booking_side(public.bookings, public.payments, bigint, boolean, text, text, uuid),
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
  perform internal.take_audit_turn();
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
  perform internal.take_audit_turn();
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
