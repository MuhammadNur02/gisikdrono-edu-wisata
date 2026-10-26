-- Task P4.8.01 /onboarding, with the changes the security review of the onboarding design required (docs/Security.md
-- §5.1, §5.2; AUTH-09, AUTH-12, R24, R28). The invite email (supabase/templates/invite.html) only opens a session for
-- the mailbox; everything else needs the invite code the superadmin read out:
--
--   (2) claim_staff_invite, before any QR code is shown: the code binds the invite to the account and to the session
--       that typed it for 30 minutes (claimed_user_id, claimed_session_id, claimed_at), and ends the account's other
--       sessions. Five tries an hour per account, counted in the database and failing closed; every refusal is one
--       generic answer and a login_failed event.
--   (8) mfa_factor_verification_guard, extended rather than doubled: it locks the profile, refuses an account without a
--       role a second factor or any factor other than TOTP, and lets an account that never was staff verify a factor
--       only while it holds an open claim. It reads only status, user_id and factor_type of auth.mfa_factors.
--   (1, 3, 5, 7) accept_staff_invite(user, session, code): the claiming session at AAL2, exactly one verified factor,
--       the inviter still an active superadmin with their authenticator and no pending re-enrolment; it consumes the
--       code, gives the role (profiles_guard bumps claims_version) and ends every session of the account in the same
--       transaction. The app sets the password at AAL2 just before it (src/server/actions/onboarding.ts).


-- ===== The claim =====

-- No foreign key: an invite outlives the account that claimed it, which is deleted when the invite is revoked or
-- lapses (20261103131100), and the claim stays as its history.
alter table public.staff_invites
  add column claimed_user_id uuid,
  add column claimed_session_id uuid,
  add column claimed_at timestamptz,
  add constraint staff_invites_claim_whole
    check ((claimed_user_id is null) = (claimed_session_id is null) and (claimed_user_id is null) = (claimed_at is null));

create function internal.onboarding_claim_ttl() returns interval
  language sql immutable
  set search_path = ''
as $$ select interval '30 minutes'; $$;

