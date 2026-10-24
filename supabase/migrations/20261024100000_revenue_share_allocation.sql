-- Task P3.9.01 (docs/PRD.md §11.2, docs/Security.md §3.8; REC-06, REC-10, REC-14): the revenue-share ledger of a
-- settlement and of a refund. internal.allocate_revenue_share writes one settlement row per beneficiary of each line
-- (the package after its discount, each add-on), split in whole rupiah by internal.revenue_split over the rule in force
-- on the settlement's Jakarta day, so the rows of a payment always add up to its amount. internal.reverse_revenue_share
-- writes the negative rows of a refund in proportion. revenue_share_entries is append-only and hash-chained
-- (ledger_chain, 0004); a rule a row used becomes immutable (revenue_rules_immutable_once_used). Decisions of
-- 2026-10-22 (review of PR #24): the legs come from booking_legs in leg order; pct is for reading only, never summed; a
-- refused split routes the booking to review and never rolls the settlement back (the caller, 20261024100100).


-- ===== Which rule an add-on follows =====

-- docs/PRD.md §11.2: the product's own rule, else the add-on default of the product's RW. As for packages there is no
-- global fallback, and two rules in force for one product on one day are refused rather than picked between.
create function internal.resolve_addon_rule(p_product_id uuid, p_rw_id smallint, p_on date) returns uuid
  language plpgsql stable
  set search_path = ''
as $$
declare
  candidates uuid[];
begin
  candidates := array(
    select r.id from public.revenue_share_rules r
    where r.scope = 'product' and r.product_id = p_product_id and r.is_active
      and r.effective_from <= p_on and (r.effective_to is null or r.effective_to >= p_on));
  if cardinality(candidates) = 0 then
    candidates := array(
      select r.id from public.revenue_share_rules r
      where r.scope = 'addon_default' and r.rw_id = p_rw_id and r.package_id is null and r.product_id is null
        and r.is_active and r.effective_from <= p_on and (r.effective_to is null or r.effective_to >= p_on));
  end if;
  if cardinality(candidates) <> 1 then
    raise exception 'product % has % revenue-share rules in force on %', p_product_id, cardinality(candidates), p_on
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return candidates[1];
end;
$$;

-- What a row says it was split by: the rule and its lines as they stood, so a later version never rewrites history.
create function internal.revenue_rule_version(p_rule_id uuid) returns jsonb
  language sql stable
  set search_path = ''
as $$
  select jsonb_build_object('rule_id', r.id, 'name', r.name, 'scope', r.scope, 'effective_from', r.effective_from,
           'lines', (select coalesce(jsonb_agg(jsonb_build_object('beneficiary', l.beneficiary, 'rw_id', l.rw_id,
                                                                  'vendor_id', l.vendor_id, 'pct', l.pct)
                                               order by l.beneficiary, l.rw_id, l.vendor_id), '[]'::jsonb)
                     from public.revenue_share_rule_lines l where l.rule_id = r.id))
  from public.revenue_share_rules r where r.id = p_rule_id;
$$;

-- One line's settlement rows. A vendor line without a vendor stands for the product's own vendor (rule_line_target_ok).
create function internal.insert_settlement_rows(p_booking_id uuid, p_payment_id uuid, p_line_ref text,
  p_addon_id uuid, p_rule_id uuid, p_base bigint, p_legs smallint[], p_vendor_id uuid) returns bigint
  language plpgsql
  set search_path = ''
as $$
declare
  version jsonb := internal.revenue_rule_version(p_rule_id);
  written bigint;
begin
  -- A package has no vendor of its own to stand in for a vendor line without one.
  if exists (select 1 from internal.revenue_split(p_rule_id, p_base, p_legs) as s
             where s.beneficiary = 'umkm_vendor' and coalesce(s.vendor_id, p_vendor_id) is null) then
    raise exception 'revenue rule % pays a vendor line % has none of', p_rule_id, p_line_ref
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  with parts as (
    select s.beneficiary, s.rw_id, case when s.beneficiary = 'umkm_vendor' then coalesce(s.vendor_id, p_vendor_id) end
             as vendor_id, s.pct, s.amount
    from internal.revenue_split(p_rule_id, p_base, p_legs) as s
    order by s.part_order),
  inserted as (
    insert into public.revenue_share_entries (booking_id, payment_id, entry_type, line_ref, booking_addon_id, rule_id,
      rule_version, beneficiary, beneficiary_key, rw_id, vendor_id, base_amount, pct, amount)
    select p_booking_id, p_payment_id, 'settlement', p_line_ref, p_addon_id, p_rule_id, version, parts.beneficiary,
           case parts.beneficiary when 'kelurahan' then 'kelurahan'
                                  when 'rw_treasury' then 'rw:' || parts.rw_id
                                  else 'vendor:' || parts.vendor_id end,
           case when parts.beneficiary = 'rw_treasury' then parts.rw_id end, parts.vendor_id, p_base, parts.pct,
           parts.amount
    from parts
    returning amount)
  select coalesce(sum(amount), 0) into written from inserted;
  if written <> p_base then
    raise exception 'line % split into % of %', p_line_ref, written, p_base using errcode = 'P0001',
      hint = 'STATE_INVALID';
  end if;
  return written;
end;
$$;


-- ===== internal.allocate_revenue_share =====

-- The settlement rows of a booking's settled payment, written once: a second call finds them and writes nothing, so
-- the poll may run it again for a booking whose rule was missing at settlement. The package line carries the discount
-- (docs/PRD.md §11.2: add-ons are never discounted); a discount larger than the package line, no rule in force, two
-- rules in force or a rule paying an RW the booking does not visit is refused with STATE_INVALID, which the caller turns
-- into a review. The rows of the payment add up to its amount, or nothing is written.
create function internal.allocate_revenue_share(p_booking_id uuid, p_payment_id uuid) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  booking public.bookings;
  payment public.payments;
  rule_day date;
  legs smallint[];
  package_base bigint;
  addon record;
  written bigint := 0;
begin
  if exists (select 1 from public.revenue_share_entries e
             where e.booking_id = p_booking_id and e.entry_type = 'settlement') then
    return jsonb_build_object('result', 'already_allocated');
  end if;
  select * into booking from public.bookings b where b.id = p_booking_id;
  select * into payment from public.payments p where p.id = p_payment_id and p.booking_id = p_booking_id;
  if payment.id is null or payment.status <> 'settled' then
    raise exception 'payment % of booking % is not settled', p_payment_id, p_booking_id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  rule_day := (payment.settlement_time at time zone 'Asia/Jakarta')::date;
  legs := array(select l.rw_id from public.booking_legs l where l.booking_id = p_booking_id order by l.leg_order);
  package_base := booking.subtotal_package - booking.discount_amount;
  if package_base < 0 then
    raise exception 'the discount of booking % is larger than its package line', p_booking_id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  if package_base > 0 then
    written := internal.insert_settlement_rows(p_booking_id, p_payment_id, 'package', null,
      internal.resolve_package_rule(booking.package_id, rule_day), package_base, legs, null);
  end if;
  for addon in
    select a.id, a.product_id, a.rw_id, a.vendor_id, a.line_total from public.booking_addons a
    where a.booking_id = p_booking_id and a.line_total > 0 order by a.created_at, a.id
  loop
    written := written + internal.insert_settlement_rows(p_booking_id, p_payment_id, 'addon:' || addon.id, addon.id,
      internal.resolve_addon_rule(addon.product_id, addon.rw_id, rule_day), addon.line_total, legs, addon.vendor_id);
  end loop;
  if written <> payment.gross_amount then
    raise exception 'the ledger of booking % adds up to %, not %', p_booking_id, written, payment.gross_amount
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return jsonb_build_object('result', 'allocated', 'amount', written);
end;
$$;


-- ===== internal.reverse_revenue_share =====

-- A refund's reversal rows (docs/PRD.md §11.2): each settlement row gives back its share of p_amount, split by largest
-- remainder over the settlement rows in id order, so the negative rows add up to -p_amount exactly. Written by
-- record_refund (Task P4.7.03), in the same transaction as the refund.
create function internal.reverse_revenue_share(p_booking_id uuid, p_amount bigint, p_reason text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  settled public.revenue_share_entries[];
  parts bigint[];
  reversed bigint;
begin
  settled := array(select e from public.revenue_share_entries e
                   where e.booking_id = p_booking_id and e.entry_type = 'settlement' order by e.id);
  reversed := -coalesce((select sum(e.amount) from public.revenue_share_entries e
                         where e.booking_id = p_booking_id and e.entry_type = 'reversal'), 0);
  if cardinality(settled) = 0 then
    raise exception 'booking % has no ledger to reverse', p_booking_id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if p_amount is null or p_amount <= 0
     or p_amount + reversed > (select sum(s.amount) from unnest(settled) as s) then
    raise exception 'booking % cannot give back % more', p_booking_id, p_amount
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  parts := internal.largest_remainder_split(p_amount,
    array(select s.amount::numeric from unnest(settled) with ordinality as s order by s.ordinality));

  insert into public.revenue_share_entries (booking_id, payment_id, entry_type, line_ref, booking_addon_id, rule_id,
    rule_version, beneficiary, beneficiary_key, rw_id, vendor_id, base_amount, pct, amount)
  select s.booking_id, s.payment_id, 'reversal', s.line_ref, s.booking_addon_id, s.rule_id,
         s.rule_version || jsonb_build_object('reason', left(p_reason, 200)), s.beneficiary, s.beneficiary_key,
         s.rw_id, s.vendor_id, -p_amount, s.pct, -parts[s.ordinality]
  from unnest(settled) with ordinality as s
  where parts[s.ordinality] > 0
  order by s.ordinality;
  return jsonb_build_object('result', 'reversed', 'amount', -p_amount);
end;
$$;

revoke execute on function internal.resolve_addon_rule(uuid, smallint, date), internal.revenue_rule_version(uuid),
  internal.insert_settlement_rows(uuid, uuid, text, uuid, uuid, bigint, smallint[], uuid),
  internal.allocate_revenue_share(uuid, uuid), internal.reverse_revenue_share(uuid, bigint, text)
  from public, anon, authenticated;
