-- The last Lows of the final delta review of PR #90 (docs/PRD.md §13.1 A16–A20, A24, Task P3.12.02), on the weather
-- alerts of 20261104181000:
--
--   D-N1  the waiting alert follows the adjustment it names: an open one is rewritten when another adjustment is now
--         the one to apply or withdraw, and none is raised again while the latest acknowledged one names the same.
--   D-N2  a link resolved by a cancellation or a leg's weather refund closes its held and waiting alerts, as the
--         sweep's own resolutions do.
--   D-N3  the payment_refunded alert says what the superadmin can actually do, and rupiah amounts print with dots.

-- ===== D-N3: rupiah in alert titles =====

-- Rp 1.234.500: thousands with dots, as the Indonesian UI writes them (src/lib/utils/currency.ts).
create function internal.format_rupiah(p_amount bigint) returns text
  language sql immutable
  set search_path = ''
as $$ select 'Rp ' || replace(to_char(p_amount, 'FM999,999,999,999,999,990'), ',', '.'); $$;

-- ===== D-N1: the waiting alert =====

-- Replaces the 20261104181000 version. The adjustment to apply or withdraw is the oldest manual refund still open. An
-- open alert that names another one is rewritten to name this one; while the latest acknowledged alert of the link
-- names this same adjustment, nothing is raised again, so an acknowledgement holds until the adjustment changes.
create or replace function internal.flag_weather_link_waiting(p_link public.weather_notice_bookings) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  alert_key text := 'weather_link_waiting_adjustment:' || p_link.id;
  waiting record;
  alert_title text;
