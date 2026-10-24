-- Task P3.8.02 (docs/PRD.md §9.2, §9.4; docs/Security.md §3.4, §3.5; WH-07, WH-12, WH-14, WH-16, REC-06, REC-11,
-- PAY-13): internal.apply_payment_event, the one place a Midtrans answer moves a payment and its booking. One
-- transaction applies the payment's status, the booking's, the invoice and receipt numbers, the outbox and the audit.
-- The booking effects follow docs/PRD.md §9.2 (decision of 2026-10-21, review of PR #19): a Midtrans cancel or expire
-- closes the attempt only, and the booking stays pending_payment until expire_stale_bookings expires it. Decisions of
-- 2026-10-24: a refund seen at Midtrans before record_refund leaves the payment settled and raises a high alert (Q1);
-- the staff messages go by email to every active superadmin and to the RW admins of the booking's own legs (Q2).
-- Tickets (Task P3.10.02) and the revenue-share ledger (Task P3.9.01) are added at the call points marked below.


-- ===== Reading a Midtrans answer =====

-- The status map of CLAUDE.md §7.2, mirrored by src/lib/midtrans/map-status.ts. NULL for a status this site never
-- asks for (cards' authorize), which is stored and ignored. Cards are not offered, so a capture is judged by its fraud
-- status alone, and one without a verdict waits for a person.
create function internal.midtrans_payment_status(p_transaction_status text, p_fraud_status text)
  returns public.payment_status
  language sql immutable
  set search_path = ''
as $$
  select (case p_transaction_status
    when 'settlement' then 'settled'
    when 'capture' then case p_fraud_status when 'accept' then 'settled' when 'deny' then 'denied' else 'needs_review' end
    when 'pending' then 'pending'
    when 'deny' then 'denied'
    when 'failure' then 'failed'
    when 'cancel' then 'cancelled'
    when 'expire' then 'expired'
    when 'refund' then 'refunded'
    when 'partial_refund' then 'partially_refunded'
    when 'chargeback' then 'disputed'
    when 'partial_chargeback' then 'disputed'
  end)::public.payment_status;
$$;

-- Midtrans writes its times as 'YYYY-MM-DD HH:MM:SS' in Jakarta time. Anything else reads as unknown rather than
-- failing the whole event.
create function internal.midtrans_time(p_value text) returns timestamptz
  language plpgsql stable
  set search_path = ''
as $$
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$' then
    return null;
  end if;
  return p_value::timestamp at time zone 'Asia/Jakarta';
exception when others then
  return null;
end;
$$;

-- docs/Security.md §3.3 step 9: rupiah has no cents, so "1250000.00" is 1 250 000 and "1250000.50" matches nothing.
-- The CASE reads the shape before the number, so a malformed amount is a mismatch rather than a failed cast.
create function internal.midtrans_amount_matches(p_raw text, p_currency text, p_expected bigint) returns boolean
  language sql immutable
  set search_path = ''
as $$
  select case when p_raw ~ '^[0-9]{1,15}(\.0{1,2})?$' and p_currency = 'IDR'
              then split_part(p_raw, '.', 1)::bigint = p_expected
              else false end;
$$;

-- What an answer says about how the visitor paid, written with the new status. Only open or closed attempts come
-- here: a settled payment keeps every column but its status (payments_immutable_guard).
create function internal.store_payment_answer(p_payment_id uuid, p_status public.payment_status, p_answer jsonb)
  returns public.payments
  language plpgsql
  set search_path = ''
as $$
declare
  payment_type text := p_answer ->> 'payment_type';
  stored public.payments;
begin
  update public.payments p set
    status = p_status,
    provider_txn_id = coalesce(p.provider_txn_id, p_answer ->> 'transaction_id'),
    payment_type_raw = coalesce(payment_type, p.payment_type_raw),
    method = coalesce(case when payment_type = 'qris' then 'qris'
                           when payment_type in ('bank_transfer', 'echannel', 'permata') then 'virtual_account'
                      end::public.payment_method, p.method),
    va_bank = coalesce(p_answer #>> '{va_numbers,0,bank}',
                       case when p_answer ? 'permata_va_number' then 'permata'
                            when payment_type = 'echannel' then 'mandiri' end, p.va_bank),
    va_number = coalesce(p_answer #>> '{va_numbers,0,va_number}', p_answer ->> 'permata_va_number',
                         p_answer ->> 'bill_key', p.va_number),
    transaction_time = coalesce(internal.midtrans_time(p_answer ->> 'transaction_time'), p.transaction_time),
    settlement_time = case when p_status = 'settled'
                           then coalesce(internal.midtrans_time(p_answer ->> 'settlement_time'), now())
                           else p.settlement_time end,
    fraud_status = coalesce(p_answer ->> 'fraud_status', p.fraud_status),
    status_code = coalesce(p_answer ->> 'status_code', p.status_code),
    last_payload = p_answer
  where p.id = p_payment_id
  returning * into stored;
  return stored;
end;
$$;


-- ===== The staff messages (decision of 2026-10-24, Q2) =====

-- One email to every active superadmin and to the active RW admin of each of the booking's legs. The message is the
-- staff member's own, so it names no booking (notifications_guest_guard sends a booking's messages to its PIC only)
-- and is deduplicated per profile. The superadmin may see the whole booking and its total; an RW admin sees their own
-- leg only, never the total, another RW's figures or the PIC's contact (STAFF-02). Queued now, sent once the worker
-- of Task P3.11.02 can send these templates.
create function internal.notify_staff(p_booking public.bookings, p_template public.notification_template,
  p_reason text) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  insert into public.notifications (booking_id, channel, template, recipient, recipient_name, params, dedupe_key)
  select null, 'email', p_template, p.email::text, p.full_name,
         jsonb_strip_nulls(jsonb_build_object('booking_code', p_booking.booking_code,
           'institution', p_booking.institution_name, 'visit_date', p_booking.visit_date,
           'pax', p_booking.pax_count, 'total', p_booking.total_amount, 'reason', p_reason)),
         concat_ws(':', 'booking', p_booking.id, p_template, p_reason, 'email', p.id)
  from public.profiles p
  where p.role = 'superadmin' and p.is_active
  on conflict (dedupe_key) do nothing;

  insert into public.notifications (booking_id, channel, template, recipient, recipient_name, params, dedupe_key)
  select null, 'email', p_template, p.email::text, p.full_name,
         jsonb_strip_nulls(jsonb_build_object('booking_code', p_booking.booking_code, 'rw_name', r.name,
           'visit_date', s.session_date, 'start_time', s.start_time, 'end_time', s.end_time, 'pax', l.pax_count,
           'reason', p_reason)),
         concat_ws(':', 'booking', p_booking.id, p_template, p_reason, 'email', p.id)
  from public.profiles p
  join public.booking_legs l on l.booking_id = p_booking.id and l.rw_id = p.rw_id
  join public.visit_sessions s on s.id = l.visit_session_id
  join public.rw_units r on r.id = l.rw_id
  where p.role = 'admin_rw' and p.is_active
  on conflict (dedupe_key) do nothing;
end;
$$;

-- docs/PRD.md §9.2: a booking whose money needs a person keeps its status and carries needs_review with the reason,
-- an alert for the superadmin, a line in its history and the staff message. p_reason is a code, never free text.
create function internal.flag_payment_review(p_booking public.bookings, p_payment public.payments, p_reason text,
  p_severity public.alert_severity, p_actor_type text) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  titles constant jsonb := '{
    "AMOUNT_MISMATCH": "Nominal pembayaran Midtrans tidak sama dengan tagihan",
    "STATUS_DISAGREEMENT": "Notifikasi Midtrans tidak sesuai dengan Status API",
    "PAYMENT_CHALLENGE": "Pembayaran ditandai Midtrans untuk diperiksa",
    "PAID_AFTER_EXPIRY_NO_QUOTA": "Dibayar setelah kedaluwarsa, kuota sesi sudah habis",
    "CHARGEBACK": "Chargeback atas pembayaran yang sudah lunas"
  }';
