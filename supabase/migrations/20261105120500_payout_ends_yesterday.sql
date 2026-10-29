-- Review of PR #108, L1 (Task P4.7.02; docs/Security.md REC-10, PAY-16): payout_preview shows no total for a period
-- that reaches today (20261105120400), but settle_revenue_entries still recorded one, so a direct call could stamp a
-- day whose ledger is still being written. A payout now covers days that have ended: p_to before today in Jakarta
-- (22023 otherwise, as for a day still to come).
--
-- settle_revenue_entries is made again from 20261104210300 with this one change; everything else in it is unchanged.

-- The payout batch as jsonb, once its total and its ledger rows are stamped. p_from and p_to are Jakarta days of the
-- rows, p_to yesterday at the latest.
create or replace function public.settle_revenue_entries(
  p_beneficiary_key text, p_from date, p_to date, p_reference text, p_proof_path text, p_expected_total bigint
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
  if p_from is null or p_to is null or p_from > p_to or p_to >= public.today_jkt() then
    raise exception 'a payout covers days that have ended, yesterday at the latest' using errcode = '22023';
  end if;
  if length(reference) not between 3 and 100 then
    raise exception 'a payout names its transfer in 3 to 100 characters' using errcode = '22023';
  end if;
  if p_proof_path is null or p_proof_path !~ '^payouts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-][A-Za-z0-9._-]{0,79}$' then
    raise exception 'a payout keeps its proof under documents/payouts/' using errcode = '22023';
  end if;
  perform internal.require_document(p_proof_path);
  perform internal.require_unseen_proof(p_proof_path, null);

  perform pg_advisory_xact_lock(hashtext('payout:' || key));
  -- L-5: a negative row left unpaid before the period would be netted by no payout; the period starts at it or earlier.
  if internal.negative_pending_since(key, p_from) is not null then
    raise exception '% has an unpaid negative ledger row before %', key, p_from
      using errcode = 'P0001', hint = 'PAYOUT_NEGATIVE_PENDING';
  end if;
  -- The batch first, then the rows it stamps, so its total is the sum of exactly the rows it stamped (review of PR #68,
  -- L1): a ledger row written between a separate sum and the stamp can no longer slip in uncounted.
  insert into public.payout_batches (id, beneficiary_key, period_from, period_to, total_amount, paid_at, reference,
    proof_path, created_by)
  values (split_part(p_proof_path, '/', 2)::uuid, key, p_from, p_to, 0, now(), reference, p_proof_path, auth.uid())
  returning * into batch;
  with stamped as (
    update public.revenue_share_entries e set payout_batch_id = batch.id
    where e.id in (select u.id from internal.unpaid_entries(key, p_from, p_to) as u)
    returning e.amount
  )
  select coalesce(sum(stamped.amount), 0) into total from stamped;
  -- The total nets every unpaid row of the period, a negative kelurahan row (an A24 shortfall) included; a net of
  -- nothing or less is no payout, whatever amount was named (#90's review).
  if total <= 0 then
    raise exception 'nothing is left to pay out to % from % to %', key, p_from, p_to
      using errcode = 'P0001', hint = 'PAYOUT_EMPTY';
  end if;
  -- M-2: what was transferred is what the rows add up to, or nothing is written; naming no amount is naming another.
  if p_expected_total is distinct from total then
    raise exception 'the period pays % to %, not the % transferred', total, key, p_expected_total
      using errcode = 'P0001', hint = 'PAYOUT_TOTAL_MISMATCH';
  end if;
  update public.payout_batches set total_amount = total where id = batch.id returning * into batch;
  return to_jsonb(batch);
end;
$$;
