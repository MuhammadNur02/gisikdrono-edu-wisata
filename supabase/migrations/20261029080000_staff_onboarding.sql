-- Task P4.8.01, P4.8.05 and the staff follow-ups of the security review of PR #43 (docs/Security.md §5.2–§5.6;
-- AUTH-01, AUTH-09, AUTH-12, AZ-10):
--
--   M1   set_staff_role gives a role other than none only to an account with its own verified TOTP factor:
--        deactivation removes the factors, and a role given then would be an MFA reset without P4.8.05's code.
--   M2   the superadmin acknowledging the alert of a superadmin invite or promotion they made, or that names them, is
--        refused, and so is acknowledging any high or critical alert before the alert sender set notified_at, so no
--        alert is acknowledged away before it reached the out-of-band contacts.
--   L1   an acknowledged alert stays acknowledged: the policy reads acknowledged_at is null.
--   P4.8.01  handle_new_auth_user gives every new Auth user a profile without a role, inactive; accept_staff_invite
--        (service role, through svc_accept_staff_invite) consumes the invite whose code hash the onboarding form's
--        code makes, for the invited address, unexpired, unrevoked, a superadmin invite no sooner than 24 hours after
--        it was made (staff_invites_guard), and only once the account has its own verified factor.
--   P4.8.05  after an MFA reset, re-enrolment needs a one-time code from the superadmin: issue_mfa_reenrolment_code
--        stores its keyed hash for 24 hours; svc_check_mfa_reenrolment_code and svc_consume_mfa_reenrolment_code read
--        and use it for its own account only, wrong codes limited fail-closed and recorded, and its issue and use
--        raise the alert of mfa_reset.


-- ===== M1: a role needs a verified factor =====

