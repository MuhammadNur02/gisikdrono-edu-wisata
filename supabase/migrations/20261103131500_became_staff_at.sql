-- L77-1 of the delta review of PR #77 (docs/Security.md §5.1, §5.6; AUTH-09): whether an account ever was staff is
-- now its own column, profiles.became_staff_at, rather than a reading of role, is_active and claims_version. It is
-- set when the profile first holds a role, which after this migration happens only in accept_staff_invite or on the
-- database owner's system path (migrations, the seed, tests): set_staff_role refuses an account that never was staff
-- (20261103131300). Once set it never changes. internal.is_never_staff reads it, and reset_staff_mfa, in both its
-- stages, and issue_mfa_reenrolment_code now refuse such an account as set_staff_status and set_staff_role do.
-- Also: I77-5, the purge skips an address that has an open invite again; I77-6, held_claim takes the newest claim.

alter table public.profiles add column became_staff_at timestamptz;

-- Every profile that held a role, is active, had its claims moved on or accepted an invite was staff. The backfill
-- runs without the profile triggers: it writes no audited column and changes nobody's access.
alter table public.profiles disable trigger user;
update public.profiles p set became_staff_at = p.created_at
where p.role <> 'none' or p.is_active or p.claims_version > 1
   or exists (select 1 from public.staff_invites i where i.accepted_user_id = p.id);
alter table public.profiles enable trigger user;

grant select (became_staff_at) on public.profiles to authenticated;

-- A profile becomes staff the first time it holds a role, and stays so. Only the database owner's system path may
-- write the column itself, on insert, for a fixture of a former officer.
create function internal.profiles_became_staff() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  is_api_role boolean := coalesce(current_setting('role', true), 'none') <> 'none';
begin
  if tg_op = 'INSERT' then
    if new.became_staff_at is not null and is_api_role then
      raise exception 'became_staff_at is written by the database alone' using errcode = '42501';
    end if;
    if new.role <> 'none' then
      new.became_staff_at := coalesce(new.became_staff_at, now());
    end if;
    return new;
  end if;
  if old.became_staff_at is not null then
    new.became_staff_at := old.became_staff_at;
  elsif new.role <> 'none' then
    new.became_staff_at := now();
  elsif new.became_staff_at is not null then
    raise exception 'became_staff_at is written by the database alone' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function internal.profiles_became_staff() from public, anon, authenticated, service_role;
create trigger profiles_became_staff before insert or update on public.profiles
  for each row execute function internal.profiles_became_staff();

-- Replaces the 20261103131000 version: never staff means never became staff.
create or replace function internal.is_never_staff(p_user_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select not exists (select 1 from public.profiles p where p.id = p_user_id and p.became_staff_at is not null)
     and not exists (select 1 from public.staff_invites i where i.accepted_user_id = p_user_id);
$$;

-- Replaces the 20261103131000 version (I77-6): the newest claim, should an old one linger.
create or replace function internal.held_claim(p_user_id uuid, p_session_id uuid default null) returns uuid
  language sql stable security definer
  set search_path = ''
as $$
  select i.id from public.staff_invites i
  where i.claimed_user_id = p_user_id and (p_session_id is null or i.claimed_session_id = p_session_id)
    and i.claimed_at > now() - internal.onboarding_claim_ttl()
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  order by i.claimed_at desc
  limit 1;
$$;

-- Replaces the 20261103131400 version (I77-5): an address invited again is not a candidate at all.
create or replace function internal.purge_lapsed_invited_accounts() returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  batch constant integer := 200;
  lapsed record;
  released integer := 0;
begin
  for lapsed in
    select i.email from public.staff_invites i
    where i.accepted_at is null and (i.revoked_at is not null or i.expires_at <= now())
      and exists (select 1 from public.profiles p where p.email = i.email and internal.is_never_staff(p.id))
      and not exists (select 1 from public.staff_invites o
                      where o.email = i.email and o.accepted_at is null and o.revoked_at is null
                        and o.expires_at > now())
    group by i.email
    order by min(i.expires_at)
    limit batch
  loop
    if internal.release_invited_account(lapsed.email) is not null then
      released := released + 1;
    end if;
  end loop;
  return released;
end;
$$;

-- Replaces the 20261029080200 version: no MFA reset of an account that never was staff, in either stage.
create or replace function public.reset_staff_mfa(p_user_id uuid) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  requested_at timestamptz;
begin
  perform internal.require_superadmin_step_up();
  if p_user_id = auth.uid() then
    raise exception 'a superadmin never resets their own MFA' using errcode = '42501';
  end if;
  select p.mfa_reset_requested_at into requested_at from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception 'no staff profile %', p_user_id using errcode = 'P0002';
  end if;
  if internal.is_never_staff(p_user_id) then
    raise exception 'an invited account becomes staff only by finishing onboarding'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  if not internal.staff_change_is_due(requested_at) then
    if requested_at is null or internal.staff_change_has_lapsed(requested_at) then
      previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
      update public.profiles set mfa_reset_requested_at = now(), mfa_reset_requested_by = auth.uid() where id = p_user_id;
      perform internal.restore_settings(previous_settings);
      perform internal.record_staff_change_step(p_user_id, 'mfa_reset', 'requested');
      return internal.staff_change_requested();
    end if;
    raise exception 'this MFA reset can be completed after %', requested_at + internal.staff_change_delay()
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  delete from auth.mfa_factors where user_id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
  previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
  update public.profiles
  set mfa_reset_requested_at = null, mfa_reset_requested_by = null, claims_version = claims_version + 1,
      reenrolment_required = true
  where id = p_user_id;
  perform internal.restore_settings(previous_settings);
  perform internal.record_staff_change_step(p_user_id, 'mfa_reset', 'completed');
  return jsonb_build_object('stage', 'completed');
end;
$$;

-- Replaces the 20261029080200 version: no re-enrolment code for an account that never was staff.
create or replace function public.issue_mfa_reenrolment_code(p_user_id uuid, p_code_hash text) returns timestamptz
  language plpgsql security definer
  set search_path = ''
as $$
declare
  ttl constant interval := interval '24 hours';
  previous_settings jsonb;
  code_expires_at timestamptz := now() + ttl;
begin
  perform internal.require_superadmin_step_up();
  if p_user_id = auth.uid() then
    raise exception 'a superadmin never issues their own re-enrolment code' using errcode = '42501';
  end if;
  if coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'a re-enrolment code is stored as its keyed hash' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'no staff profile %', p_user_id using errcode = 'P0002';
  end if;
  if internal.is_never_staff(p_user_id) then
    raise exception 'an invited account becomes staff only by finishing onboarding'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.reenrolment_required)
     or internal.has_verified_factor(p_user_id) then
    raise exception 'a re-enrolment code follows a completed MFA reset only'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
  update public.profiles set mfa_reenrol_code_hash = p_code_hash, mfa_reenrol_expires_at = code_expires_at
  where id = p_user_id;
  perform internal.restore_settings(previous_settings);
  perform internal.record_reenrolment_step(p_user_id, 'reenrolment_code_issued');
  return code_expires_at;
end;
$$;
