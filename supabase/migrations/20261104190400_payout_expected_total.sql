-- Review of PR #80, M-2 (owner decision: a payout equals what was transferred; Task P4.7.02, docs/Security.md REC-10):
--
--   payout_preview          what a payout of one party would stamp: the party's oldest unpaid ledger day (the form's
--                           default start), and for a period the total and the rows, as of the server's time now. A
--                           read for the superadmin at AAL2.
--   settle_revenue_entries  takes the total the superadmin saw and transferred (p_expected_total) and refuses
--                           (PAYOUT_TOTAL_MISMATCH) when the rows it stamps add up to anything else, negative rows
--                           included; a net of nothing or less stays PAYOUT_EMPTY, whatever was named; the period ends
--                           today at the latest, and only rows written by the time of the call are stamped. The proof's
--                           content is checked as every finance proof is (20261104190300, PROOF_REUSED).
--
-- The five-argument settle_revenue_entries of 20261101130100 goes; its body is otherwise unchanged.


-- The unpaid ledger rows of a party in a period as of now: the rows a payout would stamp.
create function internal.unpaid_entries(p_beneficiary_key text, p_from date, p_to date)
  returns setof public.revenue_share_entries
  language sql stable
  set search_path = ''
as $$
  select e.* from public.revenue_share_entries e
  where e.beneficiary_key = p_beneficiary_key and e.payout_batch_id is null and e.created_at <= now()
    and (e.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to;
$$;
revoke execute on function internal.unpaid_entries(text, date, date) from public, anon, authenticated, service_role;

-- {beneficiary_key, oldest_unpaid, from, to, total, entries}: p_from defaults to the party's oldest unpaid day, p_to
-- to today; total and entries are null while the period is not one a payout may cover.
create function public.payout_preview(p_beneficiary_key text, p_from date default null, p_to date default null)
  returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  key text := btrim(coalesce(p_beneficiary_key, ''));
  oldest date;
  period_from date;
  period_to date := coalesce(p_to, public.today_jkt());
  total bigint;
  entries integer;
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'payouts are previewed by the superadmin at AAL2' using errcode = '42501';
  end if;
  if key !~ '^(kelurahan|rw:[0-9]{1,2}|vendor:[0-9a-f-]{36})$' then
    raise exception 'unknown beneficiary %', key using errcode = '22023';
  end if;
  select min((e.created_at at time zone 'Asia/Jakarta')::date) into oldest from public.revenue_share_entries e
  where e.beneficiary_key = key and e.payout_batch_id is null;
  period_from := coalesce(p_from, oldest, period_to);
  if period_from <= period_to and period_to <= public.today_jkt() then
    select coalesce(sum(u.amount), 0)::bigint, count(*)::integer into total, entries
    from internal.unpaid_entries(key, period_from, period_to) as u;
  end if;
  return jsonb_build_object('beneficiary_key', key, 'oldest_unpaid', oldest, 'from', period_from, 'to', period_to,
                            'total', total, 'entries', entries);
end;
$$;

drop function public.settle_revenue_entries(text, date, date, text, text);

-- The payout batch as jsonb, once its total and its ledger rows are stamped. p_from and p_to are Jakarta days of the rows.
create function public.settle_revenue_entries(
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
  perform internal.require_unseen_proof(p_proof_path, null);

  perform pg_advisory_xact_lock(hashtext('payout:' || key));
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

revoke execute on function public.payout_preview(text, date, date),
  public.settle_revenue_entries(text, date, date, text, text, bigint)
  from public, anon, service_role;
grant execute on function public.payout_preview(text, date, date),
  public.settle_revenue_entries(text, date, date, text, text, bigint)
  to authenticated;
