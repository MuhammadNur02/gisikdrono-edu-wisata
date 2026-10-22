-- A combo pays any number of RWs (decision of 2026-10-21, taken under CLAUDE.md §12.2; Task P3.9.04). The 0008 combo
-- rule named RW 05 and RW 08 at 40 % each, which no longer fits once a combo may visit any two to four RWs: the
-- kelurahan keeps 20 %, and the other 80 % goes to the RWs of the booking's legs in equal parts. A per-package rule
-- may still say otherwise; there is no global fallback.

-- An rw_treasury line without an RW stands for "the RWs of the booking's legs, in equal parts". It names no vendor,
-- as before; the kelurahan and vendor lines keep their shape.
alter table public.revenue_share_rule_lines
  drop constraint rule_line_target_ok,
  add constraint rule_line_target_ok check (
    (beneficiary = 'kelurahan' and rw_id is null and vendor_id is null) or
    (beneficiary = 'rw_treasury' and vendor_id is null) or            -- rw_id NULL = the booking's leg RWs, equally
    (beneficiary = 'umkm_vendor' and rw_id is null));                 -- vendor_id NULL = "the product's vendor"

-- The 0008 combo rule is closed rather than deleted, as a rule the ledger may have used would have to be (no ledger
-- entry uses it yet). Closing changes only is_active and effective_to, which revenue_rules_immutable_once_used allows.
update public.revenue_share_rules
set is_active = false, effective_to = greatest(effective_from, current_date)
where scope = 'package_default' and rw_id is null and package_id is null and product_id is null and is_active;

with combo_rule as (
  insert into public.revenue_share_rules (scope, rw_id, name)
  values ('package_default', null, 'Bawaan paket kombinasi, rata per RW')
  returning id
)
insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct)
select combo_rule.id, line.beneficiary::public.revenue_beneficiary, null, line.pct
from combo_rule
cross join (values ('kelurahan', 20.00), ('rw_treasury', 80.00)) as line(beneficiary, pct);

-- The shape of a rule with an equal split (proposed defaults Q3, Q4 of PR 4): at most one RW-less rw_treasury line,
-- no fixed rw_treasury line next to it, and only in a package's rules, since "the booking's legs" means nothing to
-- a product of one RW. Checked at commit, like revenue_rule_sum_guard, so a rule can be written line by line.
create function internal.revenue_rule_shape_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  affected_rule uuid;
  rule_scope public.revenue_rule_scope;
  equal_lines integer;
  fixed_lines integer;
begin
  -- The trigger fires on a rule's lines and on a change of the rule's scope.
  if tg_table_name = 'revenue_share_rules' then
    affected_rule := new.id;
  else
    affected_rule := new.rule_id;
  end if;
  select r.scope into rule_scope from public.revenue_share_rules r where r.id = affected_rule;
  select count(*) filter (where l.rw_id is null), count(*) filter (where l.rw_id is not null)
    into equal_lines, fixed_lines
  from public.revenue_share_rule_lines l where l.rule_id = affected_rule and l.beneficiary = 'rw_treasury';
  if equal_lines = 0 then
    return null;
  end if;
  if equal_lines > 1 or fixed_lines > 0 then
    raise exception 'a revenue rule splits the RWs'' share equally in one line, with no RW named beside it'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if rule_scope not in ('package_default', 'package') then
    raise exception 'only a package''s rule may split the RWs'' share equally over the booking''s legs'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return null;
end;
$$;
revoke execute on function internal.revenue_rule_shape_guard() from public, anon, authenticated;
create constraint trigger revenue_rule_shape_guard
  after insert or update on public.revenue_share_rule_lines
  deferrable initially deferred
  for each row execute function internal.revenue_rule_shape_guard();
create constraint trigger revenue_rule_scope_shape_guard
  after update of scope on public.revenue_share_rules
  deferrable initially deferred
  for each row execute function internal.revenue_rule_shape_guard();

-- Splits an amount in whole rupiah over weights by largest remainder: each part gets the floor of its exact share,
-- the rupiah left over go one each to the parts with the largest fractions, and a tie goes to the earlier part. The
-- parts always add up to the amount. It reads nothing, so the caller decides the order ties follow.
create function internal.largest_remainder_split(p_amount bigint, p_weights numeric[]) returns bigint[]
  language plpgsql immutable
  set search_path = ''
as $$
declare
  total numeric;
  parts bigint[];
  leftover bigint;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'the amount to split must be zero or more' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_weights), 0) = 0
     or exists (select 1 from unnest(p_weights) as w(weight) where w.weight is null or w.weight < 0) then
    raise exception 'split over one or more weights of zero or more' using errcode = '22023';
  end if;
  total := (select sum(w.weight) from unnest(p_weights) as w(weight));
  if total = 0 then
    raise exception 'the weights of a split must add up to more than zero' using errcode = '22023';
  end if;

  select array_agg(floor(p_amount * w.weight / total)::bigint order by w.position) into parts
  from unnest(p_weights) with ordinality as w(weight, position);
  leftover := p_amount - (select sum(p.part) from unnest(parts) as p(part));

  select array_agg(parts[r.position] + case when r.rank <= leftover then 1 else 0 end order by r.position) into parts
  from (
    select w.position,
           row_number() over (order by p_amount * w.weight / total - floor(p_amount * w.weight / total) desc,
                                       w.position) as rank
    from unnest(p_weights) with ordinality as w(weight, position)
  ) as r;

  if (select sum(p.part) from unnest(parts) as p(part)) <> p_amount then
    raise exception 'a split of % did not add up', p_amount using errcode = 'P0001';
  end if;
  return parts;
end;
$$;
revoke execute on function internal.largest_remainder_split(bigint, numeric[]) from public, anon, authenticated;