-- An account that never was staff: no role, inactive, its claims_version never bumped, no invite accepted (the rule of
-- release_unused_profile, 20261029080300). An Auth user without a profile counts as one too, so it gets nothing.
create function internal.is_never_staff(p_user_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select not exists (select 1 from public.profiles p
                     where p.id = p_user_id and (p.role <> 'none' or p.is_active or p.claims_version > 1))
     and not exists (select 1 from public.staff_invites i where i.accepted_user_id = p_user_id);
$$;

-- The open invite the account claimed in the last 30 minutes, from p_session_id when one is named.
create function internal.held_claim(p_user_id uuid, p_session_id uuid default null) returns uuid
  language sql stable security definer
  set search_path = ''
as $$
  select i.id from public.staff_invites i
  where i.claimed_user_id = p_user_id and (p_session_id is null or i.claimed_session_id = p_session_id)
    and i.claimed_at > now() - internal.onboarding_claim_ttl()
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now();
$$;

-- One answer for every refused onboarding step, recorded against the account by id only.
create function internal.refuse_onboarding(p_user_id uuid, p_step text, p_answer_key text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
begin
  insert into public.security_events (event_type, severity, actor_id, entity_type, entity_id, details)
  values ('login_failed', 'medium', p_user_id, 'profiles', p_user_id::text,
          jsonb_build_object('reason', 'invite_code', 'step', p_step));
  return jsonb_build_object(p_answer_key, false);
end;
$$;

revoke execute on function internal.onboarding_claim_ttl(), internal.is_never_staff(uuid),
  internal.held_claim(uuid, uuid), internal.refuse_onboarding(uuid, text, text)
  from public, anon, authenticated, service_role;

-- Replaces the 20261029080200 version: who may write a claim. Only the onboarding functions, which announce
-- themselves with app.privileged_rpc, and only on an open invite.
create or replace function internal.staff_invites_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  is_privileged boolean := coalesce(current_setting('app.privileged_rpc', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.role = 'superadmin' and not is_privileged then
      raise exception 'a superadmin is invited only through invite_superadmin, which waits 24 hours'
        using errcode = '42501';
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
    if new.role = 'superadmin' and now() < new.created_at + internal.staff_change_delay() then
      raise exception 'this superadmin invite can be accepted after %', new.created_at + internal.staff_change_delay()
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

-- {claimed}. p_session_id is the session_id of the caller's verified JWT; it must be a live session of the account.
-- The invite is the one whose code hash the server made from what was typed, for the account's own address, open and
-- unexpired; claiming it again from the same or another session moves the claim there.
create function internal.claim_staff_invite(p_user_id uuid, p_session_id uuid, p_invite_code_hash text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  tries_cap constant integer := 5;
  hour_seconds constant integer := 3600;
  account_email text;
  invite_id uuid;
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
  select i.id into invite_id from public.staff_invites i
  where i.invite_code_hash = p_invite_code_hash and i.email = account_email and i.accepted_at is null
    and i.revoked_at is null and i.expires_at > now()
  for update;
  if not found then
    return internal.refuse_onboarding(p_user_id, 'claim', 'claimed');
  end if;

  previous_settings := internal.push_settings(jsonb_build_object('app.privileged_rpc', 'on',
                                                                 'app.actor_id', p_user_id::text,
                                                                 'app.actor_role', 'service'));
  update public.staff_invites
  set claimed_user_id = p_user_id, claimed_session_id = p_session_id, claimed_at = now()
  where id = invite_id;
  perform internal.restore_settings(previous_settings);
  delete from auth.sessions where user_id = p_user_id and id <> p_session_id;
  get diagnostics sessions_ended = row_count;
  -- Another session of a mailbox that is only being onboarded may be someone else's (O5 of the review).
  insert into public.security_events (event_type, severity, actor_id, entity_type, entity_id, details)
  values ('invite_claimed', case when sessions_ended > 0 then 'high' else 'info' end::public.alert_severity,
          p_user_id, 'staff_invites', invite_id::text,
          jsonb_build_object('invite_id', invite_id, 'user_id', p_user_id, 'sessions_ended', sessions_ended));
  return jsonb_build_object('claimed', true);
end;
$$;

create function public.svc_claim_staff_invite(p_user_id uuid, p_session_id uuid, p_invite_code_hash text)
  returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.claim_staff_invite(p_user_id, p_session_id, p_invite_code_hash); $$;

revoke execute on function internal.claim_staff_invite(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.svc_claim_staff_invite(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.svc_claim_staff_invite(uuid, uuid, text) to service_role;

alter table public.security_events drop constraint security_events_event_type_check;
alter table public.security_events add constraint security_events_event_type_check check (event_type in (
  'webhook_signature_invalid','webhook_amount_mismatch','status_disagreement','login_failed','login_locked',
  'mfa_failed','mfa_enrolled','scanner_invalid_signature','scanner_lockout','rate_limited','turnstile_failed',
  'upload_rejected','role_changed','staff_disabled','key_rotated','export_downloaded','pii_revealed',
  'manual_checkin','manual_backfill','undo_check_in','cron_failed','notification_dead','price_changed',
  'session_changed_with_bookings','quota_pressure','mfa_reset','notification_blocked','upload_sanitized',
  'mfa_locked','session_revoke_failed','manual_lookup','alert_self_ack_sole_superadmin','invite_claimed'));


-- ===== (8) The factor guard =====

-- Replaces the 20261029080400 version. The profile is locked first, so two factors of one account are never checked
-- side by side. The re-enrolment rule stays as it was; an account without a role (in its profile, or without a
-- profile) gets one TOTP factor at most, and one that never was staff gets it verified only under an open claim.
-- GoTrue's own /factors path meets the same rules: max_enrolled_factors = 1 and phone MFA off on every project are the
-- outer layer (go-live check #4), this the one that holds if a setting drifts.
create or replace function internal.mfa_factor_verification_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  becomes_verified boolean := internal.factor_becomes_verified(tg_op, new.status::text,
                                                               case when tg_op = 'UPDATE' then old.status::text end);
  account record;
begin
  select p.role, p.reenrolment_required, p.reenrolment_window_until into account
  from public.profiles p where p.id = new.user_id for update;

  if becomes_verified and found and account.reenrolment_required
     and (account.reenrolment_window_until is null or account.reenrolment_window_until <= now()) then
    raise exception 'a new authenticator after an MFA reset needs the superadmin''s re-enrolment code'
      using errcode = '42501';
  end if;
  if found and account.role <> 'none' then
    return new;
  end if;

  if new.factor_type::text <> 'totp' then
    raise exception 'an account without a role enrols a TOTP authenticator only' using errcode = '42501';
  end if;
  if (tg_op = 'INSERT' or becomes_verified)
     and exists (select 1 from auth.mfa_factors f where f.user_id = new.user_id and f.status = 'verified') then
    raise exception 'an account without a role keeps one authenticator' using errcode = '42501';
  end if;
  if becomes_verified and internal.is_never_staff(new.user_id) and internal.held_claim(new.user_id) is null then
    raise exception 'an invited account verifies its authenticator only after its invite code'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


-- ===== (1, 3, 5, 7) Accepting the invite =====

drop function public.svc_accept_staff_invite(uuid, text);
drop function internal.accept_staff_invite(uuid, text);

-- Whether the invite's creator may still hand out a role: an active superadmin with exactly one verified authenticator
-- and no pending re-enrolment. Deactivating, demoting or resetting them also revokes their open invites
-- (20261103131100); this holds for an acceptance already under way.
create function internal.inviter_in_good_standing(p_inviter uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select exists (select 1 from public.profiles p
                 where p.id = p_inviter and p.role = 'superadmin' and p.is_active and not p.reenrolment_required)
     and (select count(*) from auth.mfa_factors f where f.user_id = p_inviter and f.status = 'verified') = 1
     and internal.has_verified_factor(p_inviter);
$$;

-- Exactly one verified factor, and it is TOTP.
create function internal.has_exactly_one_factor(p_user_id uuid) returns boolean
  language sql stable security definer
  set search_path = ''
as $$
  select (select count(*) from auth.mfa_factors f where f.user_id = p_user_id and f.status = 'verified') = 1
     and internal.has_verified_factor(p_user_id);
$$;
revoke execute on function internal.inviter_in_good_standing(uuid), internal.has_exactly_one_factor(uuid)
  from public, anon, authenticated, service_role;

-- {accepted, role, rw_id}; every refusal reads {accepted: false}. p_session_id is the session_id of the caller's
-- verified JWT, which must be the session that claimed the invite, at AAL2 in auth.sessions. The invite's creator is
-- the actor of the change, so profiles_guard sees nobody changing their own role, and bumps claims_version.
create function internal.accept_staff_invite(p_user_id uuid, p_session_id uuid, p_invite_code_hash text) returns jsonb
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
     or (invite.role = 'superadmin' and now() < invite.created_at + internal.staff_change_delay()) then
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

create function public.svc_accept_staff_invite(p_user_id uuid, p_session_id uuid, p_invite_code_hash text)
  returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.accept_staff_invite(p_user_id, p_session_id, p_invite_code_hash); $$;

revoke execute on function internal.accept_staff_invite(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.svc_accept_staff_invite(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.svc_accept_staff_invite(uuid, uuid, text) to service_role;
