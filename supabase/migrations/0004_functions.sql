-- 0004_functions: RLS helpers, Auth hooks, guard triggers, internal.* primitives, views and the PII
-- RPCs (docs/PRD.md §8.5–§8.7, docs/Security.md §5–§7, Task P1.3). Grants and policies for tables
-- stay in 0005; this file grants only what its own functions need.
--
-- Definer template (Task P1.3.04): owner postgres, `set search_path = ''`, fully-qualified names, the
-- caller check as the first statement, EXECUTE revoked from public and granted on purpose. The stable
-- read-only RLS helpers are the documented exception to the caller check (CLAUDE.md §6.2).


-- ===== Contact columns that PII rules need (decision of 2026-10-16, docs/PRD.md §8.4.4) =====

-- Views run as the invoker, so a masked view cannot hide what its reader may select. The masks are
-- stored columns instead, and 0005 grants SELECT on these three while never granting the raw ones.
alter table public.bookings
  alter column pic_phone drop not null,
  alter column pic_email drop not null,
  add column pii_purged_at timestamptz,
  add column phone_masked text generated always as (
    case when pic_phone is null then null else left(pic_phone, 6) || '••••' || right(pic_phone, 2) end
  ) stored,
  add column email_masked text generated always as (
    case when pic_email is null then null
         else left(pic_email::text, 1) || '***@' || split_part(pic_email::text, '@', 2) end
  ) stored,
  add column pic_first_name text generated always as (split_part(pic_name, ' ', 1)) stored,
  -- Contact details may only be missing once the retention job has removed them.
  add constraint bookings_contact_until_purged
    check (pii_purged_at is not null or (pic_phone is not null and pic_email is not null));


-- ===== RLS helpers (docs/PRD.md §8.5.1, Task P1.3.01) =====

-- The only definer helper: it reads profiles, and an invoker version would recurse through the
-- profiles policies that call it. Stale claims (claims_version mismatch) or a deactivated profile
-- degrade to 'none', so a token outlives neither a role change nor a deactivation.
create function public.app_role() returns text
  language sql stable security definer
  set search_path = ''
as $$
  select case
    when p.id is null
      or not p.is_active
      or p.claims_version <> coalesce((auth.jwt() ->> 'claims_version')::int, -1) then 'none'
    else coalesce(auth.jwt() ->> 'app_role', 'none')
  end
  from (select 1) as once
  left join public.profiles p on p.id = auth.uid();
$$;

create function public.app_rw_id() returns smallint
  language sql stable
  set search_path = ''
as $$
  select case when public.app_role() = 'admin_rw' then nullif(auth.jwt() ->> 'app_rw_id', '')::smallint end;
$$;

create function public.is_superadmin() returns boolean
  language sql stable
  set search_path = ''
as $$ select public.app_role() = 'superadmin'; $$;

create function public.is_admin_rw() returns boolean
  language sql stable
  set search_path = ''
as $$ select public.app_role() = 'admin_rw' and public.app_rw_id() is not null; $$;

create function public.is_staff() returns boolean
  language sql stable
  set search_path = ''
as $$ select public.is_superadmin() or public.is_admin_rw(); $$;

-- A NULL rw_id marks kelurahan-level rows, which only the superadmin owns. Spelled out so the
-- helper answers false, never NULL, for an RW admin asking about a kelurahan row.
create function public.owns_rw(p_rw_id smallint) returns boolean
  language sql stable
  set search_path = ''
as $$
  select public.is_superadmin()
    or (public.is_admin_rw() and p_rw_id is not null and p_rw_id = public.app_rw_id());
$$;

create function public.owns_any_rw(p_rw_ids smallint[]) returns boolean
  language sql stable
  set search_path = ''
as $$ select public.is_superadmin() or (public.is_admin_rw() and public.app_rw_id() = any (p_rw_ids)); $$;

create function public.aal2() returns boolean
  language sql stable
  set search_path = ''
as $$ select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'; $$;

create function public.today_jkt() returns date
  language sql stable
  set search_path = ''
as $$ select (now() at time zone 'Asia/Jakarta')::date; $$;

-- Grants (CLAUDE.md §6.2): only today_jkt() serves anon policies; the rest are for staff policies.
revoke execute on function public.app_role(), public.app_rw_id(), public.is_superadmin(),
  public.is_admin_rw(), public.is_staff(), public.owns_rw(smallint), public.owns_any_rw(smallint[]),
  public.aal2(), public.today_jkt() from public;
grant execute on function public.today_jkt() to anon, authenticated;
grant execute on function public.app_role(), public.app_rw_id(), public.is_superadmin(),
  public.is_admin_rw(), public.is_staff(), public.owns_rw(smallint), public.owns_any_rw(smallint[]),
  public.aal2() to authenticated;


-- ===== Auth hooks (docs/Security.md §5.5, Task P1.3.02, P1.3.03) =====
-- Each hook is a thin wrapper that only checks the caller, over an internal.* body that holds the
-- logic. The split exists for pgTAP: tests run as postgres, which cannot become supabase_auth_admin,
-- but owns the internal functions and may call them directly.

