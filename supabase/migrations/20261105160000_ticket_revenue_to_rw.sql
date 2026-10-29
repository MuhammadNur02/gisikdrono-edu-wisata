-- Decision of 2026-10-29 (product owner; docs/PRD.md §13.1 A4, revised): the ticket revenue of a visit belongs wholly
-- to the treasuries of the RWs it visits, and the kelurahan takes 0 %. A combo splits it equally among its RWs. There
-- is still one Midtrans merchant (the kelurahan's BUMKel), which pays each RW out of the ledger.
--
-- Every default package rule (scope package_default, no package, no product) gets a new version from today, Jakarta
-- time: an RW's own default pays its treasury 100 %; the combo default (rw_id NULL) pays 100 % through the equal-split
-- line of 20261022100000, so internal.revenue_split gives the RWs of the booking's legs equal parts by largest
-- remainder, a leftover rupiah to the earlier leg. Both have a single line, as save_revenue_rule would write them: it
-- refuses a 0 % line, so the kelurahan simply has none.
--
-- Versioning as save_revenue_rule does it, without touching what the ledger used: the version in force today ends
-- yesterday (only effective_to changes, which revenue_rules_immutable_once_used allows); one that only started today
-- (a database built today) is switched off instead, as 20261022100000 closed the first combo rule. Ledger rows keep
-- their rule_id and rule_version snapshot, so a settlement already written keeps its split. A version that was waiting
-- to start would overlap the new one and is switched off; nothing has used it yet, since a settlement reads the rule
-- of its own day. Rules of one package (scope package) and the add-on defaults are left as they are.
--
-- The superadmin can still change any of these afterwards on /dashboard/finance/revenue-share (save_revenue_rule).

do $$
declare
  today constant date := public.today_jkt();
  target record;
  new_rule_id uuid;
begin
  for target in
    select distinct r.rw_id
    from public.revenue_share_rules r
    where r.scope = 'package_default' and r.package_id is null and r.product_id is null and r.is_active
      and (r.effective_to is null or r.effective_to >= today)
  loop
    update public.revenue_share_rules r
    set is_active = false
    where r.scope = 'package_default' and r.package_id is null and r.product_id is null
      and r.rw_id is not distinct from target.rw_id and r.is_active and r.effective_from > today;

    update public.revenue_share_rules r
    set effective_to = case when r.effective_from < today then today - 1 else r.effective_from end,
        is_active = r.effective_from < today
    where r.scope = 'package_default' and r.package_id is null and r.product_id is null
      and r.rw_id is not distinct from target.rw_id and r.is_active
      and r.effective_from <= today and (r.effective_to is null or r.effective_to >= today);

    insert into public.revenue_share_rules (scope, rw_id, name, effective_from)
    values ('package_default', target.rw_id,
            case when target.rw_id is null then 'Bawaan paket kombinasi, 100 % kas RW rata per RW'
                 else 'Bawaan paket RW ' || lpad(target.rw_id::text, 2, '0') || ', 100 % kas RW' end,
            today)
    returning id into new_rule_id;
    -- rw_id NULL on the combo's line is the equal split over the booking's legs.
    insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct)
    values (new_rule_id, 'rw_treasury', target.rw_id, 100.00);
  end loop;
end;
$$;

-- Every RW online still has the default rules it needs (set_rw_unit_status), RW 13 of 20261022080000 included, and
-- the combo has its one default in force.
do $$
begin
  if exists (select 1 from public.rw_units u where u.is_active and not internal.has_current_default_rules(u.id)) then
    raise exception 'an RW online lost its default revenue-share rules';
  end if;
  if (select count(*) from public.revenue_share_rules r
      where r.scope = 'package_default' and r.rw_id is null and r.package_id is null and r.product_id is null
        and r.is_active and r.effective_from <= public.today_jkt()
        and (r.effective_to is null or r.effective_to >= public.today_jkt())) <> 1 then
    raise exception 'the combo needs exactly one default package rule in force';
  end if;
end;
$$;
