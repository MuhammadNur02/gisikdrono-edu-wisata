-- Follow-ups of the delta3 review of PR #69 and the review of PR #90 (docs/PRD.md §13.1 A16–A20, Task P3.12.02), on
-- the visit terms of 20261104080100 and 20261104080200:
--
--   F-1  apply_adjustment: a manual refund Midtrans made under the adjustment's own key while the visit-terms request
--        was refunded too is applied, with refund_paid_twice_detected, only when Midtrans refunded both; otherwise it
--        is the request's own refund, rejected as already recorded, audited, with no alert.
--   F-2  a weather refund the superadmin makes by hand, only for a visited combo's leg held because the shares cannot
--        fund it (shares_short; a link held for an unset fee is refunded by the sweep itself once the fee is set, #90
--        delta, M-A): a manual_refund proposed with details.weather_link_id (propose_adjustment keeps it, H-A) moves
--        exactly the leg's share less the payment's Midtrans fee (A18), is booked as the leg's weather refund request
--        (A20: the stopped RW's treasury first, then the kelurahan, then the vendors; what is still short the
--        kelurahan bears, A24, M-B), and releases the leg and resolves the link in the same transaction (#90, H-1,
--        M-1, M-2). The sweep leaves a booking alone while any manual_refund of it is open (M-C).
--   F-3  a held link carries its own marker (held_at, held_reason) and its own alert, weather_link_held:<link id>,
--        closed when the link is resolved (#90, L-3).
--   F-4  an answer without a transaction_status never fails a refund request.
--   F-5  resolve_weather_link resolves only a link the sweep actually held, and only as no_refund.
--   The hub tells the visitor to call the kelurahan while the weather fee is unset (WEATHER_FEE_UNSET).
--   Final delta review of PR #90: a later ordinary refund draws only from the parties that still hold a positive share
--   (reverse_revenue_share, D-M1); a link the sweep skips for an open manual refund asks the superadmin to apply or
--   withdraw it (D-L1); a link whose payment was already partly refunded is held as payment_refunded (D-L2);
--   kelurahan_shortfall is readable and written once (D-L3); the backfill hands its other links back to the sweep with
--   their old fee alert closed, and is dropped once it has run (D-L4).

-- ===== F-3: the held marker =====

alter table public.weather_notice_bookings
  add column held_at timestamptz,
  add column held_reason text check (held_reason in ('fee_unset', 'shares_short', 'payment_refunded')),
  add constraint weather_notice_bookings_held_ok check ((held_at is null) = (held_reason is null));
comment on column public.weather_notice_bookings.held_at is
  'When the weather sweep first held the link for the superadmin (an unset Midtrans fee, a leg the shares cannot fund, or a payment already partly refunded); never cleared';
grant select (held_at, held_reason) on public.weather_notice_bookings to authenticated;
drop trigger guard_status_writes on public.weather_notice_bookings;
create trigger guard_status_writes before update on public.weather_notice_bookings
  for each row execute function internal.guard_status_writes('moves_used', 'resolution', 'open_until', 'held_at',
                                                             'held_reason');

-- A24 (owner decision of 2026-10-27, delta review of PR #90, M-B): what the kelurahan bore beyond its own share of a
-- leg's weather refund the shares could not fund.
alter table public.refund_requests
  add column kelurahan_shortfall bigint not null default 0 check (kelurahan_shortfall >= 0);
-- D-L3: the finance screens read it beside the request's other parts.
grant select (kelurahan_shortfall) on public.refund_requests to authenticated;

-- Replaces the 20261104080100 version (D-L3): kelurahan_shortfall is written once, by reverse_leg_share as the
-- request is booked, and never changes after. Everything else is unchanged.
create or replace function internal.refund_requests_immutable_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'refund requests are never deleted' using errcode = '42501';
  end if;
  if (new.booking_id, new.payment_id, new.booking_leg_id, new.kind, new.method, new.refund_key, new.amount,
      new.package_refund, new.addon_refund, new.fee_amount, new.refund_pct, new.days_before, new.requested_by,
      new.requested_at)
     is distinct from
     (old.booking_id, old.payment_id, old.booking_leg_id, old.kind, old.method, old.refund_key, old.amount,
      old.package_refund, old.addon_refund, old.fee_amount, old.refund_pct, old.days_before, old.requested_by,
      old.requested_at)
     or (old.kelurahan_shortfall <> 0 and new.kelurahan_shortfall is distinct from old.kelurahan_shortfall) then
    raise exception 'a refund request keeps what it was written with' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- The sweep holds a link once: the marker, and a high alert of its own that asks the superadmin, whatever became of
-- an earlier alert about the booking. A later run that finds another reason marks it and asks again (#90 delta, L-2);
-- otherwise it leaves both as they are. p_held_since dates a hold the backfill below finds.
create function internal.hold_weather_link(p_link public.weather_notice_bookings, p_booking public.bookings,
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
            when 'payment_refunded' then 'Waktu pilih cuaca habis, pembayaran sudah dikembalikan sebagian: '
                 || p_booking.booking_code || '. Periksa pengembalian dana yang sudah berjalan, lalu tutup tautan cuaca '
                 || 'ini sebagai tanpa pengembalian dana atau kirim sisanya lewat penyesuaian pengembalian dana manual.'
            else 'Waktu pilih cuaca habis, bagi hasil tidak cukup untuk pengembalian dana cuaca: ' || p_booking.booking_code
                 || '. Kirim pengembalian dana lewat penyesuaian pengembalian dana manual yang menyebut tautan cuaca ini.'
          end,
          jsonb_build_object('booking_id', p_booking.id, 'link_id', p_link.id, 'reason', p_reason), p_held_since)
  on conflict (fingerprint) where acknowledged_at is null do nothing;
end;
$$;

-- Review of PR #90, L-3: a held link's alert closes when the link is resolved, by the superadmin who resolved it or,
-- for the sweep's own refund, with nobody's name; so does its waiting alert (D-L1).
create function internal.close_weather_link_alert(p_link_id uuid, p_actor_id uuid) returns void
  language sql
  set search_path = ''
as $$
  update public.security_alerts
  set acknowledged_by = p_actor_id, acknowledged_at = coalesce(acknowledged_at, now()),
      details = details || jsonb_build_object('closed', 'link_resolved')
  where fingerprint in ('weather_link_held:' || p_link_id, 'weather_link_waiting_adjustment:' || p_link_id)
    and acknowledged_at is null;
$$;

-- D-L1: a lapsed link the sweep leaves alone because a manual refund of its booking is open asks the superadmin, once
-- while it waits, to apply or withdraw that adjustment, named by its amount, its day and its id.
create function internal.flag_weather_link_waiting(p_link public.weather_notice_bookings) returns void
  language sql
  set search_path = ''
as $$
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  select 'weather_link_waiting_adjustment', 'medium', 'weather_link_waiting_adjustment:' || p_link.id,
         'Waktu pilih cuaca habis untuk ' || b.booking_code || ', tetapi penyesuaian pengembalian dana manual Rp '
           || a.amount || ' yang diajukan ' || to_char(a.proposed_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY')
           || ' (' || a.id || ') masih terbuka: terapkan atau tarik penyesuaian ini.',
         jsonb_build_object('booking_id', b.id, 'link_id', p_link.id, 'adjustment_id', a.id)
  from public.bookings b
  cross join lateral (select a.id, a.amount, a.proposed_at from public.payment_adjustments a
                      where a.booking_id = b.id and a.type = 'manual_refund' and a.status in ('proposed', 'approved')
                      order by a.proposed_at, a.id limit 1) as a
  where b.id = p_link.booking_id
  on conflict (fingerprint) where acknowledged_at is null do nothing;
$$;

-- The adjustment is applied or withdrawn: the sweep takes the link again, and its waiting alert closes.
create function internal.close_weather_link_waiting(p_link_id uuid) returns void
  language sql
  set search_path = ''
as $$
  update public.security_alerts
  set acknowledged_at = now(), details = details || jsonb_build_object('closed', 'adjustment_closed')
  where fingerprint = 'weather_link_waiting_adjustment:' || p_link_id and acknowledged_at is null;
$$;

-- D-L2: the booking has no settled payment because one was already partly refunded, so no weather refund may be worked
-- out from it: the link is the superadmin's, never an unset fee's.
create function internal.has_partially_refunded_payment(p_booking_id uuid) returns boolean
  language sql stable
  set search_path = ''
as $$
  select (internal.settled_payment_of(p_booking_id)).id is null
     and exists (select 1 from public.payments p where p.booking_id = p_booking_id and p.status = 'partially_refunded');
$$;

-- L-3 (and the delta reviews of PR #90, L-c, L-3): the links the sweep held before this migration, told by the alerts
-- it raised for them then, are marked once from what holds them now: a visited combo's leg the shares still cannot
-- fund (shares_short), else a payment whose Midtrans fee is still unset (fee_unset); any other is left for the sweep.
-- The hold is dated by the first of the old alerts and gets its own alert; the old weather alerts are closed in its
-- favour (the hub's cancellation_needs_superadmin only where the old sweep raised it for the leg, shares_short).
create function internal.backfill_weather_holds() returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  previous_settings jsonb := internal.push_settings('{"app.in_rpc": "1", "app.actor_role": "cron"}');
  link public.weather_notice_bookings;
  booking public.bookings;
  leg public.booking_legs;
  payment public.payments;
  reason text;
  marked integer := 0;
begin
  for link in
    select w.* from public.weather_notice_bookings w
    where w.resolved_at is null and w.open_until <= now() and w.held_at is null
      and exists (select 1 from public.security_alerts a
                  where a.fingerprint in ('weather_refund_fee_unset:' || w.booking_id,
                                          'cancellation_needs_superadmin:' || w.booking_id))
  loop
    select * into booking from public.bookings b where b.id = link.booking_id;
    select * into leg from public.booking_legs l where l.id = link.booking_leg_id;
    payment := internal.settled_payment_of(booking.id);
    reason := case
      when booking.status = 'checked_in' and leg.status = 'reserved' and internal.leg_pool_short(booking, leg)
        then 'shares_short'
      when payment.id is not null and internal.midtrans_fee_of(payment.method, payment.gross_amount) is null
        then 'fee_unset'
    end;
    -- D-L4: a link handed back to the sweep takes its old fee alert with it; the sweep raises its own if it holds it.
    if reason is null then
      update public.security_alerts
      set acknowledged_at = now(), details = details || jsonb_build_object('closed', 'handed_back_to_sweep')
      where acknowledged_at is null and fingerprint = 'weather_refund_fee_unset:' || link.booking_id;
      continue;
    end if;
    perform internal.hold_weather_link(link, booking, reason,
      (select min(a.first_seen_at) from public.security_alerts a
       where a.fingerprint in ('weather_refund_fee_unset:' || link.booking_id,
                               'cancellation_needs_superadmin:' || link.booking_id)));
    update public.security_alerts
    set acknowledged_at = now(), details = details || jsonb_build_object('closed', 'replaced_by_weather_link_held')
    where acknowledged_at is null
      and (fingerprint = 'weather_refund_fee_unset:' || link.booking_id
           or (reason = 'shares_short' and fingerprint = 'cancellation_needs_superadmin:' || link.booking_id));
    marked := marked + 1;
  end loop;
  perform internal.restore_settings(previous_settings);
  return marked;
end;
$$;
select internal.backfill_weather_holds();

-- ===== The hub: the weather fee unset is the superadmin's =====

-- Replaces the 20261104080200 version: the unset fee is named by its own hint, so the hub says to call the kelurahan
-- instead of promising a refund by itself. Everything else is unchanged.
create or replace function internal.weather_quote(p_payment public.payments, p_days_before integer,
  p_base bigint default null) returns jsonb
  language plpgsql stable
  set search_path = ''
as $$
declare
  fee bigint := internal.midtrans_fee_of(p_payment.method, p_payment.gross_amount);
  base bigint := coalesce(p_base, p_payment.gross_amount);
begin
  if fee is null then
    raise exception 'the Midtrans fee of % payments is not set', p_payment.method
      using errcode = 'P0001', hint = 'WEATHER_FEE_UNSET';
  end if;
  return jsonb_build_object('kind', 'weather', 'days_before', p_days_before, 'refund_pct', null,
    'package_refund', 0, 'addon_refund', 0, 'fee_amount', least(fee, base),
    'amount', greatest(base - fee, 0), 'retained', 0, 'paid', p_payment.gross_amount,
    'method', p_payment.method, 'payment_id', p_payment.id, 'order_id', p_payment.order_id);
end;
$$;


-- ===== F-3: the sweep =====

-- Whether a manual refund of the booking is open (proposed or approved), named after a weather link or not: the
-- sweep then pays nothing, or the visitor could be paid twice (delta review of PR #90, M-A, M-C).
create function internal.has_open_manual_refund(p_booking_id uuid) returns boolean
  language sql stable
  set search_path = ''
as $$
  select exists (select 1 from public.payment_adjustments a
                 where a.booking_id = p_booking_id and a.type = 'manual_refund'
                   and a.status in ('proposed', 'approved'));
$$;

-- Replaces the 20261104080200 version: a link it cannot settle is held through hold_weather_link (F-3) and goes to
-- the back of the queue by that marker; a link it settles closes its alert, a link resolved meanwhile is left as it
-- is, and a booking with an open manual refund is left alone, all checked again under the booking's lock (#90, L-1,
-- L-3; delta M-C, L-1). A link left alone for an open manual refund asks the superadmin to apply or withdraw it (final
-- delta D-L1), and a booking whose payment was already partly refunded is held as payment_refunded, never as an unset
-- fee (D-L2). Everything else is unchanged.
create or replace function internal.settle_lapsed_weather_links(p_limit integer) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  due public.weather_notice_bookings;
  booking public.bookings;
  payment public.payments;
  quote jsonb;
  counts jsonb := '{"auto_refunded": 0, "kept": 0, "cancelled": 0, "held": 0}';
  outcome text;
begin
  perform internal.require_server_caller('settle_lapsed_weather_links');
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings('{"app.in_rpc": "1", "app.actor_role": "cron"}');
  for due in
    select w.* from public.weather_notice_bookings w
    where w.resolved_at is null and w.open_until <= now() and internal.has_open_manual_refund(w.booking_id)
  loop
    perform internal.flag_weather_link_waiting(due);
  end loop;
  for due in
    select w.* from public.weather_notice_bookings w
    where w.resolved_at is null and w.open_until <= now()
      and not internal.has_open_manual_refund(w.booking_id)
    order by w.held_at is not null, w.open_until
    limit least(greatest(p_limit, 1), 50)
  loop
    select * into booking from public.bookings b where b.id = due.booking_id for update;
    -- L-1: read again under the booking's lock, which a manual refund takes too.
    select * into due from public.weather_notice_bookings w where w.id = due.id for update;
    if due.resolved_at is not null then
      continue;
    end if;
    if internal.has_open_manual_refund(booking.id) then
      perform internal.flag_weather_link_waiting(due);
      continue;
    end if;
    perform internal.close_weather_link_waiting(due.id);
    -- A20: a checked_in booking whose stopped leg is still to visit gets that leg's weather refund. A paid booking
    -- never reaches no_show or completed with its window open: close_past_bookings waits for this sweep.
    if booking.status = 'checked_in' and not booking.needs_review and due.moves_used = 0
       and exists (select 1 from public.booking_legs l where l.id = due.booking_leg_id and l.status = 'reserved') then
      payment := internal.settled_payment_of(booking.id);
      if internal.has_partially_refunded_payment(booking.id) then
        perform internal.hold_weather_link(due, booking, 'payment_refunded');
        counts := jsonb_set(counts, '{held}', to_jsonb((counts ->> 'held')::integer + 1));
        continue;
      end if;
      if internal.leg_pool_short(booking, (select l from public.booking_legs l where l.id = due.booking_leg_id)) then
        perform internal.hold_weather_link(due, booking, 'shares_short');
        counts := jsonb_set(counts, '{held}', to_jsonb((counts ->> 'held')::integer + 1));
        continue;
      end if;
      begin
        quote := internal.weather_quote(payment, null, internal.leg_share(booking, due.booking_leg_id))
          || jsonb_build_object('leg_id', due.booking_leg_id);
      exception when sqlstate 'P0001' then
        quote := null;
      end;
      if quote is null then
        perform internal.hold_weather_link(due, booking, 'fee_unset');
        counts := jsonb_set(counts, '{held}', to_jsonb((counts ->> 'held')::integer + 1));
        continue;
      end if;
      perform internal.refund_weather_leg(booking, null, quote, 'cron');
      perform internal.close_weather_link_alert(due.id, null);
      counts := jsonb_set(counts, '{auto_refunded}', to_jsonb((counts ->> 'auto_refunded')::integer + 1));
      continue;
    end if;
    if booking.status not in ('paid', 'checked_in') or booking.needs_review then
      outcome := 'cancelled';
    elsif booking.status = 'checked_in' then
      outcome := 'kept';
    elsif due.moves_used > 0 then
      outcome := 'kept';
    else
      payment := internal.settled_payment_of(booking.id);
      if internal.has_partially_refunded_payment(booking.id) then
        perform internal.hold_weather_link(due, booking, 'payment_refunded');
        counts := jsonb_set(counts, '{held}', to_jsonb((counts ->> 'held')::integer + 1));
        continue;
      end if;
      begin
        quote := internal.weather_quote(payment, booking.visit_date - public.today_jkt());
      exception when sqlstate 'P0001' then
        quote := null;
      end;
      if quote is null then
        perform internal.hold_weather_link(due, booking, 'fee_unset');
        counts := jsonb_set(counts, '{held}', to_jsonb((counts ->> 'held')::integer + 1));
        continue;
      end if;
      perform internal.cancel_paid_booking(booking, null, 'Waktu memilih jadwal cuaca habis', 'weather', quote, 'cron');
      perform internal.close_weather_link_alert(due.id, null);
      perform internal.enqueue_notification(booking.id, 'booking_cancelled', 'whatsapp', '{}');
      perform internal.enqueue_notification(booking.id, 'booking_cancelled', 'email', '{}');
      insert into public.security_alerts (rule, severity, fingerprint, title, details)
      values ('weather_auto_refund', 'high', 'weather_auto_refund:' || booking.id,
              'Pengembalian dana cuaca otomatis: ' || booking.booking_code,
              jsonb_build_object('booking_id', booking.id, 'amount', quote -> 'amount', 'method', payment.method))
      on conflict (fingerprint) where acknowledged_at is null do nothing;
      counts := jsonb_set(counts, '{auto_refunded}', to_jsonb((counts ->> 'auto_refunded')::integer + 1));
      continue;
    end if;
    update public.weather_notice_bookings set resolution = outcome, resolved_at = now()
    where id = due.id and resolved_at is null;
    perform internal.close_weather_link_alert(due.id, null);
    counts := jsonb_set(counts, array[outcome], to_jsonb((counts ->> outcome)::integer + 1));
  end loop;
  perform internal.restore_settings(previous_settings);
  return counts;
end;
$$;


-- ===== F-4: an answer without a transaction status =====

-- Replaces the 20261104080200 version: a missing transaction_status is not one of the statuses a failure may rest
-- on. Everything else is unchanged.
create or replace function internal.look_shows_refund_unpaid(p_request public.refund_requests) returns boolean
  language plpgsql stable
  set search_path = ''
as $$
declare
  answer public.payment_events;
  payment public.payments;
  answer_total bigint;
begin
  select * into payment from public.payments p where p.id = p_request.payment_id;
  select * into answer from public.payment_events e
  where e.id = p_request.last_checked_event_id and e.order_id = payment.order_id and e.source in ('status_api', 'poll');
  if answer.id is null or answer.status_code is distinct from '200'
     or coalesce(answer.transaction_status, '') not in ('settlement', 'capture', 'partial_refund', 'refund')
     or internal.midtrans_refunded(payment) > internal.midtrans_recorded(payment) then
    return false;
  end if;
  if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(answer.payload -> 'refunds') = 'array'
                                                     then answer.payload -> 'refunds' else '[]'::jsonb end) as x(refund)
             where x.refund ->> 'refund_key' = p_request.refund_key) then
    return false;
  end if;
  answer_total := case
    when answer.transaction_status = 'refund' then payment.gross_amount
    else greatest(coalesce(internal.midtrans_refund_total(answer.payload), 0),
                  coalesce(internal.midtrans_refund_total(answer.payload - 'refunds'), 0)) end;
  return answer_total <= internal.midtrans_recorded(payment);
end;
$$;


-- ===== F-2: a weather refund made by hand (review of PR #90, H-1, M-1, M-2) =====

-- The held link a manual_refund names in details.weather_link_id (any case): a visited combo's stopped leg, held
-- because the shares cannot fund it (shares_short) and still short now (#90 delta, L-2), on the booking's settled
-- payment (the one settled_payment_of gives, so never a duplicate or disputed one). A link held for an unset fee is
-- refused with WEATHER_FEE_UNSET_MANUAL: the sweep refunds it once the fee is set. An adjustment that names no link is no weather
-- refund (null); one that names a link it may not refund is refused, so a weather refund is never booked by mistake
-- as an ordinary one or the other way round.
create function internal.named_weather_link(p_booking_id uuid, p_payment_id uuid, p_details jsonb)
  returns public.weather_notice_bookings
  language plpgsql stable
  set search_path = ''
as $$
declare
  named text := lower(btrim(coalesce(p_details ->> 'weather_link_id', '')));
  link public.weather_notice_bookings;
  booking public.bookings;
begin
  if named = '' then
    return null;
  end if;
  if named !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'details.weather_link_id names a weather link by its id' using errcode = '22023';
  end if;
  select w.* into link from public.weather_notice_bookings w
  where w.id = named::uuid and w.booking_id = p_booking_id and w.resolved_at is null and w.held_at is not null
    and p_payment_id = (internal.settled_payment_of(p_booking_id)).id;
  if link.id is null then
    raise exception 'weather link % is not held on the booking''s settled payment', named
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  -- M-A: a link held for an unset fee is refunded by the sweep once the fee is set; a transfer by hand would pay twice.
  if link.held_reason = 'fee_unset' then
    raise exception 'set the Midtrans fee: the sweep refunds weather link % itself; do not transfer by hand', named
      using errcode = 'P0001', hint = 'WEATHER_FEE_UNSET_MANUAL';
  end if;
  select * into booking from public.bookings b where b.id = p_booking_id;
  if booking.status <> 'checked_in'
     or not internal.leg_pool_short(booking, (select l from public.booking_legs l where l.id = link.booking_leg_id)) then
    raise exception 'weather link % is no longer one the shares cannot fund', named
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return link;
end;
$$;

-- What a held leg's weather refund is (A18, A20): the stopped leg's share; the Midtrans fee of that payment, which the
-- visitor bears (WEATHER_FEE_UNSET while it is not set); and the refund, the share less that fee, all of it or nothing.
create function internal.held_weather_terms(p_booking public.bookings, p_link public.weather_notice_bookings,
  p_payment public.payments) returns jsonb
  language plpgsql stable
  set search_path = ''
as $$
declare
  fee bigint := internal.midtrans_fee_of(p_payment.method, p_payment.gross_amount);
  share bigint;
begin
  -- The delta review of PR #90, L-a: only a booking the sweep itself would refund the leg of: checked_in, not under
  -- review, its link never moved, its stopped leg still to visit.
  if p_booking.status <> 'checked_in' or p_booking.needs_review or p_link.moves_used <> 0
     or not exists (select 1 from public.booking_legs l where l.id = p_link.booking_leg_id and l.status = 'reserved') then
    raise exception 'booking % has no weather refund for this link', p_booking.id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if fee is null then
    raise exception 'the Midtrans fee of % payments is not set', p_payment.method
      using errcode = 'P0001', hint = 'WEATHER_FEE_UNSET';
  end if;
  share := internal.leg_share(p_booking, p_link.booking_leg_id);
  return jsonb_build_object('share', share, 'fee_amount', least(fee, share), 'amount', greatest(share - fee, 0));
end;
$$;

-- A manual weather refund moves exactly the refund held_weather_terms names (REFUND_REQUEST_MISMATCH otherwise).
create function internal.check_held_weather_amount(p_booking_id uuid, p_link public.weather_notice_bookings,
  p_payment_id uuid, p_amount bigint) returns jsonb
  language plpgsql stable
  set search_path = ''
as $$
declare
  terms jsonb := internal.held_weather_terms((select b from public.bookings b where b.id = p_booking_id), p_link,
                                             (select p from public.payments p where p.id = p_payment_id));
begin
  if p_amount <> (terms ->> 'amount')::bigint then
    raise exception 'the weather refund of this link is %, not %', terms ->> 'amount', p_amount
      using errcode = 'P0001', hint = 'REFUND_REQUEST_MISMATCH';
  end if;
  return terms;
end;
$$;

-- M-1, M-2: the manual_refund naming a held link, booked and closed in one transaction, as the sweep's weather refund
-- would have been. Under the booking's lock the link and the payment's open requests are read again (L-1); the
-- refund is a weather refund request (fee_amount the payment's Midtrans fee, so recap_invariant's
-- weather_refund_fees holds), booked by book_refund_request, which reverses the stopped leg's lines as A20 and A24 say
-- (reverse_leg_share: the visited RW never drawn, the kelurahan bearing what the others cannot). A refund Midtrans
-- made under the adjustment's own id is booked under its word (L-2). Then the leg is released
-- (close_held_weather_booking) and the link resolved as refunded_manually, so no second weather refund can name it.
create function internal.record_weather_manual_refund(p_adjustment public.payment_adjustments,
  p_link public.weather_notice_bookings) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  booking public.bookings;
  link public.weather_notice_bookings;
  payment public.payments;
  request public.refund_requests;
  terms jsonb;
  is_reported boolean;
  next_refund integer;
begin
  select * into booking from public.bookings b where b.id = p_adjustment.booking_id for update;
  select * into link from public.weather_notice_bookings w where w.id = p_link.id for update;
  payment := internal.settled_payment_of(booking.id);
  if link.resolved_at is not null or link.held_at is null or payment.id is distinct from p_adjustment.payment_id
     or exists (select 1 from public.refund_requests r
                where r.payment_id = payment.id and r.status in ('requested', 'submitted', 'failed')) then
    raise exception 'weather link % is no longer held on the booking''s settled payment', p_link.id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  terms := internal.check_held_weather_amount(booking.id, link, payment.id, p_adjustment.amount);
  perform internal.require_unused_proof(booking.id, p_adjustment.evidence_path, p_adjustment.id);
  is_reported := internal.midtrans_refunded_under_key(payment.id, p_adjustment.id::text, p_adjustment.amount);
  if is_reported and internal.midtrans_refunded(payment) < internal.midtrans_recorded(payment) + p_adjustment.amount then
    raise exception 'Midtrans reports no refund of % on order %',
      internal.midtrans_recorded(payment) + p_adjustment.amount, payment.order_id
      using errcode = 'P0001', hint = 'REFUND_NOT_AT_MIDTRANS';
  end if;
  select count(*) + 1 into next_refund from public.refund_requests r where r.payment_id = payment.id;
  insert into public.refund_requests (booking_id, payment_id, booking_leg_id, kind, method, refund_key, amount,
    fee_amount, requested_by)
  values (booking.id, payment.id, link.booking_leg_id, 'weather',
          payment.method, payment.order_id || '-R' || lpad(next_refund::text, 2, '0'), p_adjustment.amount,
          (terms ->> 'fee_amount')::bigint, auth.uid())
  returning * into request;
  perform internal.book_refund_request(request,
    case when payment.refunded_amount + p_adjustment.amount >= payment.gross_amount then 'refunded'
         else 'partially_refunded' end::public.payment_status,
    payment.refunded_amount + p_adjustment.amount, is_reported, 'adjustment:' || p_adjustment.id, auth.uid());
  perform internal.close_held_weather_booking(booking, link, p_adjustment.id, auth.uid());
  update public.weather_notice_bookings set resolution = 'refunded_manually', resolved_at = now() where id = link.id;
  perform internal.close_weather_link_alert(link.id, auth.uid());
end;
$$;

-- Replaces the 20261104080200 version (F-2, H-1): a manual refund that names a held weather link gives back exactly
-- that link's weather refund, checked when it is proposed and again when it is applied. Everything else is unchanged.
create or replace function internal.check_adjustment_terms(p_type public.adjustment_type, p_booking_id uuid,
  p_payment_id uuid, p_amount bigint, p_details jsonb) returns void
  language plpgsql stable
  set search_path = ''
as $$
declare
  payment public.payments;
  link public.weather_notice_bookings;
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
  elsif p_type <> 'write_off' then
    raise exception 'a % adjustment is not proposed here', p_type
      using errcode = 'P0001', hint = 'ADJUSTMENT_TYPE_UNSUPPORTED';
  end if;
end;
$$;


-- ===== F-1: a refund under the adjustment's own key next to the request's =====

-- F-1: a manual refund Midtrans made under the adjustment's own id while it also booked the visit-terms request R:
-- when Midtrans does not report both, that refund is R itself, already recorded, so the adjustment is rejected and
-- audited, with no alert.
create function internal.reject_recorded_refund(p_adjustment public.payment_adjustments,
  p_request public.refund_requests) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  adjustment public.payment_adjustments;
  previous_settings jsonb;
begin
  previous_settings := internal.push_settings('{"app.in_rpc": "1"}');
  update public.payment_adjustments
  set status = 'rejected',
      rejected_reason = 'Pengembalian dana ini sudah tercatat sebagai ' || p_request.refund_key
  where id = p_adjustment.id
  returning * into adjustment;
  perform internal.log_audit('adjustment.rejected', 'payment_adjustments', adjustment.id::text,
    jsonb_build_object('reason', 'already_recorded', 'refund_key', p_request.refund_key));
  perform internal.restore_settings(previous_settings);
  return to_jsonb(adjustment);
end;
$$;

-- Replaces the 20261104080200 version (F-1, F-2): next to a visit-terms request Midtrans refunded meanwhile, a refund
-- made under the adjustment's own key is applied only when Midtrans reports both, still raising
-- refund_paid_twice_detected, and is otherwise rejected as already recorded; a manual refund that names a held
-- weather link is booked as that link's weather refund, which closes the booking and the link
-- (record_weather_manual_refund). Everything else is unchanged.
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
  return to_jsonb(adjustment);
end;
$$;


-- ===== F-2, F-5: closing a held link =====

-- What the weather refund of a held leg does to its booking, as the sweep's leg refund would: the stopped leg is
-- released and its ticket revoked; the visited leg and the booking's invoice stand (A20). Only a visited combo's leg
-- is refunded by hand (named_weather_link), so a paid booking never reaches here.
create function internal.close_held_weather_booking(p_booking public.bookings, p_link public.weather_notice_bookings,
  p_adjustment_id uuid, p_actor_id uuid) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  leg public.booking_legs;
begin
  select * into leg from public.booking_legs l where l.id = p_link.booking_leg_id for update;
  update public.visit_sessions set reserved_pax = greatest(reserved_pax - leg.pax_count, 0)
  where id = leg.visit_session_id;
  update public.booking_legs set status = 'released', quota_released_at = now() where id = leg.id;
  update public.tickets_qr
  set status = 'revoked', revoked_at = now(), revoked_by = p_actor_id, revoke_reason = 'weather_refund'
  where booking_leg_id = leg.id and status in ('issued', 'suspended');
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  values (p_booking.id, p_booking.status, p_booking.status, 'admin', p_actor_id, 'weather_refund_leg',
          jsonb_build_object('adjustment_id', p_adjustment_id, 'leg_id', leg.id));
end;
$$;

-- Replaces the 20261104080200 version (F-5; review of PR #90, M-1, M-2, L-1): only a link the sweep held (held_at),
-- and only as no_refund: a weather refund made by hand closes its link itself, when the manual_refund naming it is
-- applied, and a link that has a weather refund request, or whose booking has a manual refund open, is refused
-- (#90 delta, L-4). The booking is locked before the link, the order
-- every writer keeps. Superadmin at AAL2 with a fresh code and a reason, audited.
create or replace function public.resolve_weather_link(p_link_id uuid, p_outcome text, p_reason text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  link public.weather_notice_bookings;
  previous_settings jsonb;
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'only a superadmin resolves a held weather link' using errcode = '42501';
  end if;
  if not public.fresh_totp() then
    raise exception 'confirm with a fresh authenticator code first' using errcode = '42501', hint = 'FRESH_TOTP';
  end if;
  if p_outcome is distinct from 'no_refund' then
    raise exception 'a held weather link is resolved here as no_refund; a refund by hand closes it when applied'
      using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 300 then
    raise exception 'say why in 10 to 300 characters' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  perform 1 from public.bookings b
  where b.id = (select w.booking_id from public.weather_notice_bookings w where w.id = p_link_id)
  for update;
  select * into link from public.weather_notice_bookings w where w.id = p_link_id for update;
  if link.id is null then
    raise exception 'weather link % does not exist', p_link_id using errcode = 'P0002';
  end if;
  if link.resolved_at is not null or link.held_at is null or internal.has_open_manual_refund(link.booking_id)
     or exists (select 1 from public.refund_requests r
                where r.booking_id = link.booking_id and r.kind = 'weather'
                  and (r.booking_leg_id is null or r.booking_leg_id = link.booking_leg_id)) then
    raise exception 'weather link % is not one the sweep holds', p_link_id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || internal.document_actor(auth.uid()));
  update public.weather_notice_bookings set resolution = 'no_refund', resolved_at = now() where id = link.id
  returning * into link;
  perform internal.close_weather_link_alert(link.id, auth.uid());
  perform internal.log_audit('weather_link.resolved', 'weather_notice_bookings', link.id::text,
    jsonb_build_object('booking_id', link.booking_id, 'outcome', 'no_refund', 'reason', left(btrim(p_reason), 300)));
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('result', 'resolved', 'link_id', link.id, 'resolution', link.resolution);
end;
$$;


-- ===== H-A: propose_adjustment keeps the weather link a manual refund names =====

-- Replaces the 20261101130200 version (delta review of PR #90, H-A): a manual_refund keeps details.weather_link_id,
-- lower-cased, and nothing else of p_details; check_adjustment_terms then validates the link (named_weather_link: the
-- booking's own, unresolved, held, shares_short and still short) before the row is written. Everything else is
-- unchanged.
create or replace function public.propose_adjustment(p_type public.adjustment_type, p_booking_id uuid, p_payment_id uuid,
  p_amount bigint, p_reason text, p_evidence_path text, p_details jsonb default '{}') returns jsonb
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

-- ===== M-B: the kelurahan bears what the shares cannot give back (A24) =====

-- Replaces the 20261104080200 version (A20, A24, owner decision of 2026-10-27, delta review of PR #90, M-B): the
-- reversal of one leg's weather refund is still exactly its share (leg_share), and the visited RW's treasury still
-- gives back nothing. The leg's package part comes back from the stopped RW's treasury first, then the kelurahan,
-- then the package's vendor lines pro rata to what each still holds, by largest remainder; what is still short the
-- kelurahan bears, a reversal beyond its own share of the booking, recorded on the refund request
-- (kelurahan_shortfall) and raised as the medium weather_shortfall_kelurahan alert. The ledger then always balances
-- with the refund, so recap_invariant holds. The stopped RW's add-on lines come back whole (D-7). One set of reversal
-- rows per refund reference.
create or replace function internal.reverse_leg_share(p_booking_id uuid, p_leg_id uuid, p_reference text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  booking public.bookings;
  leg public.booking_legs;
  package_part bigint;
  still_owed bigint;
  keeper record;
  taken bigint;
  back_ids bigint[] := '{}';
  back_amounts bigint[] := '{}';
  vendor_ids bigint[];
  vendor_held numeric[];
  vendor_total bigint;
  vendor_part bigint;
  shortfall bigint := 0;
  kelurahan_row bigint;
  kelurahan_at integer;
  written bigint;
begin
  if exists (select 1 from public.revenue_share_entries e
             where e.booking_id = p_booking_id and e.entry_type = 'reversal'
               and e.rule_version ->> 'refund_reference' = p_reference) then
    return jsonb_build_object('result', 'already_reversed');
  end if;
  select * into booking from public.bookings b where b.id = p_booking_id;
  select * into leg from public.booking_legs l where l.id = p_leg_id and l.booking_id = p_booking_id;
  if leg.id is null then
    raise exception 'leg % is not one of booking %', p_leg_id, p_booking_id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  package_part := internal.leg_package_part(booking, p_leg_id);

  create temporary table leg_held on commit drop as
  select s.id, s.line_ref, s.beneficiary, s.rw_id, s.booking_addon_id,
         greatest(s.amount + coalesce((select sum(r.amount) from public.revenue_share_entries r
                                       where r.booking_id = s.booking_id and r.entry_type in ('reversal', 'adjustment')
                                         and r.line_ref = s.line_ref and r.beneficiary_key = s.beneficiary_key), 0),
                  0) as remaining
  from public.revenue_share_entries s
  where s.booking_id = p_booking_id and s.entry_type = 'settlement';

  still_owed := package_part;
  for keeper in
    select h.id, h.remaining from leg_held h
    where h.line_ref = 'package'
      and (h.beneficiary = 'kelurahan' or (h.beneficiary = 'rw_treasury' and h.rw_id = leg.rw_id))
    order by h.beneficiary = 'kelurahan', h.id
  loop
    taken := least(keeper.remaining, still_owed);
    if taken > 0 then
      back_ids := back_ids || keeper.id;
      back_amounts := back_amounts || taken;
      still_owed := still_owed - taken;
    end if;
  end loop;
  if still_owed > 0 then
    select array_agg(h.id order by h.id), array_agg(h.remaining::numeric order by h.id),
           coalesce(sum(h.remaining), 0)
      into vendor_ids, vendor_held, vendor_total
    from leg_held h where h.line_ref = 'package' and h.beneficiary = 'umkm_vendor';
    vendor_part := least(coalesce(vendor_total, 0), still_owed);
    if vendor_part > 0 then
      back_ids := back_ids || vendor_ids;
      back_amounts := back_amounts || internal.largest_remainder_split(vendor_part, vendor_held);
      still_owed := still_owed - vendor_part;
    end if;
  end if;
  -- A24: what is still short comes out of the kelurahan's own package line, below what it holds of the booking.
  if still_owed > 0 then
    kelurahan_row := (select h.id from leg_held h where h.line_ref = 'package' and h.beneficiary = 'kelurahan'
                      order by h.id limit 1);
    if kelurahan_row is null then
      drop table leg_held;
      raise exception 'booking % has no kelurahan share to bear the % its leg refunds beyond the others', p_booking_id,
        still_owed using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
    shortfall := still_owed;
    kelurahan_at := array_position(back_ids, kelurahan_row);
    if kelurahan_at is null then
      back_ids := back_ids || kelurahan_row;
      back_amounts := back_amounts || shortfall;
    else
      back_amounts[kelurahan_at] := back_amounts[kelurahan_at] + shortfall;
    end if;
  end if;

  insert into public.revenue_share_entries (booking_id, payment_id, entry_type, line_ref, booking_addon_id, rule_id,
    rule_version, beneficiary, beneficiary_key, rw_id, vendor_id, base_amount, pct, amount)
  select s.booking_id, s.payment_id, 'reversal', s.line_ref, s.booking_addon_id, s.rule_id,
         s.rule_version || jsonb_build_object('reason', 'weather_refund_leg', 'refund_reference', p_reference),
         s.beneficiary, s.beneficiary_key, s.rw_id, s.vendor_id, -back.amount, s.pct, -back.amount
  from (
    select part.id, part.amount from unnest(back_ids, back_amounts) as part(id, amount)
    union all
    select h.id, h.remaining from leg_held h
    join public.booking_addons a on a.id = h.booking_addon_id
    where h.line_ref <> 'package' and a.rw_id = leg.rw_id
  ) as back
  join public.revenue_share_entries s on s.id = back.id
  where back.amount > 0
  order by s.id;
  drop table leg_held;

  select coalesce(-sum(e.amount), 0) into written from public.revenue_share_entries e
  where e.booking_id = p_booking_id and e.entry_type = 'reversal' and e.rule_version ->> 'refund_reference' = p_reference;
  -- What the ledger gave back is the leg's share the refund was computed from, or the refund is the superadmin's.
  if written <> internal.leg_share(booking, p_leg_id) then
    raise exception 'booking % gave back % for its leg, not the % refunded', p_booking_id, written,
      internal.leg_share(booking, p_leg_id) using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if shortfall > 0 then
    update public.refund_requests set kelurahan_shortfall = shortfall where refund_key = p_reference;
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('weather_shortfall_kelurahan', 'medium', 'weather_shortfall_kelurahan:' || p_reference,
            'Kelurahan menanggung kekurangan bagi hasil pengembalian dana cuaca: ' || booking.booking_code,
            jsonb_build_object('booking_id', p_booking_id, 'refund_key', p_reference, 'shortfall', shortfall))
    on conflict (fingerprint) where acknowledged_at is null do nothing;
  end if;
  return jsonb_build_object('result', 'reversed', 'amount', -written, 'kelurahan_shortfall', shortfall);
end;
$$;

revoke execute on function internal.hold_weather_link(public.weather_notice_bookings, public.bookings, text, timestamptz),
  internal.has_open_manual_refund(uuid), internal.close_weather_link_alert(uuid, uuid),
  internal.flag_weather_link_waiting(public.weather_notice_bookings), internal.close_weather_link_waiting(uuid),
  internal.has_partially_refunded_payment(uuid),
  internal.named_weather_link(uuid, uuid, jsonb),
  internal.held_weather_terms(public.bookings, public.weather_notice_bookings, public.payments),
  internal.check_held_weather_amount(uuid, public.weather_notice_bookings, uuid, bigint),
  internal.record_weather_manual_refund(public.payment_adjustments, public.weather_notice_bookings),
  internal.reject_recorded_refund(public.payment_adjustments, public.refund_requests),
  internal.close_held_weather_booking(public.bookings, public.weather_notice_bookings, uuid, uuid)
  from public, anon, authenticated;


-- ===== D-M1: a later refund after an A24 shortfall =====

-- Replaces the 20261101130200 version (final delta review of PR #90, D-M1): after a weather refund whose shortfall the
-- kelurahan bore (A24), its package row is below zero, and a negative weight refused every later ordinary refund of the booking
-- (22023). The split now weighs each row by what it still holds, never less than zero, so a later refund draws pro rata
-- from the parties that still hold a positive share; the booking's net ledger stays the cap. Everything else is
-- unchanged.
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
  weights numeric[];
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
  -- D-M1: a party below zero (the kelurahan after an A24 shortfall) gives nothing more; the others give pro rata to
  -- what they still hold, and the net ledger above stays the cap.
  weights := array(select greatest(w.amount, 0) from unnest(remaining) with ordinality as w(amount, position)
                   order by w.position);
  parts := internal.largest_remainder_split(p_amount, weights);

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


-- D-L4: the backfill has run over the holds made before this migration; nothing calls it again.
drop function internal.backfill_weather_holds();