create function internal.has_verified_factor(p_user_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (select 1 from auth.mfa_factors f
                 where f.user_id = p_user_id and f.factor_type = 'totp' and f.status = 'verified');
$$;
revoke execute on function internal.has_verified_factor(uuid) from public, anon, authenticated, service_role;

-- Replaces the 0004 version: a role other than none needs the account's own verified authenticator.
create or replace function public.set_staff_role(p_user_id uuid, p_role public.app_role, p_rw_id smallint default null)
  returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  previous record;
  is_promotion boolean;
begin
  perform internal.require_superadmin_step_up();
  if (p_role = 'admin_rw') <> (p_rw_id is not null) then
    raise exception 'an RW admin needs an RW, and only an RW admin has one' using errcode = '22023';
  end if;
  select p.role, p.rw_id, p.promotion_requested_at into previous from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception 'no staff profile %', p_user_id using errcode = 'P0002';
  end if;
  if p_role <> 'none' and not internal.has_verified_factor(p_user_id) then
    raise exception 'a role goes only to an account with its own verified authenticator'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  is_promotion := p_role = 'superadmin' and previous.role <> 'superadmin';
  if is_promotion and not internal.staff_change_is_due(previous.promotion_requested_at) then
    if previous.promotion_requested_at is null or internal.staff_change_has_lapsed(previous.promotion_requested_at) then
      previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
      update public.profiles set promotion_requested_at = now(), promotion_requested_by = auth.uid() where id = p_user_id;
      perform internal.restore_settings(previous_settings);
      perform internal.record_staff_change_step(p_user_id, 'superadmin_promotion', 'requested');
      return internal.staff_change_requested();
    end if;
    raise exception 'this promotion to superadmin can be applied after %',
      previous.promotion_requested_at + internal.staff_change_delay() using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
  update public.profiles
  set role = p_role, rw_id = p_rw_id, promotion_requested_at = null, promotion_requested_by = null
  where id = p_user_id;
  perform internal.restore_settings(previous_settings);
  delete from auth.sessions where user_id = p_user_id;

  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('role_changed', 'high', auth.uid(), coalesce(p_rw_id, previous.rw_id), 'profiles', p_user_id::text,
          jsonb_build_object('from_role', previous.role, 'to_role', p_role,
                             'from_rw_id', previous.rw_id, 'to_rw_id', p_rw_id));
  if is_promotion then
    perform internal.record_staff_change_step(p_user_id, 'superadmin_promotion', 'completed');
  end if;
  return jsonb_build_object('stage', 'applied');
end;
$$;


-- ===== M2, L1: acknowledging an alert =====

drop policy security_alerts_super_acknowledge on public.security_alerts;
create policy security_alerts_super_acknowledge on public.security_alerts for update to authenticated
  using (
    (select public.is_superadmin()) and acknowledged_at is null
    and not (severity in ('high', 'critical') and notified_at is null)
    and not (rule in ('superadmin_invite', 'superadmin_promotion')
             and (select auth.uid())::text in (coalesce(details ->> 'by', ''), coalesce(details ->> 'user_id', '')))
  )
  with check ((select public.is_superadmin()) and acknowledged_by = (select auth.uid()));


-- ===== P4.8.01: a profile for every Auth user =====

-- Deferred to the end of the transaction that created the user, so a seed or a test that writes the user and its
-- profile together keeps its own profile; an invited user signing up gets one without a role, inactive, which
-- staff_token_claims reads as no access until accept_staff_invite. Its name is the address's local part until
-- onboarding sets it: user_metadata is the user's own to rewrite, so nothing here reads it.
create function internal.handle_new_auth_user() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.email is not null then
    insert into public.profiles (id, email, full_name, role, rw_id, is_active)
    values (new.id, new.email, split_part(new.email, '@', 1), 'none', null, false)
    on conflict (id) do nothing;
  end if;
  return null;
end;
$$;
revoke execute on function internal.handle_new_auth_user() from public, anon, authenticated, service_role;
create constraint trigger handle_new_auth_user after insert on auth.users
  deferrable initially deferred
  for each row execute function internal.handle_new_auth_user();


-- ===== P4.8.01: accepting an invite =====

-- {accepted, role, rw_id}. The code's hash is made by the server from what the new staff member typed
-- (src/lib/staff-codes.ts); a wrong, expired, revoked, used or another address's code reads the same refusal. The
-- invite's creator is the actor of the change, so profiles_guard sees no one changing their own role.
create function internal.accept_staff_invite(p_user_id uuid, p_invite_code_hash text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  account record;
  invite record;
  previous_settings jsonb;
begin
  select p.id, p.email, p.role into account from public.profiles p where p.id = p_user_id for update;
  if not found or account.role <> 'none' then
    return jsonb_build_object('accepted', false);
  end if;
  select i.id, i.role, i.rw_id, i.created_by into invite
  from public.staff_invites i
  where i.invite_code_hash = p_invite_code_hash and i.email = account.email and i.accepted_at is null
    and i.revoked_at is null and i.expires_at > now()
  for update;
  if not found then
    insert into public.security_events (event_type, severity, actor_id, entity_type, entity_id, details)
    values ('login_failed', 'medium', p_user_id, 'profiles', p_user_id::text, '{"reason": "invite_code"}');
    return jsonb_build_object('accepted', false);
  end if;
  if not internal.has_verified_factor(p_user_id) then
    raise exception 'an invite is accepted once the account has its own verified authenticator'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.privileged_rpc', 'on',
                                                                 'app.actor_id', invite.created_by::text,
                                                                 'app.actor_role', 'service'));
  update public.staff_invites set accepted_at = now(), accepted_user_id = p_user_id where id = invite.id;
  update public.profiles set role = invite.role, rw_id = invite.rw_id, is_active = true where id = p_user_id;
  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('role_changed', 'high', invite.created_by, invite.rw_id, 'profiles', p_user_id::text,
          jsonb_build_object('from_role', 'none', 'to_role', invite.role, 'to_rw_id', invite.rw_id,
                             'invite_id', invite.id));
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('accepted', true, 'role', invite.role, 'rw_id', invite.rw_id);
end;
$$;
revoke execute on function internal.accept_staff_invite(uuid, text) from public, anon, authenticated, service_role;

create function public.svc_accept_staff_invite(p_user_id uuid, p_invite_code_hash text) returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.accept_staff_invite(p_user_id, p_invite_code_hash); $$;
revoke execute on function public.svc_accept_staff_invite(uuid, text) from public, anon, authenticated;
grant execute on function public.svc_accept_staff_invite(uuid, text) to service_role;


-- ===== P4.8.05: the re-enrolment code =====

alter table public.profiles add column mfa_reenrol_code_hash text,
  add column mfa_reenrol_expires_at timestamptz,
  add constraint profiles_mfa_reenrol_pair check ((mfa_reenrol_code_hash is null) = (mfa_reenrol_expires_at is null));