-- The order of a rule's lines in a split, which is also who wins a tie (proposed default Q1 of PR 4): the kelurahan,
-- the RW treasuries in the booking's leg order (an equal-split line after the named ones), then vendors.
create function internal.revenue_line_order(p_beneficiary public.revenue_beneficiary, p_rw_id smallint,
  p_vendor_id uuid, p_legs smallint[]) returns text
  language sql immutable
  set search_path = ''
as $$
  select case p_beneficiary
    when 'kelurahan' then '1'
    when 'rw_treasury' then '2' || lpad(coalesce(array_position(p_legs, p_rw_id), 99)::text, 2, '0')
    else '3' || coalesce(p_vendor_id::text, '')
  end;
$$;
revoke execute on function internal.revenue_line_order(public.revenue_beneficiary, smallint, uuid, smallint[])
  from public, anon, authenticated;

-- A rule's split of an amount for a booking whose legs visit p_rw_ids, in leg order (decision of 2026-10-21 and
-- proposed defaults Q1, Q2 of PR 4). First the amount goes over the rule's lines by largest remainder in the order
-- of internal.revenue_line_order; then an equal-split line's part goes over the legs by largest remainder, ties to
-- the earlier leg. A line for an RW the booking does not visit is refused, never paid.
create function internal.revenue_split(p_rule_id uuid, p_amount bigint, p_rw_ids smallint[])
  returns table (part_order integer, beneficiary public.revenue_beneficiary, rw_id smallint, vendor_id uuid,
                 pct numeric, amount bigint)
  language plpgsql stable
  set search_path = ''
as $$
declare
  legs smallint[] := coalesce(p_rw_ids, '{}');
  line_ids uuid[];
  line_weights numeric[];
  line_parts bigint[];
  leg_parts bigint[];
  line record;
  next_order integer := 0;
begin
  if cardinality(legs) <> (select count(distinct l.leg) from unnest(legs) as l(leg)) then
    raise exception 'a booking visits each RW once' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if exists (select 1 from public.revenue_share_rule_lines l
             where l.rule_id = p_rule_id and l.beneficiary = 'rw_treasury' and l.rw_id is not null
               and not l.rw_id = any (legs)) then
    raise exception 'revenue rule % pays an RW the booking does not visit', p_rule_id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if cardinality(legs) = 0
     and exists (select 1 from public.revenue_share_rule_lines l
                 where l.rule_id = p_rule_id and l.beneficiary = 'rw_treasury' and l.rw_id is null) then
    raise exception 'revenue rule % splits over the booking''s legs, and there are none', p_rule_id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  select array_agg(l.id order by internal.revenue_line_order(l.beneficiary, l.rw_id, l.vendor_id, legs)),
         array_agg(l.pct order by internal.revenue_line_order(l.beneficiary, l.rw_id, l.vendor_id, legs))
    into line_ids, line_weights
  from public.revenue_share_rule_lines l where l.rule_id = p_rule_id;
  if line_ids is null then
    raise exception 'revenue rule % has no lines', p_rule_id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  line_parts := internal.largest_remainder_split(p_amount, line_weights);

  for i in 1 .. cardinality(line_ids) loop
    select l.beneficiary, l.rw_id, l.vendor_id, l.pct into line
    from public.revenue_share_rule_lines l where l.id = line_ids[i];
    if line.beneficiary = 'rw_treasury' and line.rw_id is null then
      leg_parts := internal.largest_remainder_split(line_parts[i], array_fill(1::numeric, array[cardinality(legs)]));
      for leg in 1 .. cardinality(legs) loop
        next_order := next_order + 1;
        return query select next_order, line.beneficiary, legs[leg], null::uuid, line.pct / cardinality(legs),
                            leg_parts[leg];
      end loop;
    else
      next_order := next_order + 1;
      return query select next_order, line.beneficiary, line.rw_id, line.vendor_id, line.pct, line_parts[i];
    end if;
  end loop;
end;
$$;
revoke execute on function internal.revenue_split(uuid, bigint, smallint[]) from public, anon, authenticated;

-- Which rule a package's amount follows on a day: its own package rule, else its RW's default (the combo default for
-- a combo, rw_id NULL). There is no global fallback (docs/PRD.md §11.2): no rule in force, or more than one for the
-- same package, is refused, so a settlement never pays by a guess.
create function internal.resolve_package_rule(p_package_id uuid, p_on date) returns uuid
  language plpgsql stable
  set search_path = ''
as $$
declare
  package_rw smallint;
  candidates uuid[];
begin
  select p.rw_id into package_rw from public.tour_packages p where p.id = p_package_id;
  if not found then
    raise exception 'no package %', p_package_id using errcode = 'P0002';
  end if;
  candidates := array(
    select r.id from public.revenue_share_rules r
    where r.scope = 'package' and r.package_id = p_package_id and r.is_active
      and r.effective_from <= p_on and (r.effective_to is null or r.effective_to >= p_on));
  if cardinality(candidates) = 0 then
    candidates := array(
      select r.id from public.revenue_share_rules r
      where r.scope = 'package_default' and r.rw_id is not distinct from package_rw
        and r.package_id is null and r.product_id is null and r.is_active
        and r.effective_from <= p_on and (r.effective_to is null or r.effective_to >= p_on));
  end if;
  if cardinality(candidates) = 0 then
    raise exception 'package % has no revenue-share rule in force on %', p_package_id, p_on
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if cardinality(candidates) > 1 then
    raise exception 'package % has % revenue-share rules in force on %, so which one applies is ambiguous',
      p_package_id, cardinality(candidates), p_on using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return candidates[1];
end;
$$;
revoke execute on function internal.resolve_package_rule(uuid, date) from public, anon, authenticated;
