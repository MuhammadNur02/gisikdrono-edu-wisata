-- Task P4.7.02 (docs/PRD.md §8.7.1, §10.3; docs/Security.md REC-05, REC-10, PAY-16, AUTH-11):
--
--   save_revenue_rule       a new version of a revenue-share rule: its lines, which add up to 100 %, and the day it
--                           starts, which closes the version in force the day before, in one transaction with readable
--                           refusals. It asks what the rule tables' own policies ask (0005): the superadmin with a
--                           fresh TOTP code; the triggers of 0004 and 20261024100300 still check every row.
--   settle_revenue_entries  a payout to one beneficiary: the batch, and its id stamped once on the ledger rows of the
--                           period not yet paid out (append_only lets payout_batch_id be filled in once).
--
-- Refusals carry their own hints, which revenue-share-service.ts turns into Indonesian copy:
--   RULE_LINES_INVALID   no line, a share outside 0–100 or more than two decimals, or shares not adding up to 100
--   RULE_START_INVALID   a version starting before tomorrow while another is in force, or before today
--   RULE_OVERLAP         a version of the same target already starts on or after that day
--   RULE_TARGET_INVALID  a scope without its package or product, or one that does not exist
--   PROOF_MISSING        no file at the proof's path in the documents bucket
--   PAYOUT_EMPTY         nothing left to pay out to that beneficiary in the period


-- ===== save_revenue_rule =====

-- The lines as given, checked: [{beneficiary, rw_id, vendor_id, pct}], pct with at most two decimals, adding up to 100.
create function internal.revenue_rule_lines_of(p_lines jsonb) returns table (
  beneficiary public.revenue_beneficiary, rw_id smallint, vendor_id uuid, pct numeric(5,2)
)
  language plpgsql immutable
  set search_path = ''
as $$
declare
  line jsonb;
  total numeric := 0;
  share numeric;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
     or jsonb_array_length(p_lines) > 10 then
    raise exception 'a revenue rule has one to ten lines' using errcode = 'P0001', hint = 'RULE_LINES_INVALID';
  end if;
  for line in select value from jsonb_array_elements(p_lines) loop
    -- A share, beneficiary, RW or vendor that is not one at all reads as an invalid line, not as a cast error
    -- (review of PR #68, L7).
    begin
      share := (line ->> 'pct')::numeric;
      beneficiary := (line ->> 'beneficiary')::public.revenue_beneficiary;
      rw_id := (line ->> 'rw_id')::smallint;
      vendor_id := (line ->> 'vendor_id')::uuid;
    exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
      raise exception 'a line names a share, a beneficiary, an RW and a vendor it can be read as'
        using errcode = 'P0001', hint = 'RULE_LINES_INVALID';
    end;
    if share is null or share <= 0 or share > 100 or share <> round(share, 2) then
      raise exception 'a share is above 0 and at most 100, with at most two decimals'
        using errcode = 'P0001', hint = 'RULE_LINES_INVALID';
    end if;
    total := total + share;
    pct := share;
    return next;
  end loop;
  if total <> 100 then
    raise exception 'the shares add up to %, not 100', total using errcode = 'P0001', hint = 'RULE_LINES_INVALID';
  end if;
end;
$$;
revoke execute on function internal.revenue_rule_lines_of(jsonb) from public, anon, authenticated, service_role;

-- {rule_id, closed_rule_id} once the new version and its lines are written.
create function public.save_revenue_rule(
  p_scope public.revenue_rule_scope, p_rw_id smallint, p_package_id uuid, p_product_id uuid, p_name text,
  p_effective_from date, p_lines jsonb
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


-- ===== settle_revenue_entries =====

-- A proof or an evidence file is named only once the server has put it in the documents bucket at exactly that path
-- (review of PR #68, L7). Shared with the refund and adjustment RPCs of 20261101130200.
create function internal.require_document(p_path text) returns void
  language plpgsql stable
  set search_path = ''
as $$
begin
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = p_path) then
    raise exception 'no document at %', p_path using errcode = 'P0001', hint = 'PROOF_MISSING';
  end if;
end;
$$;
revoke execute on function internal.require_document(text) from public, anon, authenticated, service_role;

-- The payout batch as jsonb, once its total and its ledger rows are stamped. p_from and p_to are Jakarta days of the rows.
create function public.settle_revenue_entries(
  p_beneficiary_key text, p_from date, p_to date, p_reference text, p_proof_path text
) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  batch public.payout_batches;
  key text := btrim(coalesce(p_beneficiary_key, ''));
  reference text := btrim(coalesce(p_reference, ''));
  total bigint;
begin
  if not (public.is_superadmin() and public.fresh_totp()) then
    raise exception 'payouts are recorded by the superadmin with a fresh authenticator code' using errcode = '42501';
  end if;
  perform internal.take_audit_turn();
  if key !~ '^(kelurahan|rw:[0-9]{1,2}|vendor:[0-9a-f-]{36})$' then
    raise exception 'unknown beneficiary %', key using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to > public.today_jkt() then
    raise exception 'a payout covers days that have passed' using errcode = '22023';
  end if;
  if length(reference) not between 3 and 100 then
    raise exception 'a payout names its transfer in 3 to 100 characters' using errcode = '22023';
  end if;
  if p_proof_path is null or p_proof_path !~ '^payouts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-][A-Za-z0-9._-]{0,79}$' then
    raise exception 'a payout keeps its proof under documents/payouts/' using errcode = '22023';
  end if;
  perform internal.require_document(p_proof_path);

  perform pg_advisory_xact_lock(hashtext('payout:' || key));
  -- The batch first, then the rows it stamps, so its total is the sum of exactly the rows it stamped (review of PR #68,
  -- L1): a ledger row written between a separate sum and the stamp can no longer slip in uncounted.
  insert into public.payout_batches (id, beneficiary_key, period_from, period_to, total_amount, paid_at, reference,
    proof_path, created_by)
  values (split_part(p_proof_path, '/', 2)::uuid, key, p_from, p_to, 0, now(), reference, p_proof_path, auth.uid())
  returning * into batch;
  with stamped as (
    update public.revenue_share_entries e set payout_batch_id = batch.id
    where e.beneficiary_key = key and e.payout_batch_id is null
      and (e.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to
    returning e.amount
  )
  select coalesce(sum(stamped.amount), 0) into total from stamped;
  if total <= 0 then
    raise exception 'nothing is left to pay out to % from % to %', key, p_from, p_to
      using errcode = 'P0001', hint = 'PAYOUT_EMPTY';
  end if;
  update public.payout_batches set total_amount = total where id = batch.id returning * into batch;
  return to_jsonb(batch);
end;
$$;

revoke execute on function public.save_revenue_rule(public.revenue_rule_scope, smallint, uuid, uuid, text, date, jsonb),
  public.settle_revenue_entries(text, date, date, text, text)
  from public, anon, service_role;
grant execute on function public.save_revenue_rule(public.revenue_rule_scope, smallint, uuid, uuid, text, date, jsonb),
  public.settle_revenue_entries(text, date, date, text, text)
  to authenticated;


-- ===== settle_revenue_entries is the only way a payout is written =====

-- Review of PR #68, M3: the superadmin's direct writes of 0005 would let a batch exist without the ledger rows it pays,
-- or change its total afterwards. Reads stay as they were.
revoke insert, update on public.payout_batches from authenticated;
drop policy payout_batches_super_insert on public.payout_batches;
drop policy payout_batches_super_update on public.payout_batches;
