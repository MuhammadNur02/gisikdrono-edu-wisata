-- The last Lows of the review of PR #80 (Task P4.7.03, P4.7.02; docs/Security.md "Refunds", REC-10):
--
--   L-1  a release of an L6 block closes the adjustment's earlier open refund_key_mismatch_released issues as
--        resolved, its note naming the issue the new release opens, so one gap is open at a time
--   L-2  (decision of the review) the release mirrors the adjustment rule: while a second superadmin is active, the
--        adjustment's proposer and approver do not release it (RELEASE_INELIGIBLE); the sole active superadmin may,
--        24 hours after the alert went out (notified_at, RELEASE_TOO_EARLY before), which raises the high alert
--        refund_key_release_by_sole_superadmin
--   L-5  (decision of the review, the stricter option) a payout is refused (PAYOUT_NEGATIVE_PENDING) while the party
--        has an unpaid negative ledger row from before its period, which the payout would otherwise leave behind
--   Info a release is refused while Midtrans lists an amount under the key that does not read as one (listed < 0)
--
-- releasable_adjustment and release_refund_key_mismatch are made again from 20261104190200 and settle_revenue_entries
-- from 20261104190400, with these changes; everything else in them is unchanged.


-- ===== L-2, Info: what a release may accept =====

-- What Midtrans lists now under the key of an applied manual refund, listed with another amount that reads as one.
-- The row is locked. Who may release it is release_refund_key_mismatch's to judge, with the alert in hand (L-2).
create or replace function internal.releasable_adjustment(p_adjustment_id uuid) returns bigint
  language plpgsql
  set search_path = ''
as $$
declare
  adjustment public.payment_adjustments;
  listed bigint;
begin
  select a.* into adjustment from public.payment_adjustments a
  where a.id = p_adjustment_id and a.type = 'manual_refund' and a.status = 'applied'
  for update;
  if adjustment.id is null then
    raise exception 'adjustment % is no applied manual refund', p_adjustment_id using errcode = 'P0002';
  end if;
  listed := internal.key_refund_sum(
    internal.latest_refund_answer((select p from public.payments p where p.id = adjustment.payment_id), null),
    p_adjustment_id::text);
  -- Info: -1 is key_refund_sum's word for refunds under the key whose amounts do not read; no figure to accept.
  if listed is null or listed < 0 or listed = adjustment.amount
     or internal.released_key_sum(p_adjustment_id) is not distinct from listed then
    raise exception 'Midtrans lists nothing to release under adjustment %', p_adjustment_id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return listed;
end;
$$;
revoke execute on function internal.releasable_adjustment(uuid) from public, anon, authenticated, service_role;

-- L-2: whether the caller may release this alert of the adjustment; true when the caller is its proposer or approver
-- and the sole active superadmin, whose release raises its own alert.
create function internal.release_by_sole_superadmin(p_adjustment public.payment_adjustments,
  p_alert public.security_alerts) returns boolean
  language plpgsql stable
  set search_path = ''
as $$
begin
  if auth.uid() is distinct from p_adjustment.proposed_by and auth.uid() is distinct from p_adjustment.approved_by then
    return false;
  end if;
  if not internal.is_sole_superadmin(auth.uid()) then
    raise exception 'the proposer or approver of adjustment % does not release its block', p_adjustment.id
      using errcode = 'P0001', hint = 'RELEASE_INELIGIBLE';
  end if;
  if p_alert.notified_at is null then
    raise exception 'the refund_key_mismatch alert of adjustment % is not delivered yet', p_adjustment.id
      using errcode = 'P0001', hint = 'ALERT_NOT_NOTIFIED';
  end if;
  if p_alert.notified_at > now() - interval '24 hours' then
    raise exception 'the sole superadmin releases adjustment % 24 hours after its alert went out', p_adjustment.id
      using errcode = 'P0001', hint = 'RELEASE_TOO_EARLY';
  end if;
  return true;
end;
$$;
revoke execute on function internal.release_by_sole_superadmin(public.payment_adjustments, public.security_alerts)
  from public, anon, authenticated, service_role;

-- L-1: the adjustment's earlier gaps are settled by the one the new release opens.
create function internal.close_earlier_key_gap_issues(p_adjustment_id uuid, p_new_issue_id uuid) returns uuid[]
  language sql
  set search_path = ''
as $$
  with closed as (
    update public.reconciliation_issues i
    set resolution = 'resolved', resolved_by = auth.uid(),
        resolution_note = 'Digantikan oleh isu ' || p_new_issue_id
                          || ': Midtrans kini mencantumkan angka lain untuk refund penyesuaian ini.'
    where i.details ->> 'reason' = 'refund_key_mismatch_released'
      and i.details ->> 'adjustment_id' = p_adjustment_id::text
      and i.resolved_at is null and i.id <> p_new_issue_id
    returning i.id
  )
  select coalesce(array_agg(closed.id order by closed.id), '{}') from closed;
