-- Decision of 2026-10-29 (product owner; docs/PRD.md §13.1 A29 decision 6, A24 as revised): the RW bears the costs of
-- its own visits and receives the net; the kelurahan, which takes 0 % of ticket revenue since 20261105160000, never
-- tops up. Under the new defaults a combo leg's weather refund whose shares cannot fund it (A24) would otherwise reach
-- the "no kelurahan share to bear" refusal, and book_refund_request would leave the ledger unreversed with the high
-- refund_ledger_unbalanced alert.
--
-- Replaces the 20261104181000 version. Unchanged: the reversal is exactly the stopped leg's share (leg_share); the
-- visited RW's treasury gives back nothing (A20); the leg's package part comes back from the stopped RW's treasury
-- first, then a kelurahan line (only a package rule of its own may still pay one), then the package's vendor lines pro
-- rata to what each still holds, by largest remainder; the stopped RW's add-on lines come back whole; one set of
-- reversal rows per refund reference. Changed: what is still short is borne by the stopped RW's own treasury package
-- line, a reversal beyond what it holds of the booking, so its net for that booking goes negative and later payouts
-- net it under the existing rules (payout_preview, settle_revenue_entries, PAYOUT_NEGATIVE_PENDING). The medium alert
-- is weather_shortfall_rw; refund_requests.kelurahan_shortfall is no longer written and stays 0. A stopped RW with no
-- package line of its own still refuses, for the superadmin to settle.
--
-- The Midtrans fees are not ledger rows, so nothing about them changes here: a weather refund's fee is borne by the
-- visitor (A18) and leaves the ledger through recap_invariant's weather_refund_fees line, and the fee Midtrans keeps
-- on a payment is booked nowhere in the database (A29 decision 6 records it as open).
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
  bearer_row bigint;
  bearer_at integer;
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
  -- A24 as revised (A29 decision 6): what is still short comes out of the stopped RW's own package line, below what it
  -- holds of the booking; the kelurahan never tops up.
  if still_owed > 0 then
    bearer_row := (select h.id from leg_held h
                   where h.line_ref = 'package' and h.beneficiary = 'rw_treasury' and h.rw_id = leg.rw_id
                   order by h.id limit 1);
    if bearer_row is null then
      drop table leg_held;
      raise exception 'booking % has no share of RW % to bear the % its leg refunds beyond the others', p_booking_id,
        leg.rw_id, still_owed using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
    shortfall := still_owed;
    bearer_at := array_position(back_ids, bearer_row);
    if bearer_at is null then
      back_ids := back_ids || bearer_row;
      back_amounts := back_amounts || shortfall;
    else
      back_amounts[bearer_at] := back_amounts[bearer_at] + shortfall;
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
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('weather_shortfall_rw', 'medium', 'weather_shortfall_rw:' || p_reference,
            'Kas RW menanggung kekurangan bagi hasil pengembalian dana cuaca: ' || booking.booking_code,
            jsonb_build_object('booking_id', p_booking_id, 'refund_key', p_reference, 'rw_id', leg.rw_id,
                               'shortfall', shortfall))
    on conflict (fingerprint) where acknowledged_at is null do nothing;
  end if;
  return jsonb_build_object('result', 'reversed', 'amount', -written, 'rw_shortfall', shortfall);
end;
$$;
