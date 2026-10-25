-- F-72-1 of the independent review of PR #72 (docs/Security.md §5.2, §11.2; AUTH-12, R24): an officer whose MFA reset
-- completed has no verified factor until they re-enrol with the superadmin's one-time code, and that wait is the
-- expected state, not a staff member without their authenticator. staff_factor_count therefore leaves such an
-- account alone (it already carries no role, staff_token_claims) while it has no factor at all, and a re-enrolment
-- still open seven days after the reset completed raises the medium staff_reenrolment_overdue instead, so a forgotten
-- one is followed up. Two or more verified factors stay the high staff_factor_count, waiting or not.

-- Replaces the 20261029080200 version: the waiting accounts are counted apart.
create or replace function internal.anomaly_staff(p_since timestamptz) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  lockout_spike constant integer := 3;
  batch constant integer := 200;
  reenrolment_allowance constant interval := interval '7 days';
  hit record;
  raised integer := 0;
begin
  for hit in
    select e.entity_id, e.actor_id from public.security_events e
    where e.occurred_at > p_since and e.event_type = 'role_changed' and e.details ->> 'to_role' = 'superadmin'
    limit batch
  loop
    perform internal.raise_anomaly('new_superadmin', 'critical', hit.entity_id, 'Superadmin baru',
                                   jsonb_build_object('profile_id', hit.entity_id, 'actor_id', hit.actor_id));
    raised := raised + 1;
  end loop;
  select count(*) as locks into hit from public.security_events e
  where e.occurred_at > p_since and e.event_type in ('login_locked', 'mfa_locked', 'scanner_lockout');
  if hit.locks >= lockout_spike then
    perform internal.raise_anomaly('lockout_spike', 'high', null, 'Lonjakan penguncian akun',
                                   jsonb_build_object('lockouts', hit.locks));
    raised := raised + 1;
  end if;
  for hit in
    select counted.id, counted.factors
    from (select p.id, p.reenrolment_required,
                 (select count(*) from auth.mfa_factors f
                  where f.user_id = p.id and f.factor_type = 'totp' and f.status = 'verified') as factors
          from public.profiles p
          where p.is_active and p.role <> 'none') as counted
    where counted.factors <> 1 and not (counted.reenrolment_required and counted.factors = 0)
    limit batch
  loop
    perform internal.raise_anomaly('staff_factor_count', 'high', hit.id::text, 'Staf tanpa tepat satu autentikator',
                                   jsonb_build_object('profile_id', hit.id, 'factors', hit.factors));
    raised := raised + 1;
  end loop;
  -- The wait starts when the reset completed (reset_staff_mfa) or break-glass ran; a waiting account with neither
  -- on record is followed up at once.
  for hit in
    select p.id from public.profiles p
    where p.is_active and p.role <> 'none' and p.reenrolment_required
      and not exists (select 1 from auth.mfa_factors f
                      where f.user_id = p.id and f.factor_type = 'totp' and f.status = 'verified')
      and coalesce((select max(e.occurred_at) from public.security_events e
                    where e.event_type = 'mfa_reset' and e.entity_type = 'profiles' and e.entity_id = p.id::text
                      and e.details ->> 'stage' in ('completed', 'break_glass')),
                   '-infinity') <= now() - reenrolment_allowance
    limit batch
  loop
    perform internal.raise_anomaly('staff_reenrolment_overdue', 'medium', hit.id::text,
                                   'Pendaftaran ulang MFA belum selesai setelah 7 hari',
                                   jsonb_build_object('profile_id', hit.id));
    raised := raised + 1;
  end loop;
  return raised;
end;
$$;
