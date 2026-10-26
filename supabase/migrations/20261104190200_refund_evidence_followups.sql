-- Task P4.7.03 (delta-3 review of PR #68, L6, L7, I1, I2): the last gaps between a refund Midtrans reports and the
-- refunds recorded against it.
--
--   L6  an applied manual_refund whose refund_key Midtrans lists with refunds that do not add up to the adjustment's
--       amount raises a high refund_key_mismatch alert, and record_refund refuses (REFUND_KEY_MISMATCH) while the
--       latest answer still disagrees
--   L7  a reference is read as an adjustment's id however it is written: any case, "adjustment:" in any case, spaces
--       and braces around it
--   I1  a Midtrans notice of a refund already recorded closes the open refund_seen alert, in the name of whoever
--       recorded the refund that covers it
--   I2  while the latest answer lists no refunds[] and an applied manual_refund of the payment is not yet counted as
--       Midtrans', record_refund cannot tell what Midtrans' total holds, and refuses (REFUND_LIST_MISSING)
--
-- Review of PR #80, L-1 (owner decision): an L6 block is released by the superadmin acknowledging that adjustment's
-- refund_key_mismatch alert with a note of at least 10 characters and a fresh TOTP (release_refund_key_mismatch).
-- From then on record_refund books Midtrans' figure as the one that counts; each such record is audited and raises
-- the high refund_key_mismatch_overridden alert. A released mismatch raises no new refund_key_mismatch alert.
--
-- The three-argument note_refund_seen is made again from its 20261101130200 version, the latest, and record_refund_core
-- from its 20261104080200 version (PR #69, the visit-terms refund requests), the latest, with these changes; everything
-- else in them is unchanged. apply_payment_status, apply_adjustment and recap_invariant keep their 20261104080200
-- versions: they call these two and are not made again here.


-- ===== Helpers =====

-- L7: an adjustment's id in a reference, or NULL when the reference names none.
create function internal.adjustment_id_of(p_reference text) returns uuid
  language plpgsql immutable
  set search_path = ''
as $$
declare
  bare text := btrim(regexp_replace(lower(btrim(coalesce(p_reference, ''))), '^adjustment\s*:\s*', ''), ' {}');
begin
  if bare !~ '^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$' then
    return null;
  end if;
  return bare::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;
revoke execute on function internal.adjustment_id_of(text) from public, anon, authenticated, service_role;

-- The latest Midtrans answer about a payment's refunds: the one being applied when given, else the newest stored
-- Status API or poll answer of a refund.
create function internal.latest_refund_answer(p_payment public.payments, p_answer jsonb) returns jsonb
  language sql stable
  set search_path = ''
as $$
  select coalesce(p_answer, (
    select e.payload from public.payment_events e
    where e.payment_id = p_payment.id and e.order_id = p_payment.order_id and e.source in ('status_api', 'poll')
      and e.transaction_status in ('refund', 'partial_refund')
    order by e.id desc
    limit 1));
$$;
revoke execute on function internal.latest_refund_answer(public.payments, jsonb)
  from public, anon, authenticated, service_role;

-- L-1: whether the superadmin released an adjustment's L6 block, acknowledging its alert with a note.
create function internal.refund_key_mismatch_released(p_adjustment_id uuid) returns boolean
  language sql stable
  set search_path = ''
as $$
  select exists (select 1 from public.security_alerts s
                 where s.fingerprint = 'refund_key_mismatch:' || p_adjustment_id and s.acknowledged_at is not null
                   and length(btrim(coalesce(s.details ->> 'release_note', ''))) >= 10);
$$;
revoke execute on function internal.refund_key_mismatch_released(uuid) from public, anon, authenticated, service_role;

-- L6: an applied manual_refund of the payment whose refund_key the latest answer lists with another amount; with
-- p_released, only one whose block the superadmin released (L-1), else only one still blocking.
create function internal.refund_key_mismatch(p_payment public.payments, p_answer jsonb, p_released boolean default false)
  returns uuid
  language sql stable
  set search_path = ''
as $$
  with answer as (select internal.latest_refund_answer(p_payment, p_answer) as body)
  select a.id
  from public.payment_adjustments a, answer
  where a.payment_id = p_payment.id and a.type = 'manual_refund' and a.status = 'applied'
    and internal.refund_key_mismatch_released(a.id) = p_released
    and jsonb_typeof(answer.body -> 'refunds') = 'array'
    and exists (select 1 from jsonb_array_elements(answer.body -> 'refunds') as r where r ->> 'refund_key' = a.id::text)
    and coalesce((select sum(split_part(r ->> 'refund_amount', '.', 1)::bigint)
                  from jsonb_array_elements(answer.body -> 'refunds') as r
                  where r ->> 'refund_key' = a.id::text
                    and coalesce(r ->> 'refund_amount', '') ~ '^[0-9]{1,15}(\.0{1,2})?$'), -1) <> a.amount
  order by a.applied_at, a.id
  limit 1;
$$;
revoke execute on function internal.refund_key_mismatch(public.payments, jsonb, boolean)
  from public, anon, authenticated, service_role;

-- I2: the latest answer lists no refunds[] while an applied manual_refund of the payment is not yet counted as
-- Midtrans'; what Midtrans' total holds cannot then be told apart.
create function internal.refund_list_missing(p_payment public.payments, p_answer jsonb) returns boolean
  language sql stable
  set search_path = ''
as $$
  select jsonb_typeof(internal.latest_refund_answer(p_payment, p_answer) -> 'refunds') is distinct from 'array'
    and exists (
      select 1 from public.payment_adjustments a
      join public.booking_events e on e.booking_id = a.booking_id and e.reason = 'refund_recorded'
                                  and e.payload ->> 'refund_reference' = 'adjustment:' || a.id
      where a.payment_id = p_payment.id and a.type = 'manual_refund' and a.status = 'applied'
        and not coalesce((e.payload ->> 'reported')::boolean, false)
        and not internal.midtrans_refunded_under_key(p_payment.id, a.id::text, a.amount));
$$;
revoke execute on function internal.refund_list_missing(public.payments, jsonb)
  from public, anon, authenticated, service_role;

-- Who recorded the refunds of a payment most recently, in whose name an alert they answer is closed (I1).
create function internal.latest_refund_recorder(p_payment public.payments) returns uuid
  language sql stable
  set search_path = ''
as $$
  select e.actor_id from public.booking_events e
  where e.booking_id = p_payment.booking_id and e.reason = 'refund_recorded'
    and e.payload ->> 'order_id' = p_payment.order_id and e.actor_id is not null
  order by e.occurred_at desc, e.id desc
  limit 1;
$$;
revoke execute on function internal.latest_refund_recorder(public.payments)
  from public, anon, authenticated, service_role;


-- ===== note_refund_seen (I1, L6) =====

create or replace function internal.note_refund_seen(p_payment public.payments, p_target public.payment_status, p_answer jsonb)
  returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  refunded_at_midtrans bigint := case when p_target = 'refunded' then p_payment.gross_amount
                                      else internal.midtrans_refund_total(p_answer) end;
  mismatched uuid := internal.refund_key_mismatch(p_payment, p_answer);
begin
  -- L6: Midtrans lists an applied manual refund's key with another amount.
  if mismatched is not null then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('refund_key_mismatch', 'high', 'refund_key_mismatch:' || mismatched,
            'Refund Midtrans tidak sama dengan penyesuaiannya',
            jsonb_build_object('adjustment_id', mismatched, 'booking_id', p_payment.booking_id,
                               'order_id', p_payment.order_id))
    on conflict (fingerprint) where acknowledged_at is null do update
    set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1, notified_at = null;
  end if;
  if refunded_at_midtrans is not null and internal.midtrans_recorded(p_payment) >= refunded_at_midtrans then
    -- I1: the refunds recorded under Midtrans' word cover what it now reports, so its open alert is answered.
    perform internal.close_refund_alert('refund_seen:' || p_payment.order_id, internal.midtrans_recorded(p_payment),
                                        internal.latest_refund_recorder(p_payment));
    return jsonb_build_object('result', 'ignored', 'processing_result', 'refund_already_recorded',
                              'payment_status', p_payment.status);
  end if;
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('refund_seen', 'high', 'refund_seen:' || p_payment.order_id,
          'Refund terlihat di Midtrans; catat di Keuangan',
          jsonb_strip_nulls(jsonb_build_object('booking_id', p_payment.booking_id, 'order_id', p_payment.order_id,
                                               'status', p_target, 'refunded_amount', refunded_at_midtrans)))
  on conflict (fingerprint) where acknowledged_at is null do update
  set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1, details = excluded.details,
      notified_at = null;
  return jsonb_build_object('result', 'ignored', 'processing_result', 'refund_awaiting_record',
                            'payment_status', p_payment.status);
end;
$$;


-- ===== L-1: releasing an L6 block =====

-- A refund recorded under Midtrans' word while a released mismatch stands: Midtrans' figure is the one that counts,
-- so the record is audited and the high refund_key_mismatch_overridden alert names it.
create function internal.note_key_mismatch_override(p_payment public.payments, p_reference text, p_amount bigint,
  p_actor uuid) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  released uuid := internal.refund_key_mismatch(p_payment, null, true);
begin
  if released is null then
    return;
  end if;
  perform internal.log_audit('refund.recorded_over_key_mismatch', 'payment_adjustments', released::text,
    jsonb_build_object('order_id', p_payment.order_id, 'refund_reference', p_reference, 'amount', p_amount));
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('refund_key_mismatch_overridden', 'high', 'refund_key_mismatch_overridden:' || p_payment.order_id || ':' || p_reference,
          'Refund dicatat menurut angka Midtrans meski kunci refund penyesuaian tidak cocok',
          jsonb_build_object('adjustment_id', released, 'booking_id', p_payment.booking_id, 'order_id', p_payment.order_id,
                             'amount', p_amount, 'actor_id', p_actor))
  on conflict (fingerprint) where acknowledged_at is null do nothing;
end;
$$;
revoke execute on function internal.note_key_mismatch_override(public.payments, text, bigint, uuid)
  from public, anon, authenticated, service_role;

-- The superadmin, with a fresh code, acknowledges the open refund_key_mismatch alert of an applied manual refund with a
-- note of 10 to 300 characters; the release is audited with the note.
create function public.release_refund_key_mismatch(p_adjustment_id uuid, p_note text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  alert public.security_alerts;
  note text := btrim(coalesce(p_note, ''));
begin
  perform internal.require_finance_writer();
  if length(note) not between 10 and 300 then
    raise exception 'a release says why in 10 to 300 characters' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  select s.* into alert from public.security_alerts s
  where s.fingerprint = 'refund_key_mismatch:' || p_adjustment_id and s.acknowledged_at is null
  for update;
  if alert.id is null then
    raise exception 'adjustment % has no open refund_key_mismatch alert', p_adjustment_id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  update public.security_alerts
  set acknowledged_by = auth.uid(), details = jsonb_build_object('release_note', note, 'released_by', auth.uid())
  where id = alert.id;
  perform internal.log_audit('refund.key_mismatch_released', 'payment_adjustments', p_adjustment_id::text,
    jsonb_build_object('alert_id', alert.id, 'note', note));
  return jsonb_build_object('result', 'released', 'adjustment_id', p_adjustment_id);
end;
$$;
revoke execute on function public.release_refund_key_mismatch(uuid, text) from public, anon, service_role;
grant execute on function public.release_refund_key_mismatch(uuid, text) to authenticated;


-- ===== record_refund_core (L6, L7, I2, L-1) =====

-- Replaces the 20261104080200 version (review of PR #69, H1, D-1, M-1, L-1: the open visit-terms request decides and
-- is booked through book_refund_request; check_refund_against_requests; REFUND_PENDING_AT_MIDTRANS), with L6, L7,
-- I2 and the L-1 override added; everything else in it is unchanged.
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
  -- A Midtrans refund whose refund_key is an applied adjustment's id was booked by that adjustment (N17), however
  -- the reference writes that id (L7).
  if p_reported_only
     and exists (select 1 from public.payment_adjustments a
                 where a.id = internal.adjustment_id_of(reference) and a.booking_id = p_booking_id
                   and a.status = 'applied') then
    raise exception 'refund % was recorded when its adjustment was applied', reference
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  perform internal.require_unused_proof(p_booking_id, p_proof_path,
                                        nullif(current_setting('app.adjustment_id', true), '')::uuid);
  payment := internal.refund_payment_of(p_booking_id, p_payment_id);
  -- L6, I2: what Midtrans holds must be readable before anything is recorded against it, a refund that answers an
  -- open visit-terms request included.
  if p_reported_only and internal.refund_key_mismatch(payment, null) is not null then
    raise exception 'Midtrans lists the refund of adjustment % with another amount', internal.refund_key_mismatch(payment, null)
      using errcode = 'P0001', hint = 'REFUND_KEY_MISMATCH';
  end if;
  if p_reported_only and internal.refund_list_missing(payment, null) then
    raise exception 'Midtrans'' latest answer for order % lists no refunds, while a manual refund is not yet counted',
      payment.order_id using errcode = 'P0001', hint = 'REFUND_LIST_MISSING';
  end if;
  if p_reported_only then
    perform internal.note_key_mismatch_override(payment, reference, p_amount, p_actor);
  end if;
  -- Review of PR #69, H1, and its delta review, D-1: while a visit-terms refund request is open for the payment, it
  -- decides. A bank transfer of any amount waits while Midtrans may still pay a QRIS request out; one that Midtrans
  -- refused, or a Virtual Account one, is finished only by a refund of exactly its amount, which books the request, so
  -- its ledger keeps the A16 split and the booking keeps its status.
  perform internal.check_refund_against_requests(payment.id, p_amount, p_reported_only);
  select * into request from public.refund_requests r
  where r.payment_id = payment.id and r.status in ('requested', 'submitted', 'failed') and r.amount = p_amount
  for update;
  if request.id is not null then
    -- A disputed or duplicate payment is not refunded here, which would drop its flag (final review of PR #69, L-1).
    if payment.status not in ('settled', 'partially_refunded') then
      raise exception 'payment % is %, not a payment its refund request is booked against', payment.order_id,
        payment.status using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
    -- A bank transfer against a QRIS request Midtrans may still pay out would pay the visitor twice (final review of PR
    -- #69, M-1): only a request Midtrans refused is finished by hand.
    if not p_reported_only and request.method = 'qris' and request.status <> 'failed' then
      raise exception 'refund % is still % at Midtrans; a transfer may follow only a refused one', request.refund_key,
        request.status using errcode = 'P0001', hint = 'REFUND_PENDING_AT_MIDTRANS';
    end if;
    if p_reported_only and internal.midtrans_refunded(payment) < internal.midtrans_recorded(payment) + p_amount then
      raise exception 'Midtrans reports no refund of % on order %', internal.midtrans_recorded(payment) + p_amount,
        payment.order_id using errcode = 'P0001', hint = 'REFUND_NOT_AT_MIDTRANS';
    end if;
    is_whole_request := payment.refunded_amount + p_amount >= payment.gross_amount;
    previous_settings := internal.push_settings('{"app.in_rpc": "1"}');
    credit_note := internal.book_refund_request(request,
      case when is_whole_request then 'refunded' else 'partially_refunded' end::public.payment_status,
      payment.refunded_amount + p_amount, p_reported_only, reference, p_actor) ->> 'credit_note_number';
    perform internal.restore_settings(previous_settings);
    return jsonb_build_object('result', 'recorded', 'amount', p_amount, 'whole', is_whole_request,
                              'credit_note_number', credit_note);
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