begin
  update public.bookings set needs_review = true, review_reason = p_reason where id = p_booking.id;
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('payment_review', p_severity, 'payment_review:' || p_reason || ':' || p_payment.order_id,
          coalesce(titles ->> p_reason, 'Pembayaran perlu diperiksa'),
          jsonb_build_object('booking_id', p_booking.id, 'order_id', p_payment.order_id, 'reason', p_reason))
  on conflict (fingerprint) where acknowledged_at is null do update
  set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1, notified_at = null;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, reason, payload)
  values (p_booking.id, p_booking.status, p_booking.status, p_actor_type, lower(p_reason),
          jsonb_build_object('order_id', p_payment.order_id));
  perform internal.notify_staff(p_booking, 'admin_booking_needs_review', p_reason);
end;
$$;


-- ===== Settlement: the invoice, the receipt, a late settlement's seats =====

-- The invoice keeps the document shape of docs/PRD.md §8.4.5, as the quotation does, plus how and when it was paid.
create function internal.invoice_snapshot(p_booking public.bookings, p_payment public.payments) returns jsonb
  language sql stable
  set search_path = ''
as $$
  select (internal.quotation_snapshot(p_booking, null) - 'valid_until')
    || jsonb_build_object('template_version', 'invoice-v1',
         'payment', jsonb_build_object('method', p_payment.method, 'va_bank', p_payment.va_bank,
                                       'order_id', p_payment.order_id, 'paid_at', p_payment.settlement_time,
                                       'amount_paid', p_payment.gross_amount));
