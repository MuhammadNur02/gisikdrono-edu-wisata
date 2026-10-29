-- Review of PR #108, L3 (Task P4.7.03; docs/Security.md "Refunds", REC-16): a releaser who is no party to the
-- adjustment was tested with approver_is_eligible against the proposer only, which leaves out the accounts the
-- proposer created in the last 30 days but not those the approver created: the approver's second mailbox could release
-- the block at once, without the sole-superadmin alert. The test now runs against both parties, the approver too
-- when there is one (internal.release_eligible), for the releaser and for the other superadmins that keep a party
-- or an ineligible superadmin from releasing alone (other_eligible_superadmin), so the two never disagree.
--
-- release_by_sole_superadmin and other_eligible_superadmin are made again from 20261105120200 on that test;
-- everything else in them is unchanged.

-- L3: whether p_user meets the dual-control test against the adjustment's proposer and, once there is one, its
-- approver: an active superadmin, an account at least 7 days old, a factor verified before the proposal, and not an
-- account either party created in the last 30 days.
create function internal.release_eligible(p_user uuid, p_adjustment public.payment_adjustments) returns boolean
  language sql stable
  set search_path = ''
as $$
  select internal.approver_is_eligible(p_user, p_adjustment.proposed_by, p_adjustment.proposed_at)
         and (p_adjustment.approved_by is null
              or internal.approver_is_eligible(p_user, p_adjustment.approved_by, p_adjustment.proposed_at));
$$;
revoke execute on function internal.release_eligible(uuid, public.payment_adjustments)
  from public, anon, authenticated, service_role;

-- REC-16: whether an active superadmin other than p_user meets that test for this adjustment, and so keeps p_user from
-- releasing it alone. Read under the audit turn the release holds (20261105120200, Lock).
create or replace function internal.other_eligible_superadmin(p_user uuid, p_adjustment public.payment_adjustments)
  returns boolean
  language sql stable
  set search_path = ''
as $$
  select exists (select 1 from public.profiles p
                 where p.role = 'superadmin' and p.is_active and p.id is distinct from p_user
                   and internal.release_eligible(p.id, p_adjustment));
$$;

-- REC-16: whether the caller releases this alert of the adjustment as the sole superadmin, which raises its own alert;
-- false for a releaser who is no party to it and meets the test against both parties. The caller holds the audit turn.
create or replace function internal.release_by_sole_superadmin(p_adjustment public.payment_adjustments,
  p_alert public.security_alerts) returns boolean
  language plpgsql
  set search_path = ''
as $$
begin
  if auth.uid() is distinct from p_adjustment.proposed_by and auth.uid() is distinct from p_adjustment.approved_by
     and internal.release_eligible(auth.uid(), p_adjustment) then
    return false;
  end if;
  if internal.other_eligible_superadmin(auth.uid(), p_adjustment) then
    raise exception 'a party to adjustment % or a superadmin not yet eligible does not release its block while an eligible one is active',
      p_adjustment.id using errcode = 'P0001', hint = 'RELEASE_INELIGIBLE';
  end if;
  if p_alert.notified_at is null then
    raise exception 'the refund_key_mismatch alert of adjustment % is not delivered yet', p_adjustment.id
      using errcode = 'P0001', hint = 'ALERT_NOT_NOTIFIED';
  end if;
  if internal.sole_release_since(p_alert, auth.uid()) > now() - interval '24 hours' then
    raise exception 'the sole superadmin releases adjustment % 24 hours after its alert went out and after they became the only one',
      p_adjustment.id using errcode = 'P0001', hint = 'RELEASE_TOO_EARLY';
  end if;
  return true;
end;
$$;