-- The mfa_reset alert and event of one step of a re-enrolment code (docs/Security.md §5.6).
create function internal.record_reenrolment_step(p_user_id uuid, p_stage text) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  step jsonb := jsonb_build_object('change', 'mfa_reset', 'stage', p_stage, 'user_id', p_user_id, 'by', auth.uid());
begin
  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('mfa_reset', 'critical', coalesce(auth.uid(), p_user_id),
          (select p.rw_id from public.profiles p where p.id = p_user_id), 'profiles', p_user_id::text, step);
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('mfa_reset', 'critical', 'mfa_reset:' || p_user_id,
          case p_stage when 'reenrolment_code_issued' then 'Kode pendaftaran ulang MFA diberikan'
                       else 'Kode pendaftaran ulang MFA dipakai' end, step)
  on conflict (fingerprint) where acknowledged_at is null do update
  set title = excluded.title, details = excluded.details, last_seen_at = now(),
      occurrences = public.security_alerts.occurrences + 1, notified_at = null;
end;
$$;

-- The superadmin, with a fresh code, issues the one-time code of an account left without a verified factor (an MFA
-- reset completed); the server shows the code once and keeps only its keyed hash here, for 24 hours.
create function public.issue_mfa_reenrolment_code(p_user_id uuid, p_code_hash text) returns timestamptz
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
  if internal.has_verified_factor(p_user_id) then
    raise exception 'the account still has its authenticator; reset its MFA first'
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

-- Whether p_code_hash is the account's own unexpired code. Five tries an hour per account, failing closed; a wrong
-- one is an mfa_failed event.
create function internal.check_mfa_reenrolment_code(p_user_id uuid, p_code_hash text) returns boolean
  language plpgsql
  set search_path = ''
as $$
declare
  tries_cap constant integer := 5;
  hour_seconds constant integer := 3600;
  matches boolean;
begin
  if not internal.rate_limit_hit('mfa_reenrol:user:' || p_user_id::text, tries_cap, hour_seconds) then
    return false;
  end if;
  select p.mfa_reenrol_code_hash = p_code_hash and p.mfa_reenrol_expires_at > now() into matches
  from public.profiles p where p.id = p_user_id;
  if not coalesce(matches, false) then
    insert into public.security_events (event_type, severity, actor_id, entity_type, entity_id, details)
    values ('mfa_failed', 'medium', p_user_id, 'profiles', p_user_id::text, '{"reason": "reenrolment_code"}');
    return false;
  end if;
  return true;
end;
$$;

-- Uses the code: true once, for its own account, in the request that verifies the new factor.
create function internal.consume_mfa_reenrolment_code(p_user_id uuid, p_code_hash text) returns boolean
  language plpgsql
  set search_path = ''
as $$
declare
  previous_settings jsonb;
begin
  perform 1 from public.profiles p where p.id = p_user_id for update;
  if not internal.check_mfa_reenrolment_code(p_user_id, p_code_hash) then
    return false;
  end if;
  previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
  update public.profiles set mfa_reenrol_code_hash = null, mfa_reenrol_expires_at = null where id = p_user_id;
  perform internal.restore_settings(previous_settings);
  perform internal.record_reenrolment_step(p_user_id, 'reenrolment_code_used');
  return true;
end;
$$;

revoke execute on function internal.record_reenrolment_step(uuid, text),
  internal.check_mfa_reenrolment_code(uuid, text), internal.consume_mfa_reenrolment_code(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.issue_mfa_reenrolment_code(uuid, text) from public, anon, service_role;
grant execute on function public.issue_mfa_reenrolment_code(uuid, text) to authenticated;

create function public.svc_check_mfa_reenrolment_code(p_user_id uuid, p_code_hash text) returns boolean
  language sql security definer
  set search_path = ''
as $$ select internal.check_mfa_reenrolment_code(p_user_id, p_code_hash); $$;
create function public.svc_consume_mfa_reenrolment_code(p_user_id uuid, p_code_hash text) returns boolean
  language sql security definer
  set search_path = ''
as $$ select internal.consume_mfa_reenrolment_code(p_user_id, p_code_hash); $$;
revoke execute on function public.svc_check_mfa_reenrolment_code(uuid, text),
  public.svc_consume_mfa_reenrolment_code(uuid, text) from public, anon, authenticated;
grant execute on function public.svc_check_mfa_reenrolment_code(uuid, text),
  public.svc_consume_mfa_reenrolment_code(uuid, text) to service_role;