$$;

-- docs/Security.md §3.8: invoice and receipt numbers are drawn at settlement, inside its transaction, so a rollback
-- takes them back. A booking keeps one live invoice: one already issued unpaid is marked paid.
create function internal.issue_paid_invoice(p_booking public.bookings, p_payment public.payments) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  live public.invoices;
begin
  select * into live from public.invoices i where i.booking_id = p_booking.id and i.status <> 'void' for update;
  if found and live.status = 'paid' then
    return;
  end if;
  if found then
    update public.invoices
    set status = 'paid', amount_paid = p_payment.gross_amount, paid_at = p_payment.settlement_time,
        payment_id = p_payment.id, receipt_number = internal.next_document_number('receipt', now()),
        snapshot = internal.invoice_snapshot(p_booking, p_payment)
    where id = live.id;
    return;
  end if;
  insert into public.invoices (booking_id, invoice_number, status, amount_due, amount_paid, paid_at, payment_id,
    receipt_number, snapshot)
  values (p_booking.id, internal.next_document_number('invoice', now()), 'paid', p_booking.total_amount,
          p_payment.gross_amount, p_payment.settlement_time, p_payment.id,
          internal.next_document_number('receipt', now()), internal.invoice_snapshot(p_booking, p_payment));
end;
$$;

-- docs/Security.md §3.4, late settlement: an expired hold's legs take their seats again, session by session in id
-- order, all or none. False when a session has no room left; the booking is then paid without seats and waits for the
-- superadmin's resolve_booking_review. A re-reserved leg clears quota_released_at, so a later release gives its seats
-- back again.
create function internal.revive_expired_hold(p_booking_id uuid) returns boolean
  language plpgsql
  set search_path = ''
as $$
declare
  leg record;
begin
  perform 1 from public.booking_legs l where l.booking_id = p_booking_id order by l.id for update;
  begin
    for leg in
      select l.visit_session_id, l.pax_count from public.booking_legs l
      where l.booking_id = p_booking_id and l.status = 'released' order by l.visit_session_id
    loop
      perform internal.reserve_session_quota(leg.visit_session_id, leg.pax_count);
    end loop;
  exception when sqlstate 'P0001' then
    return false;
  end;
  update public.booking_legs set status = 'reserved', quota_reserved_at = now(), quota_released_at = null
  where booking_id = p_booking_id and status = 'released';
  return true;
end;
$$;

-- A second settled payment for a booking already paid for: no invoice and no ledger; the superadmin refunds it
-- (docs/PRD.md §9.2 row paid → paid (duplicate), Task P4.7).
create function internal.record_duplicate_settlement(p_booking public.bookings, p_payment public.payments,
  p_answer jsonb, p_actor_type text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  duplicate public.payments := internal.store_payment_answer(p_payment.id, 'duplicate', p_answer);
begin
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('duplicate_settlement', 'high', 'duplicate_settlement:' || duplicate.order_id,
          'Pembayaran ganda untuk satu pesanan; kembalikan dananya',
          jsonb_build_object('booking_id', p_booking.id, 'order_id', duplicate.order_id,
                             'amount', duplicate.gross_amount))
  on conflict (fingerprint) where acknowledged_at is null do update
  set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1, notified_at = null;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, reason, payload)
  values (p_booking.id, p_booking.status, p_booking.status, p_actor_type, 'duplicate_settlement',
          jsonb_build_object('order_id', duplicate.order_id));
  perform internal.notify_staff(p_booking, 'admin_booking_needs_review', 'DUPLICATE_SETTLEMENT');
  return jsonb_build_object('result', 'duplicate', 'processing_result', 'duplicate_settlement',
                            'payment_status', 'duplicate', 'booking_status', p_booking.status);
