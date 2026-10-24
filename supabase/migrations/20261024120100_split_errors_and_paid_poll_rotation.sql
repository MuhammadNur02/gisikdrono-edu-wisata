-- Re-review of PR #42, 2026-10-24 (docs/Security.md §3.7, §3.8; REC-06, MON-04): two lows on the ledger and the poll.
-- A refused split now says why, so a bug in the split is not mistaken for a missing rule; and the poll's paid bookings
-- take turns as its open attempts do, so a pile of bookings waiting for a rule cannot keep one that lost its ticket
-- from being completed.


-- ===== Why a split was refused =====

-- Replaces the 20261024100300 version: a refusal leaves its SQLSTATE and message in app.split_error for the review
-- the caller raises next (flag_payment_review). The messages name rules, lines, ids and amounts, never a person.
create or replace function internal.try_allocate_revenue_share(p_booking_id uuid, p_payment_id uuid) returns boolean
  language plpgsql
  set search_path = ''
as $$
begin
  perform internal.allocate_revenue_share(p_booking_id, p_payment_id);
  return true;
exception when sqlstate 'P0001' or sqlstate 'P0002' or sqlstate '22023' or unique_violation then
  perform set_config('app.split_error', left(sqlstate || ': ' || sqlerrm, 300), true);
  return false;
end;
$$;

-- Replaces the 20261024100100 version: a REVENUE_RULE_REFUSED review carries the split's error in its alert and its
-- booking event, and takes it off app.split_error so no later review repeats it. Everything else is unchanged.
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
  split_error text := case when p_reason = 'REVENUE_RULE_REFUSED'
                           then nullif(current_setting('app.split_error', true), '') end;
begin
  if split_error is not null then
    perform set_config('app.split_error', '', true);
  end if;
  update public.bookings set needs_review = true, review_reason = p_reason where id = p_booking.id;
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('payment_review', p_severity, 'payment_review:' || p_reason || ':' || p_payment.order_id,
          coalesce(titles ->> p_reason, 'Pembayaran perlu diperiksa'),
          jsonb_strip_nulls(jsonb_build_object('booking_id', p_booking.id, 'order_id', p_payment.order_id,
                                               'reason', p_reason, 'split_error', split_error)))
  on conflict (fingerprint) where acknowledged_at is null do update
  set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1, notified_at = null,
      details = excluded.details;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, reason, payload)
  values (p_booking.id, p_booking.status, p_booking.status, p_actor_type, lower(p_reason),
          jsonb_strip_nulls(jsonb_build_object('order_id', p_payment.order_id, 'split_error', split_error)));
  perform internal.notify_staff(p_booking, 'admin_booking_needs_review', p_reason, p_payment.order_id);
end;
$$;


-- ===== The poll's paid bookings take turns =====

-- Replaces the 20261024095100 version: last_polled_at is the poll's own bookkeeping, so a settled payment may still
-- have it stamped, as log_audit leaves it out of the audit log. Everything else is unchanged.
create or replace function internal.payments_immutable_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'payments are never deleted' using errcode = '42501';
  end if;
  if (new.gross_amount, new.order_id, new.provider, new.booking_id, new.attempt_no)
     is distinct from (old.gross_amount, old.order_id, old.provider, old.booking_id, old.attempt_no) then
    raise exception 'gross_amount, order_id, provider, booking_id and attempt_no never change'
      using errcode = '42501';
  end if;
  if old.status in ('settled', 'refunded', 'partially_refunded', 'disputed', 'duplicate')
     and not internal.in_adjustment()
     and (to_jsonb(new) - 'status' - 'refunded_amount' - 'updated_at' - 'last_polled_at')
         is distinct from (to_jsonb(old) - 'status' - 'refunded_amount' - 'updated_at' - 'last_polled_at') then
    raise exception 'a payment Midtrans settled only changes its status and refunded amount'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return new;
end;
$$;

-- Replaces the 20261024100300 version: the paid bookings that lack a ticket or their ledger are asked in the order the
-- poll last asked them and stamped as asked, like the open attempts, so each gets its turn within a few runs, those
-- waiting for a rule included. Each kind keeps a batch of its own. Everything else is unchanged.
create or replace function internal.payments_to_poll(p_limit integer) returns table (order_id text, reason text)
  language plpgsql security definer
  set search_path = ''
as $$
declare
  -- A payment made just before its hold's deadline can settle a little after it, and a late settlement still revives
  -- the booking or puts it under review, so an attempt is asked until a day past the deadline.
  asked_after_deadline constant interval := interval '24 hours';
  -- Younger than this, the visitor is still paying and the webhook usually comes first.
  still_paying constant interval := interval '2 minutes';
begin
  perform internal.require_server_caller('payments_to_poll');
  return query
  with asked_open as (
    update public.payments p set last_polled_at = now()
    where p.id in (
      select o.id from public.payments o join public.bookings b on b.id = o.booking_id
      where o.provider = 'midtrans' and o.status = 'pending' and o.created_at < now() - still_paying
        and now() < b.expires_at + asked_after_deadline
      order by o.last_polled_at nulls first, o.created_at
      limit p_limit
      for update of o skip locked)
    returning p.order_id),
  asked_paid as (
    update public.payments p set last_polled_at = now()
    where p.id in (
      select s.id from public.payments s join public.bookings b on b.id = s.booking_id
      where s.provider = 'midtrans' and s.status = 'settled' and b.status in ('paid', 'checked_in')
        and (not b.needs_review or b.review_reason = 'REVENUE_RULE_REFUSED')
        and coalesce(s.settlement_time, s.updated_at) < now() - still_paying
        and (exists (select 1 from public.booking_legs l
                     where l.booking_id = b.id and l.status in ('reserved', 'checked_in')
                       and not exists (select 1 from public.tickets_qr t where t.booking_leg_id = l.id))
             or not exists (select 1 from public.revenue_share_entries e
                            where e.booking_id = b.id and e.entry_type = 'settlement'))
      order by s.last_polled_at nulls first, coalesce(s.settlement_time, s.updated_at)
      limit p_limit
      for update of s skip locked)
    returning p.order_id)
  select asked_open.order_id, 'open'::text from asked_open
  union all
  select asked_paid.order_id, 'paid_incomplete'::text from asked_paid;
end;
$$;