$$;
revoke execute on function internal.close_earlier_key_gap_issues(uuid, uuid)
  from public, anon, authenticated, service_role;

-- The sole superadmin's release, told out of band as a self-approved adjustment is.
create function internal.raise_sole_release_alert(p_adjustment public.payment_adjustments,
  p_alert public.security_alerts, p_listed bigint) returns void
  language sql
  set search_path = ''
as $$
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('refund_key_release_by_sole_superadmin', 'high', 'refund_key_release_by_sole_superadmin:' || p_alert.id,
          'Blokir refund dilepas oleh satu-satunya superadmin',
          jsonb_build_object('adjustment_id', p_adjustment.id, 'booking_id', p_adjustment.booking_id,
                             'alert_id', p_alert.id, 'released_sum', p_listed, 'booked_amount', p_adjustment.amount,
                             'actor_id', auth.uid()))
  on conflict (fingerprint) where acknowledged_at is null do nothing;
$$;
revoke execute on function internal.raise_sole_release_alert(public.payment_adjustments, public.security_alerts, bigint)
  from public, anon, authenticated, service_role;


-- ===== release_refund_key_mismatch (L-1, L-2) =====

-- The superadmin, with a fresh code, releases the L6 block of an applied manual refund with a note of 10 to 300
-- characters, through its latest refund_key_mismatch alert, open or already acknowledged without a release. The alert
-- must have been delivered (notified_at); the release keeps the figure it accepted, opens the issue of the gap and
-- closes the adjustment's earlier ones (L-1), and is audited with the note. Who may release is L-2's rule above.
create or replace function public.release_refund_key_mismatch(p_adjustment_id uuid, p_note text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  adjustment public.payment_adjustments;
  listed bigint;
  alert public.security_alerts;
  note text := btrim(coalesce(p_note, ''));
  is_sole_release boolean;
  issue_id uuid;
  closed_issue_ids uuid[];
begin
  perform internal.require_finance_writer();
  if length(note) not between 10 and 300 then
    raise exception 'a release says why in 10 to 300 characters' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  listed := internal.releasable_adjustment(p_adjustment_id);
  select a.* into adjustment from public.payment_adjustments a where a.id = p_adjustment_id;
  select s.* into alert from public.security_alerts s
  where s.fingerprint = 'refund_key_mismatch:' || p_adjustment_id
  order by s.details ? 'release_note', s.created_at desc, s.id desc
  limit 1
  for update;
  if alert.id is null then
    raise exception 'adjustment % has no refund_key_mismatch alert', p_adjustment_id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  is_sole_release := internal.release_by_sole_superadmin(adjustment, alert);
  if alert.notified_at is null then
    raise exception 'the refund_key_mismatch alert of adjustment % is not delivered yet', p_adjustment_id
      using errcode = 'P0001', hint = 'ALERT_NOT_NOTIFIED';
  end if;
  update public.security_alerts
  set acknowledged_by = coalesce(acknowledged_by, auth.uid()),
      details = jsonb_build_object('release_note', note, 'released_by', auth.uid(), 'released_sum', listed,
                                   'released_at', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'))
  where id = alert.id;
  issue_id := internal.open_key_gap_issue(adjustment, listed);
  closed_issue_ids := internal.close_earlier_key_gap_issues(p_adjustment_id, issue_id);
  if is_sole_release then
    perform internal.raise_sole_release_alert(adjustment, alert, listed);
  end if;
  perform internal.log_audit('refund.key_mismatch_released', 'payment_adjustments', p_adjustment_id::text,
    jsonb_build_object('alert_id', alert.id, 'note', note, 'released_sum', listed,
                       'booked_amount', adjustment.amount, 'issue_id', issue_id,
                       'closed_issue_ids', to_jsonb(closed_issue_ids), 'sole_superadmin', is_sole_release));
  return jsonb_build_object('result', 'released', 'adjustment_id', p_adjustment_id, 'issue_id', issue_id,
                            'released_sum', listed, 'closed_issue_ids', to_jsonb(closed_issue_ids));
end;
$$;


-- ===== settle_revenue_entries (L-5) =====

-- The payout batch as jsonb, once its total and its ledger rows are stamped. p_from and p_to are Jakarta days of the rows.
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
  -- L-5: a negative row left unpaid before the period would be netted by no payout; the period starts at it or earlier.
  if exists (select 1 from public.revenue_share_entries e
             where e.beneficiary_key = key and e.payout_batch_id is null and e.amount < 0
               and (e.created_at at time zone 'Asia/Jakarta')::date < p_from) then
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