end;
$$;

-- docs/PRD.md §9.2 rows pending_payment → paid and expired → paid. Money is never silently kept: a settlement for a
-- booking in any other state (cancelled, refunded) settles the payment and puts the booking under review. Other open
-- attempts of a paid booking are closed, and payment-service.ts expires their orders at Midtrans (close_orders).
create function internal.settle_payment(p_booking public.bookings, p_payment public.payments, p_answer jsonb,
  p_actor_type text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  payment public.payments;
  booking public.bookings;
  closed_orders text[];
  has_seats boolean := true;
begin
  if exists (select 1 from public.payments p
             where p.booking_id = p_booking.id and p.status = 'settled' and p.id <> p_payment.id) then
    return internal.record_duplicate_settlement(p_booking, p_payment, p_answer, p_actor_type);
  end if;
  payment := internal.store_payment_answer(p_payment.id, 'settled', p_answer);
  with closed as (
    update public.payments set status = 'cancelled'
    where booking_id = p_booking.id and id <> payment.id and status in ('initiated', 'pending')
    returning order_id)
  select coalesce(array_agg(order_id order by order_id), '{}') into closed_orders from closed;

  if p_booking.status not in ('pending_payment', 'expired') then
    perform internal.flag_payment_review(p_booking, payment, 'PAID_WHILE_' || upper(p_booking.status::text), 'high',
                                         p_actor_type);
    return jsonb_build_object('result', 'needs_review', 'processing_result', 'paid_while_' || p_booking.status,
                              'payment_status', 'settled', 'booking_status', p_booking.status,
                              'close_orders', to_jsonb(closed_orders));
  end if;
  if p_booking.status = 'expired' then
    has_seats := internal.revive_expired_hold(p_booking.id);
  end if;
  update public.bookings
  set status = 'paid', paid_at = payment.settlement_time, amount_paid = payment.gross_amount,
      review_reason = case when p_booking.status <> 'expired' then review_reason
                           when has_seats then 'LATE_SETTLEMENT_REQUOTA' else 'PAID_AFTER_EXPIRY_NO_QUOTA' end
  where id = p_booking.id
  returning * into booking;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, reason, payload)
  values (booking.id, p_booking.status, 'paid', p_actor_type,
          case when p_booking.status = 'pending_payment' then 'payment_settled'
               when has_seats then 'revived_late_settlement' else 'paid_after_expiry_no_quota' end,
          jsonb_build_object('order_id', payment.order_id, 'amount', payment.gross_amount));
  perform internal.issue_paid_invoice(booking, payment);
  -- Task P3.9.01 posts the revenue-share ledger here: internal.allocate_revenue_share(booking.id, payment.id).
  if has_seats then
    -- Task P3.10.02 issues one tickets_qr row per leg here, before the ticket message is queued.
    perform internal.enqueue_notification(booking.id, 'payment_received_ticket', 'whatsapp', '{"link_scope": "view"}');
    perform internal.enqueue_notification(booking.id, 'payment_received_ticket', 'email', '{"link_scope": "view"}');
    perform internal.notify_staff(booking, 'admin_new_paid_booking', null);
  else
    perform internal.flag_payment_review(booking, payment, 'PAID_AFTER_EXPIRY_NO_QUOTA', 'high', p_actor_type);
  end if;
  return jsonb_build_object('result', 'applied', 'processing_result', 'settled', 'payment_status', 'settled',
                            'booking_status', 'paid', 'close_orders', to_jsonb(closed_orders));
end;
$$;


-- ===== Every other status =====

-- A refund or partial refund seen at Midtrans before the superadmin records it (decision of 2026-10-24, Q1): the
-- payment stays settled with its refunded amount, since bookings_status_transition refunds a booking only while a
-- settled payment stands, and record_refund (Task P4.7) moves both and reconciles with this stored event.
create function internal.note_refund_seen(p_payment public.payments, p_target public.payment_status) returns jsonb
  language plpgsql
  set search_path = ''
