-- Task P3.10.02 and P3.9.01 at their call points in internal.settle_payment (docs/PRD.md §9.2, §9.3; docs/Security.md
-- §3.5, §3.6; WH-12, REC-06, QR-01): a settlement now posts the revenue-share ledger and issues one tickets_qr row per
-- leg, in the same transaction as the payment. The QR signing key a ticket names comes from the server
-- (QR_SIGNING_ACTIVE_KID), which passes it to apply_payment_event. A ledger the rules refuse puts the booking under
-- review and never rolls the settlement back (decision of 2026-10-22, review of PR #24); a poll of a paid booking that
-- lacks its tickets or its ledger writes the missing ones, once (Task P3.10.04). A chargeback suspends the tickets of a
-- visit still ahead; record_refund and the cancellation of a paid booking revoke them all (Tasks P4.7.03, P3.12.02).


-- ===== Tickets =====

-- One ticket per leg holding its seats, valid from checkin.grace_before_minutes before its session to
-- checkin.grace_after_minutes after (docs/Security.md §7.3): ticket_code <booking_code>-<RW in two digits>, valid_on
-- the leg's date. A leg that already has its ticket gets none, so issuing again writes only what is missing.
-- tickets_require_paid_booking (0004) refuses any ticket without a paid booking and a settled payment.
create function internal.issue_booking_tickets(p_booking_id uuid) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  key_id text := nullif(current_setting('app.qr_key_id', true), '');
  minutes_before integer := (select (s.value #>> '{}')::integer from public.site_settings s
                             where s.key = 'checkin.grace_before_minutes');
  minutes_after integer := (select (s.value #>> '{}')::integer from public.site_settings s
                            where s.key = 'checkin.grace_after_minutes');
  issued integer;
begin
  if key_id is null or key_id !~ '^[a-z0-9]+$' then
    raise exception 'a ticket needs the QR signing key id the server signs it with' using errcode = '22023';
  end if;
  insert into public.tickets_qr (booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code, valid_on,
    valid_from, valid_until, pax_count, key_id)
  select l.booking_id, l.id, l.rw_id, l.visit_session_id, b.booking_code || '-' || lpad(l.rw_id::text, 2, '0'),
         s.session_date,
         (s.session_date + s.start_time) at time zone 'Asia/Jakarta' - make_interval(mins => minutes_before),
         (s.session_date + s.end_time) at time zone 'Asia/Jakarta' + make_interval(mins => minutes_after),
         l.pax_count, key_id
  from public.booking_legs l
  join public.bookings b on b.id = l.booking_id
  join public.visit_sessions s on s.id = l.visit_session_id
  where l.booking_id = p_booking_id and l.status in ('reserved', 'checked_in')
    and not exists (select 1 from public.tickets_qr t where t.booking_leg_id = l.id)
  order by l.leg_order;
  get diagnostics issued = row_count;
  return issued;
end;
$$;

-- docs/PRD.md §9.4: a chargeback suspends the tickets of a visit still ahead, which the superadmin reinstates or revokes.
create function internal.suspend_booking_tickets(p_booking_id uuid, p_reason text) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  suspended integer;
begin
  update public.tickets_qr
  set status = 'suspended', suspended_at = now(), suspend_reason = left(p_reason, 200)
  where booking_id = p_booking_id and status = 'issued' and valid_until > now();
  get diagnostics suspended = row_count;
  return suspended;
end;
$$;

-- docs/PRD.md §9.2 and §9.3: a refund or the cancellation of a paid booking revokes every ticket of the booking in
-- the same transaction, a combo's second gate included. An expired ticket stays expired.
create function internal.revoke_booking_tickets(p_booking_id uuid, p_reason text, p_actor_id uuid) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  revoked integer;
begin
  update public.tickets_qr
  set status = 'revoked', revoked_at = now(), revoked_by = p_actor_id, revoke_reason = left(p_reason, 200)
  where booking_id = p_booking_id and status in ('issued', 'used', 'suspended');
  get diagnostics revoked = row_count;
  return revoked;
end;
$$;


-- ===== The ledger at settlement, refused into a review =====

-- Replaces the 20261024090100 version: the same reasons, and the ledger's own.
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
    "CHARGEBACK": "Chargeback atas pembayaran yang sudah lunas",
    "REVENUE_RULE_REFUSED": "Pembagian hasil tidak bisa dihitung; periksa aturan bagi hasil"
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

-- The ledger of a settled payment, or false when the rules refuse it. The rows are written in a block of their own, so
-- a refusal leaves no half-written ledger and the settlement stands.
create function internal.try_allocate_revenue_share(p_booking_id uuid, p_payment_id uuid) returns boolean
  language plpgsql
  set search_path = ''
as $$
begin
  perform internal.allocate_revenue_share(p_booking_id, p_payment_id);
  return true;
exception when sqlstate 'P0001' or sqlstate 'P0002' then
  return false;
end;
$$;


-- ===== internal.settle_payment, with its ledger and tickets =====

-- Replaces the 20261024090100 version: the call points of Tasks P3.9.01 and P3.10.02 are filled. Everything else is
-- unchanged.
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
  if not internal.try_allocate_revenue_share(booking.id, payment.id) then
    perform internal.flag_payment_review(booking, payment, 'REVENUE_RULE_REFUSED', 'high', p_actor_type);
  end if;
  if has_seats then
    perform internal.issue_booking_tickets(booking.id);
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

-- A settled payment seen again (the poll's self-heal, Task P3.10.04): whatever a paid booking still lacks is written,
-- its tickets and its ledger, once; anything else is ignored. A refused ledger stays with the review it raised at
-- settlement, so a poll every five minutes adds no alert or history line.
create function internal.complete_paid_booking(p_booking public.bookings, p_payment public.payments) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  tickets_written integer := 0;
  is_ledger_new boolean := false;
begin
  if p_booking.status not in ('paid', 'checked_in') then
    return jsonb_build_object('result', 'ignored', 'processing_result', 'ignored_transition',
                              'payment_status', p_payment.status, 'booking_status', p_booking.status);
  end if;
  if not exists (select 1 from public.revenue_share_entries e
                 where e.booking_id = p_booking.id and e.entry_type = 'settlement') then
    is_ledger_new := internal.try_allocate_revenue_share(p_booking.id, p_payment.id);
  end if;
  tickets_written := internal.issue_booking_tickets(p_booking.id);
  return jsonb_build_object(
    'result', case when tickets_written > 0 or is_ledger_new then 'applied' else 'ignored' end,
    'processing_result', case when tickets_written > 0 or is_ledger_new then 'completed_paid_booking'
                              else 'ignored_transition' end,
    'payment_status', p_payment.status, 'booking_status', p_booking.status,
    'tickets_issued', tickets_written, 'ledger_written', is_ledger_new);
end;
$$;

-- Replaces the 20261024090100 version: a settled payment seen settled again completes its booking, and a chargeback
-- suspends the tickets of a visit still ahead. Everything else is unchanged.
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
    if p_payment.status = 'settled' then
      return internal.complete_paid_booking(p_booking, p_payment);
    end if;
    if p_payment.status in ('refunded', 'partially_refunded', 'disputed', 'duplicate') then
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


-- ===== internal.apply_payment_event, with the QR signing key =====

-- Replaces the 20261024090100 version, which took no key: p_key_id is the kid of QR_SIGNING_KEYS the server signs new
-- tickets with (QR_SIGNING_ACTIVE_KID), kept on each ticket so its QR is signed the same way until that kid retires
-- (docs/Security.md §9.1). It travels to issue_booking_tickets as app.qr_key_id, which a pgTAP file sets itself when
-- it calls this directly; a settlement with no key issues no ticket and fails. Everything else is unchanged.
drop function public.svc_apply_payment_event(bigint, text, jsonb);
drop function internal.apply_payment_event(bigint, text, jsonb);

create function internal.apply_payment_event(p_event_id bigint, p_source text, p_confirmed jsonb,
  p_key_id text default null) returns jsonb
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
  if p_key_id is not null and p_key_id !~ '^[a-z0-9]+$' then
    raise exception 'a QR signing key id is lowercase letters and digits' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1', 'app.actor_role', 'cron')
    || case when p_key_id is null then '{}'::jsonb else jsonb_build_object('app.qr_key_id', p_key_id) end);

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

create function public.svc_apply_payment_event(p_event_id bigint, p_source text, p_key_id text,
  p_confirmed jsonb default null) returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.apply_payment_event(p_event_id, p_source, p_confirmed, p_key_id); $$;

revoke execute on function internal.issue_booking_tickets(uuid), internal.suspend_booking_tickets(uuid, text),
  internal.revoke_booking_tickets(uuid, text, uuid), internal.try_allocate_revenue_share(uuid, uuid),
  internal.complete_paid_booking(public.bookings, public.payments),
  internal.apply_payment_event(bigint, text, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.svc_apply_payment_event(bigint, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.svc_apply_payment_event(bigint, text, text, jsonb) to service_role;
