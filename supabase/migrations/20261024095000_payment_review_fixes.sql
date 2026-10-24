-- The independent security reviews of PR #39 (Task P3.8.02, 2026-10-24). A chargeback on a payment already refunded or
-- recorded as a duplicate is no longer dropped: it goes to review with a critical alert, so nobody refunds it twice
-- (M1). A settlement whose amount is not the booking's own total is never paid (L4). A pending notification is
-- confirmed with the Status API like every other, since a signature covers the order, status code and amount only, and
-- the Virtual Account shown on the pay page must come from Midtrans itself (L1). The refund-seen and unknown-order
-- alerts notify again when they recur (L5), and a staff review message is deduplicated per booking, reason and order
-- (L6). Each function below replaces its 20261024090100 version; nothing else in it changes.


-- ===== The staff messages, deduplicated per order (L6) =====

drop function internal.notify_staff(public.bookings, public.notification_template, text);

create function internal.notify_staff(p_booking public.bookings, p_template public.notification_template,
  p_reason text, p_order_id text default null) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  insert into public.notifications (booking_id, channel, template, recipient, recipient_name, params, dedupe_key)
  select null, 'email', p_template, p.email::text, p.full_name,
         jsonb_strip_nulls(jsonb_build_object('booking_code', p_booking.booking_code,
           'institution', p_booking.institution_name, 'visit_date', p_booking.visit_date,
           'pax', p_booking.pax_count, 'total', p_booking.total_amount, 'reason', p_reason)),
         concat_ws(':', 'booking', p_booking.id, p_template, p_reason, p_order_id, 'email', p.id)
  from public.profiles p
  where p.role = 'superadmin' and p.is_active
  on conflict (dedupe_key) do nothing;

  insert into public.notifications (booking_id, channel, template, recipient, recipient_name, params, dedupe_key)
  select null, 'email', p_template, p.email::text, p.full_name,
         jsonb_strip_nulls(jsonb_build_object('booking_code', p_booking.booking_code, 'rw_name', r.name,
           'visit_date', s.session_date, 'start_time', s.start_time, 'end_time', s.end_time, 'pax', l.pax_count,
           'reason', p_reason)),
         concat_ws(':', 'booking', p_booking.id, p_template, p_reason, p_order_id, 'email', p.id)
  from public.profiles p
  join public.booking_legs l on l.booking_id = p_booking.id and l.rw_id = p.rw_id
  join public.visit_sessions s on s.id = l.visit_session_id
  join public.rw_units r on r.id = l.rw_id
  where p.role = 'admin_rw' and p.is_active
  on conflict (dedupe_key) do nothing;
end;
$$;

create or replace function internal.flag_payment_review(p_booking public.bookings, p_payment public.payments,
  p_reason text, p_severity public.alert_severity, p_actor_type text) returns void
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
  perform internal.notify_staff(p_booking, 'admin_booking_needs_review', p_reason, p_payment.order_id);
end;
$$;


-- ===== Alerts that notify again (L5) =====

create or replace function internal.note_refund_seen(p_payment public.payments, p_target public.payment_status)
  returns jsonb
  language plpgsql
  set search_path = ''
as $$
begin
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

create or replace function internal.note_unknown_order(p_event public.payment_events) returns jsonb
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
    set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1, notified_at = null;
  end if;
  return jsonb_build_object('result', 'unknown_order', 'processing_result', 'unknown_order');
end;
$$;


-- ===== A settlement of the booking's own total only (L4) =====

-- The attempt's amount was the booking's total when the attempt was made; a discount the superadmin gave since then
-- changes the total but not the order Midtrans holds, so such a payment is held for review rather than paid.
create or replace function internal.settle_payment(p_booking public.bookings, p_payment public.payments,
  p_answer jsonb, p_actor_type text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  payment public.payments;
  booking public.bookings;
  closed_orders text[];
  has_seats boolean := true;
begin
  if p_payment.gross_amount <> p_booking.total_amount then
    return internal.hold_for_review(p_booking, p_payment, 'AMOUNT_MISMATCH', 'webhook_amount_mismatch', 'high',
                                    p_actor_type);
  end if;
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


-- ===== A chargeback is never dropped (M1) =====

-- A chargeback on a payment already refunded, or recorded as a duplicate, keeps its status but goes to review with a
-- critical alert: Midtrans is taking money back that the kelurahan may already have returned.
create or replace function internal.apply_payment_status(p_booking public.bookings, p_payment public.payments,
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
    if p_payment.status in ('duplicate', 'refunded') then
      perform internal.flag_payment_review(p_booking, p_payment, 'CHARGEBACK', 'critical', p_actor_type);
      return jsonb_build_object('result', 'needs_review', 'processing_result', 'chargeback_on_' || p_payment.status,
                                'payment_status', p_payment.status, 'booking_status', p_booking.status);
    end if;
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


-- ===== Every webhook status confirmed, pending included (L1) =====

-- A notification's signature covers its order id, status code and amount only, so a body replayed with another
-- va_number would still pass it. A webhook event is applied only with the Status API's body in p_confirmed, and what
-- the pay page shows (the Virtual Account, the payment type) is taken from that body alone.
create or replace function internal.judge_payment_event(p_event public.payment_events, p_booking public.bookings,
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
  answer := case when p_source <> 'webhook' then p_event.payload else p_confirmed end;
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

revoke execute on function internal.notify_staff(public.bookings, public.notification_template, text, text)
  from public, anon, authenticated;
