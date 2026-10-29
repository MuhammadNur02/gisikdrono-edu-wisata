-- Deferred Low of the review of PR #103 (Task P4.7.02; docs/Security.md REC-10, PAY-16): the payout preview ended
-- today by default, and today's ledger is still being written. A settlement or a reversal recorded between the preview
-- and the payout (the superadmin transfers in between) changes the period's sum, so settle_revenue_entries refuses
-- with PAYOUT_TOTAL_MISMATCH after the money has moved. Rows are only ever written at now(), so a day that has ended
-- (Asia/Jakarta, today_jkt) never changes again: the preview now ends yesterday by default and shows no total for a
-- period that reaches today, as it already showed none for one reaching past it. The form says "choose days that have
-- passed" and offers no payout (its submit needs the preview's total).
--
-- payout_preview is made again from 20261104210300 with this change; everything else in it is unchanged.

-- {beneficiary_key, oldest_unpaid, from, to, total, entries, blocked_since, blocked_reason}: p_to defaults to
-- yesterday in Jakarta, p_from to the party's oldest unpaid day, or to p_to when every unpaid row is younger (so a
-- party owed only today's rows sees an empty closed period, not a reversed one); a total only for a period of days that
-- have ended and that no unpaid negative row before it blocks (blocked_since, blocked_reason negative_pending).
create or replace function public.payout_preview(p_beneficiary_key text, p_from date default null, p_to date default null)
  returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  key text := btrim(coalesce(p_beneficiary_key, ''));
  last_closed_day date := public.today_jkt() - 1;
  oldest date;
  period_from date;
  period_to date := coalesce(p_to, last_closed_day);
  total bigint;
  entries integer;
  blocked_since date;
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'payouts are previewed by the superadmin at AAL2' using errcode = '42501';
  end if;
  if key !~ '^(kelurahan|rw:[0-9]{1,2}|vendor:[0-9a-f-]{36})$' then
    raise exception 'unknown beneficiary %', key using errcode = '22023';
  end if;
  select min((e.created_at at time zone 'Asia/Jakarta')::date) into oldest from public.revenue_share_entries e
  where e.beneficiary_key = key and e.payout_batch_id is null;
  period_from := coalesce(p_from, least(oldest, period_to), period_to);
  blocked_since := internal.negative_pending_since(key, period_from);
  if blocked_since is null and period_from <= period_to and period_to <= last_closed_day then
    select coalesce(sum(u.amount), 0)::bigint, count(*)::integer into total, entries
    from internal.unpaid_entries(key, period_from, period_to) as u;
  end if;
  return jsonb_build_object('beneficiary_key', key, 'oldest_unpaid', oldest, 'from', period_from, 'to', period_to,
                            'total', total, 'entries', entries, 'blocked_since', blocked_since,
                            'blocked_reason', case when blocked_since is not null then 'negative_pending' end);
end;
$$;
