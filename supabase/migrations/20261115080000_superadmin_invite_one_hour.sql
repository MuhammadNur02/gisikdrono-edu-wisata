-- A superadmin invite opens one hour after it is made instead of 24 (decision of the owner, 2026-11-15, docs/PRD.md
-- §13.1 A31, docs/Security.md AUTH-09). The out-of-band `superadmin_invite` alerts of the request, the acceptance and
-- a revocation stay as they were, so the kelurahan head still hears of every step and has that hour to have the invite
-- revoked. A promotion to superadmin through set_staff_role and an MFA reset keep internal.staff_change_delay().
--
-- The invite code step now says when a superadmin invite opens: before the hour is up, claim_staff_invite answers
-- {claimed: false, opens_at} for the invite of the account's own address and code, so nobody sets up an authenticator
-- and a password only to be refused at the last step. Any other refusal still reads {claimed: false}.

create function internal.superadmin_invite_delay() returns interval
  language sql immutable
  set search_path = ''
as $$ select interval '1 hour'; $$;

revoke execute on function internal.superadmin_invite_delay() from public, anon, authenticated, service_role;


-- Replaces the 20261103131000 version: the superadmin invite's wait is superadmin_invite_delay().
create or replace function internal.staff_invites_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  is_privileged boolean := coalesce(current_setting('app.privileged_rpc', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.role = 'superadmin' and not is_privileged then
      raise exception 'a superadmin is invited only through invite_superadmin' using errcode = '42501';
    end if;
    if num_nonnulls(new.claimed_user_id, new.claimed_session_id, new.claimed_at) > 0 and not is_privileged then
      raise exception 'a new invite starts unclaimed' using errcode = '42501';
    end if;
    return new;
  end if;

  if (new.email, new.role, new.rw_id, new.invite_code_hash, new.created_by, new.created_at)
     is distinct from (old.email, old.role, old.rw_id, old.invite_code_hash, old.created_by, old.created_at) then
    raise exception 'an invite never changes whom it invites, as what, or who made it' using errcode = '42501';
  end if;
  if (new.claimed_user_id, new.claimed_session_id, new.claimed_at)
     is distinct from (old.claimed_user_id, old.claimed_session_id, old.claimed_at)
     and (not is_privileged or old.accepted_at is not null or old.revoked_at is not null) then
    raise exception 'an invite is claimed only by claim_staff_invite, while it is open' using errcode = '42501';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'a revoked invite stays revoked; make a new invite instead'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if old.accepted_at is null and new.accepted_at is not null then
    if new.revoked_at is not null then
      raise exception 'a revoked invite cannot be accepted' using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
    if new.role = 'superadmin' and now() < new.created_at + internal.superadmin_invite_delay() then
      raise exception 'this superadmin invite can be accepted after %',
        new.created_at + internal.superadmin_invite_delay()
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
  end if;

  if new.role = 'superadmin' and old.revoked_at is null and new.revoked_at is not null then
    perform internal.record_superadmin_invite_step(new.id, 'cancelled');
  elsif new.role = 'superadmin' and old.accepted_at is null and new.accepted_at is not null then
    perform internal.record_superadmin_invite_step(new.id, 'completed');
  end if;
  return new;
end;
$$;


-- Replaces the 0005 version: the invite answers with the hour it opens.
create or replace function public.invite_superadmin(p_email text, p_invite_code_hash text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  invite record;
begin
  perform internal.require_superadmin_step_up();
  previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
  insert into public.staff_invites (email, role, rw_id, invite_code_hash, expires_at, created_by)
  values (p_email, 'superadmin', null, p_invite_code_hash, now() + interval '72 hours', auth.uid())
  returning id, created_at, expires_at into invite;
  perform internal.restore_settings(previous_settings);
  perform internal.record_superadmin_invite_step(invite.id, 'requested');
  return jsonb_build_object('stage', 'requested', 'invite_id', invite.id,
                            'completes_after', invite.created_at + internal.superadmin_invite_delay(),
                            'lapses_after', invite.expires_at);
end;
$$;
revoke execute on function public.invite_superadmin(text, text) from public, anon, authenticated, service_role;
grant execute on function public.invite_superadmin(text, text) to authenticated;


-- Replaces the 20261103131000 version. {claimed}, or {claimed: false, opens_at} for the account's own superadmin invite
-- that has not opened yet; the code proves the invite, so its opening hour tells the caller nothing new.
create or replace function internal.claim_staff_invite(p_user_id uuid, p_session_id uuid, p_invite_code_hash text)
  returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  tries_cap constant integer := 5;
  hour_seconds constant integer := 3600;
  account_email text;
  invite record;
  previous_settings jsonb;
  sessions_ended integer;
begin
  perform internal.require_server_caller('claim_staff_invite');
  if not internal.rate_limit_hit('onboarding_claim:user:' || p_user_id::text, tries_cap, hour_seconds) then
    return internal.refuse_onboarding(p_user_id, 'claim', 'claimed');
  end if;
  select p.email into account_email from public.profiles p where p.id = p_user_id for update;
  if not found or not internal.is_never_staff(p_user_id)
     or not exists (select 1 from auth.sessions s where s.id = p_session_id and s.user_id = p_user_id) then
    return internal.refuse_onboarding(p_user_id, 'claim', 'claimed');
  end if;
  select i.id, i.role, i.created_at into invite from public.staff_invites i
  where i.invite_code_hash = p_invite_code_hash and i.email = account_email and i.accepted_at is null
    and i.revoked_at is null and i.expires_at > now()
  for update;
  if not found then
    return internal.refuse_onboarding(p_user_id, 'claim', 'claimed');
  end if;
  if invite.role = 'superadmin' and now() < invite.created_at + internal.superadmin_invite_delay() then
    return jsonb_build_object('claimed', false, 'opens_at', invite.created_at + internal.superadmin_invite_delay());
  end if;

  previous_settings := internal.push_settings(jsonb_build_object('app.privileged_rpc', 'on',
                                                                 'app.actor_id', p_user_id::text,
                                                                 'app.actor_role', 'service'));
  update public.staff_invites
  set claimed_user_id = p_user_id, claimed_session_id = p_session_id, claimed_at = now()
  where id = invite.id;
  perform internal.restore_settings(previous_settings);
  delete from auth.sessions where user_id = p_user_id and id <> p_session_id;
  get diagnostics sessions_ended = row_count;
  -- Another session of a mailbox that is only being onboarded may be someone else's (O5 of the review).
  insert into public.security_events (event_type, severity, actor_id, entity_type, entity_id, details)
  values ('invite_claimed', case when sessions_ended > 0 then 'high' else 'info' end::public.alert_severity,
          p_user_id, 'staff_invites', invite.id::text,
          jsonb_build_object('invite_id', invite.id, 'user_id', p_user_id, 'sessions_ended', sessions_ended));
  return jsonb_build_object('claimed', true);
end;
$$;
revoke execute on function internal.claim_staff_invite(uuid, uuid, text) from public, anon, authenticated, service_role;


-- Replaces the 20261103131000 version: the superadmin invite's wait is superadmin_invite_delay().
create or replace function internal.accept_staff_invite(p_user_id uuid, p_session_id uuid, p_invite_code_hash text)
  returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  tries_cap constant integer := 5;
  hour_seconds constant integer := 3600;
  account_email text;
  invite record;
  previous_settings jsonb;
begin
  perform internal.require_server_caller('accept_staff_invite');
  if not internal.rate_limit_hit('onboarding_accept:user:' || p_user_id::text, tries_cap, hour_seconds) then
    return internal.refuse_onboarding(p_user_id, 'accept', 'accepted');
  end if;
  select p.email into account_email from public.profiles p where p.id = p_user_id for update;
  if not found or not internal.is_never_staff(p_user_id) or not internal.has_exactly_one_factor(p_user_id)
     or not exists (select 1 from auth.sessions s
                    where s.id = p_session_id and s.user_id = p_user_id and s.aal::text = 'aal2') then
    return internal.refuse_onboarding(p_user_id, 'accept', 'accepted');
  end if;
  select i.id, i.role, i.rw_id, i.created_by, i.created_at into invite
  from public.staff_invites i
  where i.id = internal.held_claim(p_user_id, p_session_id)
    and i.invite_code_hash = p_invite_code_hash and i.email = account_email
  for update;
  if not found or not internal.inviter_in_good_standing(invite.created_by)
     or (invite.role = 'superadmin' and now() < invite.created_at + internal.superadmin_invite_delay()) then
    return internal.refuse_onboarding(p_user_id, 'accept', 'accepted');
  end if;

  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.privileged_rpc', 'on',
                                                                 'app.actor_id', invite.created_by::text,
                                                                 'app.actor_role', 'service'));
  update public.staff_invites set accepted_at = now(), accepted_user_id = p_user_id where id = invite.id;
  update public.profiles set role = invite.role, rw_id = invite.rw_id, is_active = true where id = p_user_id;
  update public.security_alerts set details = details || jsonb_build_object('accepted_user_id', p_user_id)
  where fingerprint = 'superadmin_invite:' || invite.id and acknowledged_at is null;
  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('role_changed', 'high', invite.created_by, invite.rw_id, 'profiles', p_user_id::text,
          jsonb_build_object('from_role', 'none', 'to_role', invite.role, 'to_rw_id', invite.rw_id,
                             'invite_id', invite.id));
  perform internal.restore_settings(previous_settings);
  -- The onboarding session ends here: the new staff member signs in afresh, with a token that carries the role.
  delete from auth.sessions where user_id = p_user_id;
  return jsonb_build_object('accepted', true, 'role', invite.role, 'rw_id', invite.rw_id);
end;
$$;
revoke execute on function internal.accept_staff_invite(uuid, uuid, text) from public, anon, authenticated, service_role;