begin
  select a.id, a.amount, a.proposed_at, b.id as booking_id, b.booking_code into waiting
  from public.bookings b
  join public.payment_adjustments a on a.booking_id = b.id and a.type = 'manual_refund'
    and a.status in ('proposed', 'approved')
  where b.id = p_link.booking_id
  order by a.proposed_at, a.id
  limit 1;
  if waiting.id is null then
    return;
  end if;
  if not exists (select 1 from public.security_alerts s where s.fingerprint = alert_key
                 and s.acknowledged_at is null)
     and (select s.details ->> 'adjustment_id' from public.security_alerts s
          where s.fingerprint = alert_key and s.acknowledged_at is not null
          order by s.acknowledged_at desc, s.created_at desc limit 1) = waiting.id::text then
    return;
  end if;
  alert_title := 'Waktu pilih cuaca habis untuk ' || waiting.booking_code || ', tetapi penyesuaian pengembalian dana manual '
           || internal.format_rupiah(waiting.amount) || ' yang diajukan '
           || to_char(waiting.proposed_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY') || ' (' || waiting.id
           || ') masih terbuka: terapkan atau tarik penyesuaian ini.';
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('weather_link_waiting_adjustment', 'medium', alert_key, alert_title,
          jsonb_build_object('booking_id', waiting.booking_id, 'link_id', p_link.id, 'adjustment_id', waiting.id))
  on conflict (fingerprint) where acknowledged_at is null do update
  set title = excluded.title, details = excluded.details, last_seen_at = now()
  where public.security_alerts.details ->> 'adjustment_id' is distinct from excluded.details ->> 'adjustment_id';
end;
$$;

-- ===== D-N2: a resolution by cancellation closes the link's alerts =====

-- Replaces the 20261104080200 version (D-N2): every link it resolves closes its held and waiting alerts, by the
-- staff member who cancelled or with nobody's name. Everything else is unchanged.
create or replace function internal.cancel_paid_booking(p_booking public.bookings, p_actor_id uuid, p_reason text,
  p_kind public.refund_request_kind, p_quote jsonb, p_actor_type text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  quote jsonb := p_quote;
  request public.refund_requests;
  next_refund integer;
  -- The timeline keeps the quote without the payment's ids, under the reason its kind gives.
  event_reason text := case when p_kind = 'weather' then 'weather_refund' else 'cancelled_paid' end;
  event_payload jsonb := p_quote - 'payment_id' - 'order_id';
  resolved uuid[];
begin
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor_id,
    cancel_reason = left(p_reason, 200)
  where id = p_booking.id;
  perform internal.revoke_booking_tickets(p_booking.id, case when p_kind = 'weather' then 'weather_refund'
                                                             else 'cancelled' end, p_actor_id);
  perform internal.release_booking_quota(p_booking.id);
  if (quote ->> 'amount')::bigint > 0 then
    select count(*) + 1 into next_refund from public.refund_requests r where r.payment_id = (quote ->> 'payment_id')::uuid;
    insert into public.refund_requests (booking_id, payment_id, kind, method, refund_key, amount, package_refund,
      addon_refund, fee_amount, refund_pct, days_before, requested_by)
    values (p_booking.id, (quote ->> 'payment_id')::uuid, p_kind, (quote ->> 'method')::public.payment_method,
            (quote ->> 'order_id') || '-R' || lpad(next_refund::text, 2, '0'), (quote ->> 'amount')::bigint,
            (quote ->> 'package_refund')::bigint, (quote ->> 'addon_refund')::bigint,
            (quote ->> 'fee_amount')::bigint, (quote ->> 'refund_pct')::smallint, (quote ->> 'days_before')::integer,
            p_actor_id)
    returning * into request;
    perform internal.announce_refund_request(p_booking, request);
  end if;
  with closed as (
    update public.weather_notice_bookings
    set resolution = case when p_actor_type = 'cron' then 'auto_refunded'
                          when p_kind = 'weather' then 'refunded' else 'cancelled' end,
        resolved_at = now()
    where booking_id = p_booking.id and resolved_at is null
    returning id)
  select array_agg(closed.id) into resolved from closed;
  perform internal.close_weather_link_alert(link_id, p_actor_id) from unnest(resolved) as link_id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  values (p_booking.id, 'paid', 'cancelled', p_actor_type, p_actor_id,
          event_reason, event_payload);
  return jsonb_build_object('result', 'cancelled', 'close_orders', '[]'::jsonb,
    'refund', case when request.id is null then null else jsonb_build_object(
      'request_id', request.id, 'amount', request.amount, 'method', request.method, 'refund_key', request.refund_key,
      'order_id', quote ->> 'order_id') end);
end;
$$;

-- Replaces the 20261104080200 version (D-N2): the leg's link closes its alerts when it is resolved. Everything else is
-- unchanged.
create or replace function internal.refund_weather_leg(p_booking public.bookings, p_actor_id uuid, p_quote jsonb,
  p_actor_type text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  leg public.booking_legs;
  request public.refund_requests;
  next_refund integer;
  event_payload jsonb := p_quote - 'payment_id' - 'order_id';
  resolved uuid[];
begin
  select * into leg from public.booking_legs l where l.id = (p_quote ->> 'leg_id')::uuid for update;
  update public.visit_sessions set reserved_pax = greatest(reserved_pax - leg.pax_count, 0)
  where id = leg.visit_session_id;
  update public.booking_legs set status = 'released', quota_released_at = now() where id = leg.id;
  update public.tickets_qr
  set status = 'revoked', revoked_at = now(), revoked_by = p_actor_id, revoke_reason = 'weather_refund'
  where booking_leg_id = leg.id and status in ('issued', 'suspended');
  if (p_quote ->> 'amount')::bigint > 0 then
    select count(*) + 1 into next_refund from public.refund_requests r
    where r.payment_id = (p_quote ->> 'payment_id')::uuid;
    insert into public.refund_requests (booking_id, payment_id, booking_leg_id, kind, method, refund_key, amount,
      fee_amount, requested_by)
    values (p_booking.id, (p_quote ->> 'payment_id')::uuid, leg.id, 'weather',
            (p_quote ->> 'method')::public.payment_method,
            (p_quote ->> 'order_id') || '-R' || lpad(next_refund::text, 2, '0'), (p_quote ->> 'amount')::bigint,
            (p_quote ->> 'fee_amount')::bigint, p_actor_id)
    returning * into request;
    perform internal.announce_refund_request(p_booking, request);
  end if;
  with closed as (
    update public.weather_notice_bookings
    set resolution = case when p_actor_type = 'cron' then 'auto_refunded' else 'refunded' end, resolved_at = now()
    where booking_id = p_booking.id and booking_leg_id = leg.id and resolved_at is null
    returning id)
  select array_agg(closed.id) into resolved from closed;
  perform internal.close_weather_link_alert(link_id, p_actor_id) from unnest(resolved) as link_id;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  values (p_booking.id, p_booking.status, p_booking.status, p_actor_type, p_actor_id, 'weather_refund_leg',
          event_payload);
  return jsonb_build_object('result', 'cancelled', 'close_orders', '[]'::jsonb,
    'refund', case when request.id is null then null else jsonb_build_object(
      'request_id', request.id, 'amount', request.amount, 'method', request.method, 'refund_key', request.refund_key,
      'order_id', p_quote ->> 'order_id') end);
end;
$$;

-- ===== D-N3: the payment_refunded alert =====

-- Replaces the 20261104181000 version (D-N3): a payment already partly refunded has no settled payment, so a manual
-- refund that names the link is refused (named_weather_link); the alert says to send what is left as an ordinary manual
-- refund and then close the link as no_refund, which resolve_weather_link allows once no manual refund is open.
-- Everything else is unchanged.
create or replace function internal.hold_weather_link(p_link public.weather_notice_bookings, p_booking public.bookings,
  p_reason text, p_held_since timestamptz default now()) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  held uuid;
begin
  update public.weather_notice_bookings
  set held_at = coalesce(held_at, p_held_since), held_reason = p_reason
  where id = p_link.id and held_reason is distinct from p_reason
  returning id into held;
  if held is null then
    return;
  end if;
  perform internal.close_weather_link_alert(p_link.id, null);
  insert into public.security_alerts (rule, severity, fingerprint, title, details, first_seen_at)
  values ('weather_link_held', 'high', 'weather_link_held:' || p_link.id,
          case p_reason
            when 'fee_unset' then 'Waktu pilih cuaca habis, biaya Midtrans belum diatur: ' || p_booking.booking_code
                                  || '. Atur biaya Midtrans; pengembalian dana cuaca berjalan otomatis. Jangan transfer manual.'
            when 'payment_refunded' then 'Waktu pilih cuaca habis, tetapi pembayaran ' || p_booking.booking_code
                 || ' sudah dikembalikan sebagian, jadi pengembalian dana cuaca tidak dihitung otomatis. Bila masih ada '
                 || 'yang perlu dikembalikan, kirim lewat penyesuaian pengembalian dana manual tanpa menyebut tautan '
                 || 'cuaca ini dan terapkan; setelah itu tutup tautan ini sebagai tanpa pengembalian dana.'
            else 'Waktu pilih cuaca habis, bagi hasil tidak cukup untuk pengembalian dana cuaca: ' || p_booking.booking_code
                 || '. Kirim pengembalian dana lewat penyesuaian pengembalian dana manual yang menyebut tautan cuaca ini.'
          end,
          jsonb_build_object('booking_id', p_booking.id, 'link_id', p_link.id, 'reason', p_reason), p_held_since)
  on conflict (fingerprint) where acknowledged_at is null do nothing;
end;
$$;

revoke execute on function internal.format_rupiah(bigint) from public, anon, authenticated;
