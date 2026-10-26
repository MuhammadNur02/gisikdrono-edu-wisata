-- Lows of the security review of PR #77 (docs/Security.md §5.1, R28):
--   L1  A factor of an account that never was staff is verified only while the claiming session is the account's only
--       session: claim_staff_invite ended the others, so a session opened since (a second invite-link or
--       magic-link sign-in of the same mailbox) blocks verification instead of racing the officer's own.
--   L4  purge_lapsed_invited_accounts looks only at addresses whose account never was staff, oldest lapse first, so
--       200 addresses of staff who were re-invited never crowd out the accounts it is meant to delete.

-- Replaces the 20261103131000 version.
create or replace function internal.mfa_factor_verification_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  becomes_verified boolean := internal.factor_becomes_verified(tg_op, new.status::text,
                                                               case when tg_op = 'UPDATE' then old.status::text end);
  account record;
  claim_id uuid;
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
  if becomes_verified and internal.is_never_staff(new.user_id) then
    claim_id := internal.held_claim(new.user_id);
    if claim_id is null
       or exists (select 1 from auth.sessions s
                  where s.user_id = new.user_id
                    and s.id is distinct from (select i.claimed_session_id from public.staff_invites i
                                               where i.id = claim_id)) then
      raise exception 'an invited account verifies its authenticator only from the session that typed its invite code'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Replaces the 20261103131100 version.
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
