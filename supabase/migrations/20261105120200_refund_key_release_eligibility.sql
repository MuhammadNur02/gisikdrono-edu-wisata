-- Deferred findings of the review of PR #103 (Task P4.7.03; docs/Security.md "Refunds", REC-16), the release of an
-- L6 block (release_refund_key_mismatch, 20261104210300):
--
--   REC-16  a releaser who neither proposed nor approved the adjustment released it with no test at all, so a sole
--           superadmin who invited a second-mailbox superadmin could, once the invite was accepted, release through
--           that account at once and skip the refund_key_release_by_sole_superadmin alert. The dual-control test of
--           an approver (internal.approver_is_eligible: an active superadmin whose account (profiles.created_at) is at
--           least 7 days old, with a factor verified before the proposal, not created by the proposer in the last
--           30 days) now decides who counts:
--             - a releaser who is no party to the adjustment and is eligible releases it at once;
--             - anyone else, a party or an ineligible superadmin, releases it only as the sole superadmin: while no
--               other active superadmin is eligible for this adjustment (RELEASE_INELIGIBLE otherwise), 24 hours
--               after the alert went out and after the last other superadmin stopped counting (RELEASE_TOO_EARLY),
--               and the release raises the high refund_key_release_by_sole_superadmin alert.
--           So an account that does not meet the dual-control test is never "a second superadmin", neither to
--           release nor to keep the sole one from releasing out of band. A completed MFA reset of another superadmin
--           (staff.mfa_reset_completed) now also counts as the moment they stopped counting, since it leaves them no
--           factor from before any proposal.
--   Lock    the release took the audit turn and then FOR SHARE on the superadmin rows, while a concurrent profile
--           change (set_staff_role, set_staff_status, accept_staff_invite) holds its row and then waits for the turn
--           in its audit trigger: a 40P01 between them. The release now takes no profile row lock at all. Every
--           change of a role, an activation or a factor reset writes its audit row, and so takes the audit turn,
--           before it commits; the release holds that turn from its first statement to its commit and reads the
--           profiles after taking it. A promotion or deactivation is therefore wholly before the release, and seen,
--           or wholly after it, and FOR SHARE, which never kept a non-superadmin row from being promoted, is gone.
--   Info    alert_first_delivered_at was declared immutable, though its text-to-timestamptz cast reads the session's
--           TimeZone; it is stable.
--
-- release_by_sole_superadmin, last_superadmin_drop_at and alert_first_delivered_at are made again from
-- 20261104210300 with these changes; everything else in them is unchanged.

-- Info: stable, as its cast is.
create or replace function internal.alert_first_delivered_at(p_alert public.security_alerts) returns timestamptz
  language sql stable
  set search_path = ''
as $$
  select coalesce((p_alert.details ->> 'first_notified_at')::timestamptz, p_alert.notified_at);
$$;

-- REC-16: whether an active superadmin other than p_user meets the dual-control test for this adjustment, and so keeps
-- p_user from releasing it alone. Read under the audit turn the release holds (see Lock above).
create function internal.other_eligible_superadmin(p_user uuid, p_adjustment public.payment_adjustments)
  returns boolean
  language sql stable
  set search_path = ''
as $$
  select exists (select 1 from public.profiles p
                 where p.role = 'superadmin' and p.is_active and p.id is distinct from p_user
                   and internal.approver_is_eligible(p.id, p_adjustment.proposed_by, p_adjustment.proposed_at));
$$;
revoke execute on function internal.other_eligible_superadmin(uuid, public.payment_adjustments)
  from public, anon, authenticated, service_role;

-- The latest time another superadmin stopped counting: deactivated, given another role or removed, as the profiles
-- audit rows say (20261104210300), or their MFA reset completed (REC-16); null when none ever did.
create or replace function internal.last_superadmin_drop_at(p_user uuid) returns timestamptz
  language sql stable
  set search_path = ''
as $$
  select max(l.occurred_at) from public.audit_logs l
  where l.entity_type = 'profiles' and l.entity_id is distinct from p_user::text
    and (l.action in ('profiles.update', 'profiles.delete')
         and ((l.before ->> 'role') = 'superadmin' and (l.after ->> 'role') is distinct from 'superadmin'
              or (l.before ->> 'is_active') = 'true' and (l.after ->> 'is_active') = 'false'
                 and exists (select 1 from public.profiles p where p.id::text = l.entity_id and p.role = 'superadmin'))
         or l.action = 'staff.mfa_reset_completed'
            and exists (select 1 from public.profiles p where p.id::text = l.entity_id and p.role = 'superadmin'));
$$;

-- REC-16: whether the caller releases this alert of the adjustment as the sole superadmin, which raises its own alert;
-- false for an eligible releaser who is no party to it. The caller holds the audit turn (Lock above).
create or replace function internal.release_by_sole_superadmin(p_adjustment public.payment_adjustments,
  p_alert public.security_alerts) returns boolean
  language plpgsql
  set search_path = ''
as $$
begin
  if auth.uid() is distinct from p_adjustment.proposed_by and auth.uid() is distinct from p_adjustment.approved_by
     and internal.approver_is_eligible(auth.uid(), p_adjustment.proposed_by, p_adjustment.proposed_at) then
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