-- Auth reads profiles while minting a token (docs/PRD.md §8.5.3 handle_new_auth_user later also
-- writes through this role); it needs its own policy and may still write nothing here.
grant select on public.profiles to supabase_auth_admin;
create policy profiles_auth_admin_read on public.profiles
  for select to supabase_auth_admin using (true);

-- The claims a staff token carries. A missing or inactive profile gets 'none', which every helper
-- above treats as "not staff".
create function internal.staff_token_claims(p_user_id uuid) returns jsonb
  language sql stable security definer
  set search_path = ''
as $$
  select case
    when p.id is null or not p.is_active
      then jsonb_build_object('app_role', 'none', 'app_rw_id', null, 'claims_version', 0)
    else jsonb_build_object('app_role', p.role::text, 'app_rw_id', p.rw_id, 'claims_version', p.claims_version)
  end
  from (select 1) as once
  left join public.profiles p on p.id = p_user_id;
$$;
revoke execute on function internal.staff_token_claims(uuid) from public, anon, authenticated;

create function public.custom_access_token_hook(event jsonb) returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
begin
  if current_user <> 'supabase_auth_admin' then
    raise exception 'custom_access_token_hook is reserved for Auth' using errcode = '42501';
  end if;
  return jsonb_set(
    event,
    '{claims}',
    coalesce(event -> 'claims', '{}'::jsonb) || internal.staff_token_claims((event ->> 'user_id')::uuid)
  );
end;
$$;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Keyed hash of an email: lower-cased and trimmed first so one address counts once, keyed with
-- OTP_PEPPER from Vault so the hash cannot be reversed by hashing guessed addresses (Security §5.5).
create function internal.hash_email(p_email text) returns text
  language sql stable security definer
  set search_path = ''
as $$
  select encode(
    extensions.hmac(
      convert_to(lower(btrim(p_email)), 'utf8'),
      convert_to((select decrypted_secret from vault.decrypted_secrets where name = 'otp_pepper'), 'utf8'),
      'sha256'
    ),
    'hex'
  );
$$;
revoke execute on function internal.hash_email(text) from public, anon, authenticated;

-- Lockout inside Auth itself, so direct token requests are covered too. Per user, never per IP
-- (CGNAT), never permanent: a 15-minute window, then it opens again on its own.
create function internal.record_login_attempt(p_user_id uuid, p_succeeded boolean) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  lockout_window constant interval := interval '15 minutes';
  failures_allowed constant integer := 5;
  rejection constant jsonb := jsonb_build_object(
    'decision', 'reject',
    'message', 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.'
  );
  earlier_failures integer;
  -- True when the window is already full, or when this failure is the one that fills it.
  is_locked boolean;
begin
  select count(*) into earlier_failures
  from public.login_attempts
  where user_id = p_user_id and not success and attempted_at > now() - lockout_window;

  is_locked := earlier_failures >= failures_allowed
    or (not p_succeeded and earlier_failures + 1 >= failures_allowed);

  -- The attempt is recorded with what the password was, so a correct guess during the lockout
  -- neither gets in nor extends the window.
  insert into public.login_attempts (user_id, email_hash, success, reason)
  values (
    p_user_id,
    internal.hash_email((select email from auth.users where id = p_user_id)),
    p_succeeded,
    case when is_locked then 'locked' when p_succeeded then 'ok' else 'bad_password' end
  );

  -- Failures are counted before the password is believed: while the window is full even the right
  -- password is refused, which is what stops a brute force from finishing (Security §5.5).
  if earlier_failures >= failures_allowed then
    return rejection;
  end if;

  if p_succeeded then
    return jsonb_build_object('decision', 'continue');
  end if;

  if is_locked then
    insert into public.security_events (event_type, severity, actor_id, details)
    values ('login_locked', 'medium', p_user_id, jsonb_build_object('failures', earlier_failures + 1));
    return rejection;
  end if;

  insert into public.security_events (event_type, severity, actor_id, details)
  values ('login_failed', 'info', p_user_id, jsonb_build_object('failures', earlier_failures + 1));

  -- The third and fourth failures slow down instead of locking out; the hook has a timeout, so 2 s
  -- is the most it ever waits.
  if earlier_failures + 1 = 3 then perform pg_sleep(1); end if;
  if earlier_failures + 1 = 4 then perform pg_sleep(2); end if;

  return jsonb_build_object('decision', 'continue');
end;
$$;
revoke execute on function internal.record_login_attempt(uuid, boolean) from public, anon, authenticated;

create function public.hook_password_verification_attempt(event jsonb) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if current_user <> 'supabase_auth_admin' then
    raise exception 'hook_password_verification_attempt is reserved for Auth' using errcode = '42501';
  end if;
  return internal.record_login_attempt(
    (event ->> 'user_id')::uuid,
    coalesce((event ->> 'valid')::boolean, false)
  );
end;
$$;
revoke execute on function public.hook_password_verification_attempt(jsonb) from public, anon, authenticated;
grant execute on function public.hook_password_verification_attempt(jsonb) to supabase_auth_admin;
