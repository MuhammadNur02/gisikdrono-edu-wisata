-- Task P4.8.01, the lifecycle around /onboarding (security review of the onboarding design; docs/Security.md §5.1,
-- §5.6; AUTH-09, R28):
--
--   (4) An invite that is revoked or lapses without being accepted takes its Auth user with it, not only its factors
--       and sessions: the revoke action deletes it through the Auth admin API (svc_unused_account_of_invite names it),
--       and purge/retention deletes the accounts whose invites all lapsed (purge_lapsed_invited_accounts), in both
--       cases through release_unused_profile (20261029080300), so nothing an invited mailbox set up survives.
--   (7) Deactivating, demoting or resetting the MFA of a superadmin revokes the invites they made that are still open,
--       and releases the accounts behind them; accept_staff_invite checks the inviter again (20261103131000).
--   O2  An account that never was staff cannot change its address while it is being onboarded: the invite is bound
--       to the address the superadmin typed.


-- ===== (4) Releasing an invited account =====

-- The account behind p_email that never was staff and has no open invite left, or NULL.
create function internal.unused_invited_account(p_email extensions.citext) returns uuid
  language sql stable security definer
  set search_path = ''
as $$
  select p.id from public.profiles p
  where p.email = p_email and internal.is_never_staff(p.id)
    and not exists (select 1 from public.staff_invites i
                    where i.email = p_email and i.accepted_at is null and i.revoked_at is null
                      and i.expires_at > now());
$$;

-- Deletes that account, if there is one; release_unused_profile deletes its profile with it.
create function internal.release_invited_account(p_email extensions.citext) returns uuid
  language plpgsql security definer
  set search_path = ''
as $$
declare
  account_id uuid := internal.unused_invited_account(p_email);
begin
  if account_id is not null then
    delete from auth.users where id = account_id;
  end if;
  return account_id;
end;
$$;

-- After a revoke through /dashboard/users: the account to delete through the Auth admin API, or NULL.
create function internal.unused_account_of_invite(p_invite_id uuid) returns uuid
  language plpgsql stable
  set search_path = ''
as $$
declare
  invite_email extensions.citext;
begin
  perform internal.require_server_caller('unused_account_of_invite');
  select i.email into invite_email from public.staff_invites i
  where i.id = p_invite_id and i.accepted_at is null and i.revoked_at is not null;
  return case when invite_email is null then null else internal.unused_invited_account(invite_email) end;
end;
$$;

create function public.svc_unused_account_of_invite(p_invite_id uuid) returns uuid
  language sql security definer
  set search_path = ''
as $$ select internal.unused_account_of_invite(p_invite_id); $$;

-- purge/retention: the accounts whose invites were all revoked or lapsed, at most 200 a run. How many went.
create function internal.purge_lapsed_invited_accounts() returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  batch constant integer := 200;
  lapsed record;
  released integer := 0;
begin
  for lapsed in
    select distinct i.email from public.staff_invites i
    where i.accepted_at is null and (i.revoked_at is not null or i.expires_at <= now())
      and exists (select 1 from public.profiles p where p.email = i.email)
    limit batch
  loop
    if internal.release_invited_account(lapsed.email) is not null then
      released := released + 1;
    end if;
  end loop;
  return released;
end;
$$;

revoke execute on function internal.unused_invited_account(extensions.citext), internal.release_invited_account(extensions.citext),
  internal.unused_account_of_invite(uuid), internal.purge_lapsed_invited_accounts()
  from public, anon, authenticated, service_role;
revoke execute on function public.svc_unused_account_of_invite(uuid) from public, anon, authenticated;
grant execute on function public.svc_unused_account_of_invite(uuid) to service_role;

-- Replaces the 0007 version: purge/retention also releases the accounts of lapsed invites.
create or replace function internal.run_scheduled_job(p_job text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  advance_days integer;
begin
  if not exists (select 1 from public.job_heartbeats h where h.job = p_job and h.kind = 'database') then
    raise exception 'no database job is called %', p_job using errcode = '22023';
  end if;

  begin
    case p_job
      when 'expire_stale_bookings' then
        perform internal.expire_stale_bookings();
      when 'enqueue_visit_reminders' then
        perform internal.enqueue_visit_reminders();
      when 'close_past_bookings' then
        perform internal.close_past_bookings();
        perform internal.reconcile_session_counters();
      when 'generate_visit_sessions' then
        advance_days := (select (value #>> '{}')::integer from public.site_settings
                         where key = 'booking.max_advance_days');
        if advance_days is null then
          raise exception 'site setting booking.max_advance_days is missing'
            using errcode = 'object_not_in_prerequisite_state';
        end if;
        perform public.generate_visit_sessions(r.id, public.today_jkt(), public.today_jkt() + advance_days)
        from public.rw_units r where r.is_active;
      when 'purge/retention' then
        perform internal.purge_participants();
        perform internal.anonymise_booker_pii();
        perform internal.purge_lapsed_invited_accounts();
      when 'prune_rate_limit_buckets' then
        delete from public.rate_limit_buckets where window_start < now() - interval '1 day';
      when 'prune_operational_tables' then
        perform internal.prune_operational_tables();
      when 'check_job_responses' then
        perform internal.check_job_responses();
    end case;
    perform internal.record_job_run(p_job, true);
  exception when others then
    perform internal.record_job_run(p_job, false, sqlstate);
  end;
end;
$$;


-- ===== (7) An inviter who loses their standing =====

create function internal.revoke_invites_of_fallen_inviter() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  revoked record;
begin
  for revoked in
    update public.staff_invites set revoked_at = now()
    where created_by = new.id and accepted_at is null and revoked_at is null
    returning email
  loop
    perform internal.release_invited_account(revoked.email);
  end loop;
  return null;
end;
$$;
revoke execute on function internal.revoke_invites_of_fallen_inviter() from public, anon, authenticated, service_role;
create trigger revoke_invites_of_fallen_inviter after update on public.profiles
  for each row
  when (old.role = 'superadmin' and old.is_active
        and (new.role <> 'superadmin' or not new.is_active or (new.reenrolment_required and not old.reenrolment_required)))
  execute function internal.revoke_invites_of_fallen_inviter();


-- ===== O2: the address stays during onboarding =====

create function internal.onboarding_address_lock() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if (new.email is distinct from old.email
      or (coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change))
     and internal.is_never_staff(new.id) then
    raise exception 'an invited account keeps the address it was invited at' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function internal.onboarding_address_lock() from public, anon, authenticated, service_role;
create trigger onboarding_address_lock before update of email, email_change on auth.users
  for each row execute function internal.onboarding_address_lock();