as $$
begin
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('refund_seen', 'high', 'refund_seen:' || p_payment.order_id,
          'Refund terlihat di Midtrans; catat di Keuangan',
          jsonb_build_object('booking_id', p_payment.booking_id, 'order_id', p_payment.order_id, 'status', p_target))
  on conflict (fingerprint) where acknowledged_at is null do update
  set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1, details = excluded.details;
  return jsonb_build_object('result', 'ignored', 'processing_result', 'refund_awaiting_record',
                            'payment_status', p_payment.status);
end;
$$;

-- What a confirmed status does to an attempt that is not being settled (docs/Security.md §3.4, allowed transitions):
-- open attempts become pending or close; a settled payment only goes on to disputed; anything else is ignored, so a
-- late or repeated answer never moves a payment back.
create function internal.apply_payment_status(p_booking public.bookings, p_payment public.payments,
  p_target public.payment_status, p_answer jsonb, p_actor_type text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  is_open boolean := p_payment.status in ('initiated', 'pending');
  ignored jsonb := jsonb_build_object('result', 'ignored', 'processing_result', 'ignored_transition',
                                      'payment_status', p_payment.status, 'booking_status', p_booking.status);
  applied jsonb := jsonb_build_object('result', 'applied', 'processing_result', p_target,
                                      'payment_status', p_target, 'booking_status', p_booking.status);
begin
  if p_target = 'settled' then
    if p_payment.status in ('settled', 'refunded', 'partially_refunded', 'disputed', 'duplicate') then
      return ignored;
    end if;
    return internal.settle_payment(p_booking, p_payment, p_answer, p_actor_type);
  elsif p_target in ('refunded', 'partially_refunded') then
    return internal.note_refund_seen(p_payment, p_target);
  elsif p_target = 'disputed' then
    if p_payment.status not in ('settled', 'partially_refunded') then
      return ignored;
    end if;
    update public.payments set status = 'disputed' where id = p_payment.id;
    -- Task P3.10.02 suspends the booking's tickets here while the visit is still ahead.
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


-- ===== Judging an event =====

-- docs/Security.md §3.3 step 8: an order id we never issued. Only one in our own grammar is worth an alert; junk posts
-- never page anyone.
create function internal.note_unknown_order(p_event public.payment_events) returns jsonb
  language plpgsql
  set search_path = ''
as $$
begin
  if p_event.order_id ~ '^GSK-[0-9A-HJKMNP-TV-Z]{8}-[0-9]{2}$' then
    insert into public.security_events (event_type, severity, entity_type, entity_id, details)
    values ('webhook_amount_mismatch', 'high', 'payment_events', p_event.id::text,
            jsonb_build_object('reason', 'unknown_order', 'order_id', p_event.order_id));
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('unknown_order', 'high', 'unknown_order:' || p_event.order_id,
            'Notifikasi Midtrans untuk nomor pesanan yang tidak ada',
            jsonb_build_object('order_id', p_event.order_id, 'event_id', p_event.id))
    on conflict (fingerprint) where acknowledged_at is null do update
    set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1;
  end if;
  return jsonb_build_object('result', 'unknown_order', 'processing_result', 'unknown_order');
end;
$$;

-- docs/Security.md §3.3 steps 9 and 10: an answer whose amount, currency or order does not match ours, or a Status API
-- that does not confirm the money a notification claims, is never applied. An open attempt waits under review, and the
-- booking with it.
create function internal.hold_for_review(p_booking public.bookings, p_payment public.payments, p_reason text,
  p_event_type text, p_severity public.alert_severity, p_actor_type text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
begin
  insert into public.security_events (event_type, severity, entity_type, entity_id, details)
  values (p_event_type, p_severity, 'payments', p_payment.id::text,
          jsonb_build_object('order_id', p_payment.order_id, 'reason', p_reason));
  if p_payment.status in ('initiated', 'pending') then
    update public.payments set status = 'needs_review' where id = p_payment.id;
  end if;
  perform internal.flag_payment_review(p_booking, p_payment, p_reason, p_severity, p_actor_type);
  return jsonb_build_object('result', 'needs_review', 'processing_result', lower(p_reason),
                            'payment_status', case when p_payment.status in ('initiated', 'pending') then 'needs_review'
                                                   else p_payment.status::text end,
                            'booking_status', p_booking.status);
end;
$$;

-- The notification's claim against what Midtrans confirms. A pending notification changes no money and is its own
-- answer; every other one from the webhook needs the Status API's body in p_confirmed, and until it comes the event
-- stays unprocessed (needs_confirmation). An event from the poll or the Status API is that body already. The confirmed
-- status decides: a deny whose order was paid after all settles, while a settlement, refund or chargeback that Midtrans
-- does not confirm waits for a person (critical, WH-14).
create function internal.judge_payment_event(p_event public.payment_events, p_booking public.bookings,
  p_payment public.payments, p_source text, p_confirmed jsonb, p_actor_type text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  claimed public.payment_status := internal.midtrans_payment_status(p_event.transaction_status, p_event.fraud_status);
  answer jsonb;
  target public.payment_status;
begin
  if not internal.midtrans_amount_matches(p_event.gross_amount_raw, p_event.payload ->> 'currency',
                                          p_payment.gross_amount) then
    return internal.hold_for_review(p_booking, p_payment, 'AMOUNT_MISMATCH', 'webhook_amount_mismatch', 'high',
                                    p_actor_type);
  end if;
  if claimed is null then
    return jsonb_build_object('result', 'ignored', 'processing_result', 'unknown_status');
  end if;
  answer := case when p_source <> 'webhook' or claimed = 'pending' then p_event.payload else p_confirmed end;
  if answer is null then
    return jsonb_build_object('result', 'needs_confirmation');
  end if;

  target := internal.midtrans_payment_status(answer ->> 'transaction_status', answer ->> 'fraud_status');
  if answer ->> 'order_id' is distinct from p_payment.order_id
     or not internal.midtrans_amount_matches(answer ->> 'gross_amount', answer ->> 'currency', p_payment.gross_amount)
     or (claimed in ('settled', 'refunded', 'partially_refunded', 'disputed') and target is distinct from claimed) then
    if target is null and claimed not in ('settled', 'refunded', 'partially_refunded', 'disputed') then
      return jsonb_build_object('result', 'ignored', 'processing_result', 'not_confirmed');
    end if;
    return internal.hold_for_review(p_booking, p_payment, 'STATUS_DISAGREEMENT', 'status_disagreement', 'critical',
                                    p_actor_type);
  end if;
  return internal.apply_payment_status(p_booking, p_payment, target, answer, p_actor_type);
end;
$$;


-- ===== internal.apply_payment_event =====

-- docs/Security.md §3.5. Locks, in the one order every writer keeps: the audit chain's turn, the event, then the
-- booking, then its payment (expire_stale_bookings and create_payment_attempt also go booking first), then legs and
-- sessions. Replies { result: applied | ignored | duplicate | needs_review | needs_confirmation | unknown_order |
-- already_processed, processing_result, payment_status, booking_status, close_orders }. Every reply but
-- needs_confirmation marks the event processed, so Midtrans retrying a body never applies it twice. Machine work has no
-- person behind it, so its audit rows say cron, with the source in the payment.event_applied row.
create function internal.apply_payment_event(p_event_id bigint, p_source text, p_confirmed jsonb) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  event public.payment_events;
  owner_booking_id uuid;
  booking public.bookings;
  payment public.payments;
  outcome jsonb;
begin
  perform internal.require_server_caller('apply_payment_event');
  if p_source is null or p_source not in ('webhook', 'status_api', 'poll') then
    raise exception 'a payment event comes from the webhook, the Status API or the poll' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings('{"app.in_rpc": "1", "app.actor_role": "cron"}');

  select * into event from public.payment_events e where e.id = p_event_id for update;
  if not found then
    raise exception 'payment event % does not exist', p_event_id using errcode = 'P0002';
  end if;
  if event.processed_at is not null then
    perform internal.restore_settings(previous_settings);
    return jsonb_build_object('result', 'already_processed', 'processing_result', event.processing_result);
  end if;

  select p.booking_id into owner_booking_id from public.payments p where p.order_id = event.order_id;
  if owner_booking_id is null then
    outcome := internal.note_unknown_order(event);
  else
    select * into booking from public.bookings b where b.id = owner_booking_id for update;
    select * into payment from public.payments p where p.order_id = event.order_id for update;
    outcome := internal.judge_payment_event(event, booking, payment, p_source, p_confirmed,
                                            case p_source when 'webhook' then 'webhook' else 'cron' end);
  end if;

  if outcome ->> 'result' <> 'needs_confirmation' then
    update public.payment_events set processed_at = now(), processing_result = outcome ->> 'processing_result'
    where id = event.id;
    perform internal.log_audit('payment.event_applied', 'payment_events', event.id::text,
      jsonb_build_object('source', p_source, 'order_id', event.order_id, 'result', outcome ->> 'result',
                         'processing_result', outcome ->> 'processing_result'));
  end if;
  perform internal.restore_settings(previous_settings);
  return outcome;
end;
$$;

revoke execute on function internal.midtrans_payment_status(text, text), internal.midtrans_time(text),
  internal.midtrans_amount_matches(text, text, bigint),
  internal.store_payment_answer(uuid, public.payment_status, jsonb),
  internal.notify_staff(public.bookings, public.notification_template, text),
  internal.flag_payment_review(public.bookings, public.payments, text, public.alert_severity, text),
  internal.invoice_snapshot(public.bookings, public.payments),
  internal.issue_paid_invoice(public.bookings, public.payments), internal.revive_expired_hold(uuid),
  internal.record_duplicate_settlement(public.bookings, public.payments, jsonb, text),
  internal.settle_payment(public.bookings, public.payments, jsonb, text),
  internal.note_refund_seen(public.payments, public.payment_status),
  internal.apply_payment_status(public.bookings, public.payments, public.payment_status, jsonb, text),
  internal.note_unknown_order(public.payment_events),
  internal.hold_for_review(public.bookings, public.payments, text, text, public.alert_severity, text),
  internal.judge_payment_event(public.payment_events, public.bookings, public.payments, text, jsonb, text),
  internal.apply_payment_event(bigint, text, jsonb)
  from public, anon, authenticated;

create function public.svc_apply_payment_event(p_event_id bigint, p_source text, p_confirmed jsonb default null)
  returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.apply_payment_event(p_event_id, p_source, p_confirmed); $$;
revoke execute on function public.svc_apply_payment_event(bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.svc_apply_payment_event(bigint, text, jsonb) to service_role;


-- ===== A hold under review stays held (docs/Security.md §3.4, capture + challenge) =====
-- This replaces the 20261022120000 version of expire_stale_bookings: a pending_payment booking flagged needs_review
-- keeps its seats past its deadline until a superadmin resolves it, since money may already be on its way. Nothing
-- else changes.

create or replace function internal.expire_stale_bookings() returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  quotation_days integer := (select (value #>> '{}')::integer from public.site_settings
                             where key = 'booking.quotation_valid_days');
  stale record;
  expired_count integer := 0;
  failed_count integer := 0;
begin
  perform internal.take_audit_turn();
  previous_settings := internal.begin_scheduled_job();
  for stale in
    select b.id, b.status
    from public.bookings b
    where (b.status = 'pending_payment' and not b.needs_review and b.expires_at < now() - interval '5 minutes')
       or (b.status = 'quoted' and coalesce(
             (select max(q.valid_until) from public.quotations q where q.booking_id = b.id and q.status = 'issued'),
             (b.created_at at time zone 'Asia/Jakarta')::date + quotation_days
           ) < public.today_jkt())
    order by b.id
    for update skip locked
  loop
    -- One booking that fails must not keep every other hold from expiring: it is rolled back on its
    -- own, reported as cron_failed, and tried again on the next run.
    begin
      update public.bookings set status = 'expired', expired_at = now() where id = stale.id;
      perform internal.release_booking_quota(stale.id);
      update public.payments set status = 'expired' where booking_id = stale.id and status in ('initiated', 'pending');
      update public.quotations set status = 'expired' where booking_id = stale.id and status = 'issued';
      insert into public.booking_events (booking_id, from_status, to_status, actor_type, reason)
      values (stale.id, stale.status, 'expired', 'cron',
              case when stale.status = 'quoted' then 'quotation_lapsed' else 'hold_lapsed' end);
      perform internal.enqueue_notification(stale.id, 'booking_expired', 'whatsapp', '{}');
      perform internal.enqueue_notification(stale.id, 'booking_expired', 'email', '{}');
      expired_count := expired_count + 1;
    exception when others then
      failed_count := failed_count + 1;
      insert into public.security_events (event_type, severity, entity_type, entity_id, details)
      values ('cron_failed', 'high', 'bookings', stale.id::text,
              jsonb_build_object('job', 'expire_stale_bookings', 'sqlstate', sqlstate));
    end;
  end loop;
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('processed', expired_count, 'failed', failed_count);
end;
$$;
