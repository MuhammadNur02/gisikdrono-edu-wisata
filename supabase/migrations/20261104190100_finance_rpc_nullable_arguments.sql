-- Task P4.7.02 and P4.7.04 (decision of 2026-10-25): the finance pages call save_revenue_rule and propose_adjustment
-- through the typed supabase-js client, whose generated arguments are required unless the function gives them a
-- default. A package_default rule names no package and a write_off no payment, so those arguments are NULL, which a
-- required argument cannot be. Both functions are made again with their nullable arguments last, each defaulting to
-- NULL. save_revenue_rule's body is that of 20261101130100 and propose_adjustment's that of 20261104181000, unchanged:
-- a manual_refund keeps details.weather_link_id, lower-cased (any case is read), and check_adjustment_terms judges the
-- link through named_weather_link, the booking's own, unresolved and held (held_at), which is L-c of the delta review
-- of PR #80; a second check here would only repeat it.

drop function public.save_revenue_rule(public.revenue_rule_scope, smallint, uuid, uuid, text, date, jsonb);
drop function public.propose_adjustment(public.adjustment_type, uuid, uuid, bigint, text, text, jsonb);

-- {rule_id, closed_rule_id} once the new version and its lines are written.
create function public.save_revenue_rule(
  p_scope public.revenue_rule_scope, p_name text, p_effective_from date, p_lines jsonb,
  p_rw_id smallint default null, p_package_id uuid default null, p_product_id uuid default null
) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  today date := public.today_jkt();
  previous record;
  new_rule_id uuid;
begin
  if not (public.is_superadmin() and public.fresh_totp()) then
    raise exception 'revenue rules are written by the superadmin with a fresh authenticator code'
      using errcode = '42501';
  end if;
  perform internal.take_audit_turn();
  if p_effective_from is null or p_effective_from < today then
    raise exception 'a rule version starts today or later' using errcode = 'P0001', hint = 'RULE_START_INVALID';
  end if;
  perform internal.revenue_rule_lines_of(p_lines);

  -- The version in force on the day the new one starts, for the same target.
  select r.id, r.effective_from into previous
  from public.revenue_share_rules r
  where r.scope = p_scope and r.rw_id is not distinct from p_rw_id and r.package_id is not distinct from p_package_id
    and r.product_id is not distinct from p_product_id and r.is_active
    and (r.effective_to is null or r.effective_to >= p_effective_from)
  order by r.effective_from desc
  limit 1
  for update;
  if found then
    if previous.effective_from >= p_effective_from then
      raise exception 'a version of this rule already starts on %', previous.effective_from
        using errcode = 'P0001', hint = 'RULE_OVERLAP';
    end if;
    -- A version in force today ends tonight at the earliest: today's settlements keep the terms they were made under.
    if p_effective_from <= today then
      raise exception 'a new version of a rule in force starts tomorrow at the earliest'
        using errcode = 'P0001', hint = 'RULE_START_INVALID';
    end if;
    update public.revenue_share_rules set effective_to = p_effective_from - 1 where id = previous.id;
  end if;

  begin
    insert into public.revenue_share_rules (scope, rw_id, package_id, product_id, name, effective_from, created_by)
    values (p_scope, p_rw_id, p_package_id, p_product_id, btrim(p_name), p_effective_from, auth.uid())
    returning id into new_rule_id;
  exception
    when exclusion_violation then
      raise exception 'another version of this rule is in force on %', p_effective_from
        using errcode = 'P0001', hint = 'RULE_OVERLAP';
    when check_violation or foreign_key_violation then
      raise exception 'a % rule names its own target, and that target exists', p_scope
        using errcode = 'P0001', hint = 'RULE_TARGET_INVALID';
  end;
  begin
    insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, vendor_id, pct)
    select new_rule_id, l.beneficiary, l.rw_id, l.vendor_id, l.pct from internal.revenue_rule_lines_of(p_lines) l;
  exception when check_violation or foreign_key_violation then
    raise exception 'each line names the RW or the vendor its beneficiary needs, and only that'
      using errcode = 'P0001', hint = 'RULE_LINES_INVALID';
  end;
  return jsonb_build_object('rule_id', new_rule_id, 'closed_rule_id', previous.id);
end;
$$;

create function public.propose_adjustment(p_type public.adjustment_type, p_booking_id uuid, p_amount bigint,
  p_reason text, p_evidence_path text, p_details jsonb default '{}', p_payment_id uuid default null) returns jsonb
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

revoke execute on function
  public.save_revenue_rule(public.revenue_rule_scope, text, date, jsonb, smallint, uuid, uuid),
  public.propose_adjustment(public.adjustment_type, uuid, bigint, text, text, jsonb, uuid)
  from public, anon, service_role;
grant execute on function
  public.save_revenue_rule(public.revenue_rule_scope, text, date, jsonb, smallint, uuid, uuid),
  public.propose_adjustment(public.adjustment_type, uuid, bigint, text, text, jsonb, uuid)
  to authenticated;
