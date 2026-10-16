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
-- Each hook is a thin wrapper over an internal.* body that holds the logic. The split exists for
-- pgTAP: tests run as postgres, which cannot become supabase_auth_admin, but owns the internal
-- functions and may call them directly; tests/integration/auth-hooks.test.ts signs in through GoTrue.
-- Only supabase_auth_admin holds EXECUTE. Inside a definer body current_user is always the owner,
-- so the wrappers tell Auth apart by its login role, session_user.

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
  -- A second verified factor means someone else may have enrolled theirs (AUTH-12): the account carries
  -- no role until the superadmin resets its MFA.
  select case
    when p.id is null or not p.is_active
      or (select count(*) from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified') > 1
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
  if session_user <> 'supabase_auth_admin' then
    raise exception 'custom_access_token_hook is reserved for Auth' using errcode = '42501';
  end if;
  return jsonb_set(
    event,
    '{claims}',
    coalesce(event -> 'claims', '{}'::jsonb) || internal.staff_token_claims((event ->> 'user_id')::uuid)
  );
end;
$$;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated, service_role;
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
  -- Parallel guesses would otherwise all count the same earlier failures and all get through; one
  -- user's attempts take turns instead (docs/Security.md AUTH-10).
  perform pg_advisory_xact_lock(hashtext('login_attempts:' || p_user_id::text));
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

  -- The third and fourth failures slow down instead of locking out. Auth cancels a hook after 2 s,
  -- and a cancelled hook records nothing, so a longer wait would keep the count from ever reaching
  -- the lockout; the delays stay well below that limit.
  if earlier_failures + 1 = 3 then perform pg_sleep(0.5); end if;
  if earlier_failures + 1 = 4 then perform pg_sleep(1); end if;

  return jsonb_build_object('decision', 'continue');
end;
$$;
revoke execute on function internal.record_login_attempt(uuid, boolean) from public, anon, authenticated;

create function public.hook_password_verification_attempt(event jsonb) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if session_user <> 'supabase_auth_admin' then
    raise exception 'hook_password_verification_attempt is reserved for Auth' using errcode = '42501';
  end if;
  return internal.record_login_attempt(
    (event ->> 'user_id')::uuid,
    coalesce((event ->> 'valid')::boolean, false)
  );
end;
$$;
revoke execute on function public.hook_password_verification_attempt(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hook_password_verification_attempt(jsonb) to supabase_auth_admin;


-- ===== Self-escalation lock on profiles (docs/PRD.md §8.5.2–§8.5.3, Task P1.3.05) =====

-- The pending staff changes that wait 24 hours ("Delayed staff changes" below). Their timestamps decide
-- when a change may be applied, so they start NULL and only those RPCs write them (review N1).
alter table public.profiles
  add column mfa_reset_requested_at timestamptz,
  add column mfa_reset_requested_by uuid references public.profiles(id),
  add column promotion_requested_at timestamptz,
  add column promotion_requested_by uuid references public.profiles(id);

-- 0005 grants authenticated an UPDATE on full_name, phone and avatar_path only; the revoke here
-- states the intent now and costs nothing.
revoke update (role, rw_id, is_active, mfa_required, email, claims_version, mfa_reset_requested_at,
  mfa_reset_requested_by, promotion_requested_at, promotion_requested_by) on public.profiles from authenticated;

-- Who is acting: the signed-in staff member, or the actor a service-role call declared.
create function internal.current_actor_id() returns uuid
  language sql stable
  set search_path = ''
as $$
  select coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
$$;
revoke execute on function internal.current_actor_id() from public, anon, authenticated;

-- Role, RW, status, MFA flag and email move only inside set_staff_role / set_staff_status, which
-- announce themselves with app.privileged_rpc, never on the caller's own row, and never in a way
-- that leaves the kelurahan without an active superadmin. Every such change bumps claims_version,
-- so tokens minted before it stop working at the next request. The pending promotion and MFA reset
-- requests move only inside the RPCs that make, apply or cancel them, which set the same flag.
create function internal.profiles_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  is_privileged boolean := coalesce(current_setting('app.privileged_rpc', true), '') = 'on';
  protected_change boolean;
  loses_superadmin boolean;
begin
  -- A profile created outside the privileged and system paths (migrations, seed, the Auth trigger)
  -- starts without a role, so a service-role bug cannot mint staff, let alone a superadmin. No new
  -- profile starts with a pending request, whoever writes it: a backdated one would skip its wait.
  if tg_op = 'INSERT' then
    if num_nonnulls(new.mfa_reset_requested_at, new.mfa_reset_requested_by, new.promotion_requested_at,
                    new.promotion_requested_by) > 0 then
      raise exception 'a new profile starts without a pending staff change' using errcode = '42501';
    end if;
    if (new.role <> 'none' or new.rw_id is not null) and not is_privileged
       and coalesce(current_setting('role', true), 'none') <> 'none' then
      raise exception 'a new profile starts without a role; set_staff_role gives it one'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Going back would make tokens minted before a role change valid again.
  if new.claims_version < old.claims_version then
    raise exception 'claims_version never goes back' using errcode = '42501';
  end if;

  if (new.mfa_reset_requested_at, new.mfa_reset_requested_by, new.promotion_requested_at, new.promotion_requested_by)
     is distinct from (old.mfa_reset_requested_at, old.mfa_reset_requested_by, old.promotion_requested_at,
                       old.promotion_requested_by)
     and not is_privileged then
    raise exception 'promotion and MFA reset requests change only through their RPCs' using errcode = '42501';
  end if;

  protected_change := new.role is distinct from old.role
    or new.rw_id is distinct from old.rw_id
    or new.is_active is distinct from old.is_active
    or new.mfa_required is distinct from old.mfa_required
    or new.email is distinct from old.email;
  loses_superadmin := old.role = 'superadmin' and old.is_active
    and (new.role <> 'superadmin' or not new.is_active);
  if not protected_change then
    return new;
  end if;

  if not is_privileged then
    raise exception 'role, rw_id, is_active, mfa_required and email change only through set_staff_role / set_staff_status'
      using errcode = '42501';
  end if;

  if new.id = internal.current_actor_id() then
    raise exception 'a staff member cannot change their own role or status'
      using errcode = '42501';
  end if;

  -- Two superadmins removing each other at the same moment would each still see the other; taking
  -- turns makes the second one see the first change.
  if loses_superadmin then
    perform pg_advisory_xact_lock(hashtext('profiles:active_superadmins'));
    if not exists (
      select 1 from public.profiles p
      where p.role = 'superadmin' and p.is_active and p.id <> old.id
    ) then
      raise exception 'the last active superadmin cannot be demoted or deactivated'
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
  end if;

  new.claims_version := old.claims_version + 1;
  return new;
end;
$$;

create trigger profiles_guard before insert or update on public.profiles
  for each row execute function internal.profiles_guard();


-- ===== Guard triggers (docs/PRD.md §8.5.3, Task P1.3.06, P1.3.07) =====
-- Every trigger function here is security definer: a trigger runs with the privileges of whoever
-- fired it, and the API roles hold no rights on internal.* nor on the rows the guards consult. Postgres
-- itself refuses to run a trigger function outside a trigger (0A000), which is their caller check;
-- EXECUTE is still revoked at the end so nothing can even try.

-- Migrations, seed, cron and psql never SET ROLE, so the role setting reads 'none' for them and they are
-- trusted; every API request arrives through a SET ROLE, and of those only a signed-in superadmin passes
-- the superadmin-only guards. current_user cannot tell them apart inside a definer body, this can.
create function internal.is_superadmin_or_system() returns boolean
  language sql stable
  set search_path = ''
as $$
  select coalesce(current_setting('role', true), 'none') = 'none' or public.is_superadmin();
$$;
revoke execute on function internal.is_superadmin_or_system() from public, anon, authenticated;

-- rw_units_guard: an RW admin edits the public profile of their RW, never its identity or its bank
-- account.
create function internal.rw_units_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if (new.code, new.slug, new.is_active, new.treasury_bank_name, new.treasury_account_number, new.treasury_account_holder)
     is distinct from
     (old.code, old.slug, old.is_active, old.treasury_bank_name, old.treasury_account_number, old.treasury_account_holder)
     and not internal.is_superadmin_or_system() then
    raise exception 'only the superadmin changes an RW''s code, slug, status or treasury account'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger rw_units_guard before update on public.rw_units
  for each row execute function internal.rw_units_guard();

-- umkm_vendors_bank_guard: bank details are written by the superadmin only.
create function internal.umkm_vendors_bank_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  bank_touched boolean := case tg_op
    when 'INSERT' then (new.bank_name, new.bank_account_number, new.bank_account_holder) is distinct from (null, null, null)
    else (new.bank_name, new.bank_account_number, new.bank_account_holder)
         is distinct from (old.bank_name, old.bank_account_number, old.bank_account_holder)
  end;
begin
  if bank_touched and not internal.is_superadmin_or_system() then
    raise exception 'only the superadmin records a vendor''s bank account' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger umkm_vendors_bank_guard before insert or update on public.umkm_vendors
  for each row execute function internal.umkm_vendors_bank_guard();

-- products_umkm_vendor_rw_guard: a product belongs to the RW of its vendor.
create function internal.products_umkm_vendor_rw_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if not exists (select 1 from public.umkm_vendors v where v.id = new.vendor_id and v.rw_id = new.rw_id) then
    raise exception 'a product must belong to the same RW as its vendor'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return new;
end;
$$;
create trigger products_umkm_vendor_rw_guard before insert or update on public.products_umkm
  for each row execute function internal.products_umkm_vendor_rw_guard();

-- tour_packages_legs_guard: a combo is kelurahan business (superadmin only) and cannot be published
-- until it visits two different RWs; an RW package gets its single leg written for it.
create function internal.tour_packages_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  becomes_published boolean := new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published');
begin
  if new.category = 'combo' and not internal.is_superadmin_or_system() then
    raise exception 'only the superadmin creates or edits a combo package' using errcode = '42501';
  end if;

  if new.category = 'combo' and becomes_published
     and (select count(distinct l.rw_id) from public.tour_package_legs l where l.package_id = new.id) < 2 then
    raise exception 'a combo package needs legs in at least two different RWs before it is published'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return new;
end;
$$;
create trigger tour_packages_legs_guard before insert or update on public.tour_packages
  for each row execute function internal.tour_packages_guard();

create function internal.tour_packages_single_leg() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.category <> 'combo' then
    insert into public.tour_package_legs (package_id, rw_id, leg_order)
    values (new.id, new.rw_id, 1)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger tour_packages_single_leg after insert on public.tour_packages
  for each row execute function internal.tour_packages_single_leg();

-- articles_moderation_guard: only the superadmin publishes; an RW admin's edit of a live article
-- takes it back to review instead of changing what the public reads.
create function internal.articles_moderation_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  is_moderator boolean := internal.is_superadmin_or_system();
  becomes_published boolean := new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published');
begin
  if becomes_published and not is_moderator then
    raise exception 'only the superadmin publishes an article' using errcode = '42501';
  end if;

  if becomes_published then
    new.published_at := coalesce(new.published_at, now());
    new.reviewed_by := coalesce(auth.uid(), new.reviewed_by);
  end if;

  if tg_op = 'UPDATE' and old.status = 'published' and new.status = 'published' and not is_moderator
     and (new.title, new.excerpt, new.body_json, new.cover_path, new.category, new.tags, new.seo_title, new.seo_description)
         is distinct from
         (old.title, old.excerpt, old.body_json, old.cover_path, old.category, old.tags, old.seo_title, old.seo_description) then
    new.status := 'pending_review';
  end if;
  return new;
end;
$$;
create trigger articles_moderation_guard before insert or update on public.articles
  for each row execute function internal.articles_moderation_guard();

-- reviews_moderation_stamp: every moderation decision records who made it and when.
create function internal.reviews_moderation_stamp() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.moderated_by := coalesce(auth.uid(), internal.current_actor_id());
    new.moderated_at := now();
  end if;
  return new;
end;
$$;
create trigger reviews_moderation_stamp before update on public.reviews
  for each row execute function internal.reviews_moderation_stamp();

-- quotations_limit_guard: three versions at most, and none before the phone is verified.
create function internal.quotations_limit_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if not exists (select 1 from public.bookings b where b.id = new.booking_id and b.phone_verified_at is not null) then
    raise exception 'a quotation is issued only after the phone number is verified'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if (select count(*) from public.quotations q where q.booking_id = new.booking_id) >= 3 then
    raise exception 'a booking gets at most three quotation versions'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return new;
end;
$$;
create trigger quotations_limit_guard before insert on public.quotations
  for each row execute function internal.quotations_limit_guard();

-- revenue_rule_sum_guard: a rule's lines always add up to 100 %, checked at commit so a rule can be
-- written line by line.
create function internal.revenue_rule_sum_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  affected_rule uuid := coalesce(new.rule_id, old.rule_id);
  line_total numeric(7,2);
begin
  select sum(pct) into line_total from public.revenue_share_rule_lines where rule_id = affected_rule;
  if line_total is not null and line_total <> 100.00 then
    raise exception 'the shares of a revenue rule must add up to 100 %% (got %)', line_total
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return null;
end;
$$;
create constraint trigger revenue_rule_sum_guard
  after insert or update or delete on public.revenue_share_rule_lines
  deferrable initially deferred
  for each row execute function internal.revenue_rule_sum_guard();

-- revenue_rules_immutable_once_used: a rule the ledger already relied on only ever closes
-- (effective_to, is_active); its lines never change. New terms mean a new rule version.
create function internal.rule_in_use(p_rule_id uuid) returns boolean
  language sql stable
  set search_path = ''
as $$ select exists (select 1 from public.revenue_share_entries e where e.rule_id = p_rule_id); $$;
revoke execute on function internal.rule_in_use(uuid) from public, anon, authenticated;

create function internal.revenue_rules_immutable_once_used() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if not internal.rule_in_use(old.id) then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE'
     and (new.scope, new.rw_id, new.package_id, new.product_id, new.name, new.effective_from)
         is not distinct from
         (old.scope, old.rw_id, old.package_id, old.product_id, old.name, old.effective_from) then
    return new;
  end if;
  raise exception 'a revenue rule already used by the ledger cannot change; close it and create a new version'
    using errcode = 'P0001', hint = 'STATE_INVALID';
end;
$$;
create trigger revenue_rules_immutable_once_used before update or delete on public.revenue_share_rules
  for each row execute function internal.revenue_rules_immutable_once_used();

create function internal.revenue_rule_lines_immutable_once_used() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if internal.rule_in_use(old.rule_id) then
    raise exception 'the lines of a revenue rule already used by the ledger cannot change; create a new rule version'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger revenue_rule_lines_immutable_once_used before update or delete on public.revenue_share_rule_lines
  for each row execute function internal.revenue_rule_lines_immutable_once_used();

-- visit_sessions_guard: a session that holds bookings keeps its place in time and cannot vanish;
-- anything else that changes under bookings is logged for the superadmin to see.
create function internal.visit_sessions_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  has_bookings boolean;
begin

  has_bookings := old.reserved_pax > 0 or exists (
    select 1 from public.booking_legs l
    where l.visit_session_id = old.id and l.status in ('reserved', 'checked_in')
  );
  if not has_bookings then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'a session with bookings cannot be deleted' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    raise exception 'a session with bookings cannot be cancelled; move or contact the bookings first'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if (new.rw_id, new.session_date, new.start_time, new.end_time)
     is distinct from (old.rw_id, old.session_date, old.start_time, old.end_time) then
    raise exception 'a session with bookings keeps its RW, date and times'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if new.capacity < new.reserved_pax then
    raise exception 'capacity cannot go below the seats already reserved (%)', new.reserved_pax
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  if (new.label, new.notes, new.capacity) is distinct from (old.label, old.notes, old.capacity) then
    insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
    values ('session_changed_with_bookings', 'info', internal.current_actor_id(), old.rw_id, 'visit_sessions', old.id::text,
            jsonb_build_object('capacity_before', old.capacity, 'capacity_after', new.capacity, 'reserved_pax', old.reserved_pax));
  end if;
  return new;
end;
$$;
create trigger visit_sessions_guard before update or delete on public.visit_sessions
  for each row execute function internal.visit_sessions_guard();

-- Trigger functions fire without EXECUTE, so nothing is lost by revoking it from everyone.
revoke execute on function internal.profiles_guard() from public, anon, authenticated;
revoke execute on function internal.rw_units_guard() from public, anon, authenticated;
revoke execute on function internal.umkm_vendors_bank_guard() from public, anon, authenticated;
revoke execute on function internal.products_umkm_vendor_rw_guard() from public, anon, authenticated;
revoke execute on function internal.tour_packages_guard() from public, anon, authenticated;
revoke execute on function internal.tour_packages_single_leg() from public, anon, authenticated;
revoke execute on function internal.articles_moderation_guard() from public, anon, authenticated;
revoke execute on function internal.reviews_moderation_stamp() from public, anon, authenticated;
revoke execute on function internal.quotations_limit_guard() from public, anon, authenticated;
revoke execute on function internal.revenue_rule_sum_guard() from public, anon, authenticated;
revoke execute on function internal.revenue_rules_immutable_once_used() from public, anon, authenticated;
revoke execute on function internal.revenue_rule_lines_immutable_once_used() from public, anon, authenticated;
revoke execute on function internal.visit_sessions_guard() from public, anon, authenticated;


-- ===== Status fences and immutability (docs/PRD.md §8.1, §8.4.4–§8.4.6, Task P1.3.08, P1.3.09, P1.3.11) =====
-- Transition functions announce themselves with app.in_rpc = '1', apply_adjustment with
-- app.adjustment_id, and undo_check_in with app.undo_check_in = '1'. Nothing else moves a status, a
-- quota counter or settled money, whoever the caller is.

create function internal.in_rpc() returns boolean
  language sql stable
  set search_path = ''
as $$ select coalesce(current_setting('app.in_rpc', true), '') = '1'; $$;

create function internal.in_adjustment() returns boolean
  language sql stable
  set search_path = ''
as $$ select nullif(current_setting('app.adjustment_id', true), '') is not null; $$;

-- record_refund (Task P4.7.03) announces itself with app.recording_refund = '1'.
create function internal.recording_refund() returns boolean
  language sql stable
  set search_path = ''
as $$ select coalesce(current_setting('app.recording_refund', true), '') = '1'; $$;

revoke execute on function internal.in_rpc(), internal.in_adjustment(), internal.recording_refund()
  from public, anon, authenticated;

-- A function that opens a fence sets its flags with push_settings and puts the previous values back
-- with restore_settings before it returns, so a fence opened by one transition never stays open for
-- whatever else runs in the same transaction. An error needs no restore: the rollback undoes it.
create function internal.push_settings(p_settings jsonb) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  setting record;
  previous jsonb := '{}';
begin
  for setting in select key, value from jsonb_each_text(p_settings) loop
    previous := previous || jsonb_build_object(setting.key, coalesce(current_setting(setting.key, true), ''));
    perform set_config(setting.key, setting.value, true);
  end loop;
  return previous;
end;
$$;

create function internal.restore_settings(p_previous jsonb) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  setting record;
begin
  for setting in select key, value from jsonb_each_text(p_previous) loop
    perform set_config(setting.key, setting.value, true);
  end loop;
end;
$$;

revoke execute on function internal.push_settings(jsonb), internal.restore_settings(jsonb)
  from public, anon, authenticated, service_role;

-- guard_status_writes: the columns named on each trigger change only inside a transition function.
create function internal.guard_status_writes() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  fenced_column text;
  before_row jsonb := to_jsonb(old);
  after_row jsonb := to_jsonb(new);
begin
  if internal.in_rpc() then
    return new;
  end if;
  foreach fenced_column in array tg_argv loop
    if before_row -> fenced_column is distinct from after_row -> fenced_column then
      raise exception '%.% is written only by the transition functions', tg_table_name, fenced_column
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;
create trigger guard_status_writes before update on public.bookings
  for each row execute function internal.guard_status_writes('status');
create trigger guard_status_writes before update on public.payments
  for each row execute function internal.guard_status_writes('status');
create trigger guard_status_writes before update on public.tickets_qr
  for each row execute function internal.guard_status_writes('status');
create trigger guard_status_writes before update on public.certificates
  for each row execute function internal.guard_status_writes('status');
create trigger guard_status_writes before update on public.booking_legs
  for each row execute function internal.guard_status_writes('status');
create trigger guard_status_writes before update on public.visit_sessions
  for each row execute function internal.guard_status_writes('reserved_pax', 'checked_in_pax');

-- guard_status_inserts: outside a transition function a new row starts where its state machine
-- starts. Each argument names a fenced column and its starting value. A booking starts as 'quoted',
-- the one state that holds neither quota nor money.
create function internal.guard_status_inserts() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  starting_value text;
  column_name text;
  after_row jsonb := to_jsonb(new);
begin
  if internal.in_rpc() then
    return new;
  end if;
  foreach starting_value in array tg_argv loop
    column_name := split_part(starting_value, '=', 1);
    if after_row ->> column_name is distinct from split_part(starting_value, '=', 2) then
      raise exception '%.% starts at % unless a transition function writes it', tg_table_name, column_name,
        split_part(starting_value, '=', 2) using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;
create trigger guard_status_inserts before insert on public.bookings
  for each row execute function internal.guard_status_inserts('status=quoted');
create trigger guard_status_inserts before insert on public.payments
  for each row execute function internal.guard_status_inserts('status=initiated');
create trigger guard_status_inserts before insert on public.tickets_qr
  for each row execute function internal.guard_status_inserts('status=issued');
create trigger guard_status_inserts before insert on public.certificates
  for each row execute function internal.guard_status_inserts('status=issued');
create trigger guard_status_inserts before insert on public.booking_legs
  for each row execute function internal.guard_status_inserts('status=unreserved');
create trigger guard_status_inserts before insert on public.visit_sessions
  for each row execute function internal.guard_status_inserts('reserved_pax=0', 'checked_in_pax=0');

-- bookings_status_transition: even a transition function moves a booking only along the state
-- machine of docs/PRD.md §9.2. The list below is that transition table; staying in the same status
-- (a new payment attempt, a second leg checked in) is not a transition. A booking becomes refunded
-- only inside record_refund, run by a superadmin at AAL2, and only while money is held for it in a
-- settled payment, so record_refund moves the booking before it closes that payment (review N2).
create function internal.bookings_status_transition() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if (old.status::text, new.status::text) not in (
    ('quoted', 'pending_payment'), ('quoted', 'expired'), ('quoted', 'cancelled'),
    ('pending_payment', 'paid'), ('pending_payment', 'expired'), ('pending_payment', 'cancelled'),
    ('pending_payment', 'refunded'),
    ('expired', 'paid'), ('expired', 'pending_payment'),
    ('paid', 'checked_in'), ('paid', 'no_show'), ('paid', 'cancelled'), ('paid', 'refunded'),
    ('checked_in', 'completed'), ('checked_in', 'refunded'), ('checked_in', 'paid'),
    ('cancelled', 'refunded'), ('completed', 'refunded'), ('no_show', 'refunded')
  ) then
    raise exception 'a booking does not go from % to %', old.status, new.status
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if new.status = 'refunded' then
    if not (internal.recording_refund() and public.is_superadmin() and public.aal2()) then
      raise exception 'a booking becomes refunded only through record_refund, by a superadmin at AAL2'
        using errcode = '42501';
    end if;
    if not exists (select 1 from public.payments p where p.booking_id = new.id and p.status = 'settled') then
      raise exception 'a booking is refunded only while it has a settled payment'
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
  end if;
  return new;
end;
$$;
create trigger bookings_status_transition before update of status on public.bookings
  for each row execute function internal.bookings_status_transition();

-- bookings_immutable_guard: a booking keeps its identity for life, and its money once it is paid.
create function internal.bookings_immutable_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if (new.rw_ids, new.package_id, new.booking_code, new.created_at, new.consent_version)
     is distinct from (old.rw_ids, old.package_id, old.booking_code, old.created_at, old.consent_version) then
    raise exception 'rw_ids, package_id, booking_code, created_at and consent_version never change'
      using errcode = '42501';
  end if;
  if old.paid_at is not null and not internal.in_adjustment()
     and ((new.subtotal_package, new.subtotal_addons, new.discount_amount, new.total_amount, new.amount_paid,
           new.currency)
          is distinct from
          (old.subtotal_package, old.subtotal_addons, old.discount_amount, old.total_amount, old.amount_paid,
           old.currency)
          -- The note explaining a discount is free text; only the retention run may clear it.
          or (new.discount_note is distinct from old.discount_note
              and not (internal.in_purge() and new.discount_note is null))) then
    raise exception 'the money on a paid booking changes only through an approved adjustment'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return new;
end;
$$;
create trigger bookings_immutable_guard before update on public.bookings
  for each row execute function internal.bookings_immutable_guard();

-- bookings_discount_guard: a discount is the superadmin's call, and only before the money moves.
create function internal.bookings_discount_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  -- The retention run clearing the free-text note is not a discount decision.
  if internal.in_purge() and new.discount_note is null
     and new.discount_amount is not distinct from old.discount_amount then
    return new;
  end if;
  if (new.discount_amount, new.discount_note) is distinct from (old.discount_amount, old.discount_note) then
    if not internal.is_superadmin_or_system() then
      raise exception 'only the superadmin gives a discount' using errcode = '42501';
    end if;
    if old.status not in ('quoted', 'pending_payment') then
      raise exception 'a discount changes only while the booking is quoted or awaiting payment'
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
  end if;
  return new;
end;
$$;
create trigger bookings_discount_guard before update on public.bookings
  for each row execute function internal.bookings_discount_guard();

-- payments_immutable_guard: what was charged never changes; after settlement only the status and the
-- refunded amount may move, and no payment row is ever deleted.
create function internal.payments_immutable_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'payments are never deleted' using errcode = '42501';
  end if;
  if (new.gross_amount, new.order_id, new.provider, new.booking_id, new.attempt_no)
     is distinct from (old.gross_amount, old.order_id, old.provider, old.booking_id, old.attempt_no) then
    raise exception 'gross_amount, order_id, provider, booking_id and attempt_no never change'
      using errcode = '42501';
  end if;
  if old.status = 'settled' and not internal.in_adjustment()
     and (to_jsonb(new) - 'status' - 'refunded_amount' - 'updated_at')
         is distinct from (to_jsonb(old) - 'status' - 'refunded_amount' - 'updated_at') then
    raise exception 'a settled payment only changes its status and refunded amount'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return new;
end;
$$;
create trigger payments_immutable_guard before update or delete on public.payments
  for each row execute function internal.payments_immutable_guard();

-- invoices_immutable_guard: an official number and its amounts stay as issued; a paid invoice may
-- still be voided with a credit note, and an adjustment may correct it.
create function internal.invoices_immutable_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if (new.booking_id, new.invoice_number) is distinct from (old.booking_id, old.invoice_number) then
    raise exception 'booking_id and invoice_number never change' using errcode = '42501';
  end if;
  if old.paid_at is not null and not internal.in_adjustment()
     and (new.amount_due, new.amount_paid, new.paid_at, new.payment_id, new.receipt_number, new.snapshot)
         is distinct from
         (old.amount_due, old.amount_paid, old.paid_at, old.payment_id, old.receipt_number, old.snapshot) then
    raise exception 'a paid invoice changes only through an approved adjustment'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return new;
end;
$$;
create trigger invoices_immutable_guard before update on public.invoices
  for each row execute function internal.invoices_immutable_guard();

-- booking_addons_freeze: once the booking is paid, the add-on lines are what was paid for.
create function internal.booking_addons_freeze() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if exists (select 1 from public.bookings b where b.id = old.booking_id and b.paid_at is not null)
     and not internal.in_adjustment()
     and (new.booking_id, new.product_id, new.rw_id, new.vendor_id, new.product_name_snapshot,
          new.unit_price, new.qty, new.line_total)
         is distinct from
         (old.booking_id, old.product_id, old.rw_id, old.vendor_id, old.product_name_snapshot,
          old.unit_price, old.qty, old.line_total) then
    raise exception 'the add-ons of a paid booking change only through an approved adjustment'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return new;
end;
$$;
create trigger booking_addons_freeze before update on public.booking_addons
  for each row execute function internal.booking_addons_freeze();

-- tickets_require_paid_booking: a ticket needs money behind it.
create function internal.tickets_require_paid_booking() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if not exists (
       select 1 from public.bookings b where b.id = new.booking_id and b.status in ('paid', 'checked_in'))
     or not exists (
       select 1 from public.payments p where p.booking_id = new.booking_id and p.status = 'settled') then
    raise exception 'a ticket is issued only for a paid booking with a settled payment'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return new;
end;
$$;
create trigger tickets_require_paid_booking before insert on public.tickets_qr
  for each row execute function internal.tickets_require_paid_booking();

-- tickets_no_revive: a ticket that was used, revoked or expired stays that way, except that
-- undo_check_in may take a used ticket back within its own window.
create function internal.tickets_no_revive() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  undoing_check_in boolean := coalesce(current_setting('app.undo_check_in', true), '') = '1';
begin
  if (new.ticket_code, new.booking_id, new.booking_leg_id, new.rw_id)
     is distinct from (old.ticket_code, old.booking_id, old.booking_leg_id, old.rw_id) then
    raise exception 'ticket_code, booking_id, booking_leg_id and rw_id never change' using errcode = '42501';
  end if;
  if old.status in ('used', 'revoked', 'expired') and new.status = 'issued'
     and not (old.status = 'used' and undoing_check_in) then
    raise exception 'a ticket that was used, revoked or expired is not issued again'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return new;
end;
$$;
create trigger tickets_no_revive before update on public.tickets_qr
  for each row execute function internal.tickets_no_revive();

revoke execute on function internal.guard_status_writes(), internal.guard_status_inserts(),
  internal.bookings_status_transition(), internal.bookings_immutable_guard(),
  internal.bookings_discount_guard(), internal.payments_immutable_guard(), internal.invoices_immutable_guard(),
  internal.booking_addons_freeze(), internal.tickets_require_paid_booking(), internal.tickets_no_revive()
  from public, anon, authenticated;


-- ===== Append-only logs (docs/PRD.md §8.5.3, Task P1.3.10) =====
-- Logs and the ledger only ever grow. The retention functions are the one exception: they run with
-- app.purge = 'on' (docs/Security.md §7.3) and may delete old rows or blank PII inside them.

create function internal.in_purge() returns boolean
  language sql stable
  set search_path = ''
as $$ select coalesce(current_setting('app.purge', true), '') = 'on'; $$;
revoke execute on function internal.in_purge() from public, anon, authenticated;

-- The trigger arguments name the columns that may still change. A name ending in ':once' may only be
-- filled in from NULL (revenue_share_entries.payout_batch_id when a payout settles it); one ending in
-- ':cleared' may only become NULL (package_price_history.tier_id, cleared by its FK when a tier is
-- deleted).
create function internal.append_only() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  allowed text;
  column_name text;
  frozen_old jsonb;
  frozen_new jsonb;
begin
  if internal.in_purge() then
    return coalesce(new, old);
  end if;
  if tg_op = 'TRUNCATE' or tg_op = 'DELETE' then
    raise exception '% is append-only: rows are never deleted', tg_table_name using errcode = '42501';
  end if;

  frozen_old := to_jsonb(old);
  frozen_new := to_jsonb(new);
  -- tg_argv is NULL, not an empty array, when the trigger names no columns.
  foreach allowed in array coalesce(tg_argv, '{}') loop
    column_name := split_part(allowed, ':', 1);
    if frozen_old -> column_name is distinct from frozen_new -> column_name then
      if allowed like '%:once' and frozen_old -> column_name <> 'null'::jsonb then
        raise exception '%.% is set once and never changed', tg_table_name, column_name using errcode = '42501';
      end if;
      if allowed like '%:cleared' and frozen_new -> column_name <> 'null'::jsonb then
        raise exception '%.% may only be cleared', tg_table_name, column_name using errcode = '42501';
      end if;
    end if;
    frozen_old := frozen_old - column_name;
    frozen_new := frozen_new - column_name;
  end loop;

  if frozen_old is distinct from frozen_new then
    raise exception '% is append-only: only % may change', tg_table_name,
      coalesce(nullif(array_to_string(tg_argv, ', '), ''), 'nothing') using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger append_only before update or delete on public.booking_events
  for each row execute function internal.append_only();
create trigger append_only before update or delete on public.payment_events
  for each row execute function internal.append_only('processed_at', 'processing_result');
create trigger append_only before update or delete on public.webhook_rejections
  for each row execute function internal.append_only();
create trigger append_only before update or delete on public.package_price_history
  for each row execute function internal.append_only('tier_id:cleared');
create trigger append_only before update or delete on public.ticket_scans
  for each row execute function internal.append_only();
create trigger append_only before update or delete on public.revenue_share_entries
  for each row execute function internal.append_only('payout_batch_id:once');
create trigger append_only before update or delete on public.security_events
  for each row execute function internal.append_only();
create trigger append_only before update or delete on public.audit_logs
  for each row execute function internal.append_only();
create trigger append_only before update or delete on public.login_attempts
  for each row execute function internal.append_only();

-- TRUNCATE skips row triggers, so it gets a statement trigger of its own.
create trigger append_only_truncate before truncate on public.booking_events
  for each statement execute function internal.append_only();
create trigger append_only_truncate before truncate on public.payment_events
  for each statement execute function internal.append_only();
create trigger append_only_truncate before truncate on public.webhook_rejections
  for each statement execute function internal.append_only();
create trigger append_only_truncate before truncate on public.package_price_history
  for each statement execute function internal.append_only();
create trigger append_only_truncate before truncate on public.ticket_scans
  for each statement execute function internal.append_only();
create trigger append_only_truncate before truncate on public.revenue_share_entries
  for each statement execute function internal.append_only();
create trigger append_only_truncate before truncate on public.security_events
  for each statement execute function internal.append_only();
create trigger append_only_truncate before truncate on public.audit_logs
  for each statement execute function internal.append_only();
create trigger append_only_truncate before truncate on public.login_attempts
  for each statement execute function internal.append_only();
create trigger append_only_truncate before truncate on public.payment_adjustments
  for each statement execute function internal.append_only();

-- payment_adjustments: the proposal itself never changes; its workflow columns move until it is
-- applied, after which the row is final.
create function internal.payment_adjustments_append_only() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if internal.in_purge() then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'payment_adjustments are never deleted' using errcode = '42501';
  end if;
  if old.status = 'applied' then
    raise exception 'an applied adjustment is final' using errcode = '42501';
  end if;
  if (new.booking_id, new.payment_id, new.type, new.amount, new.reason, new.evidence_path, new.proposed_by, new.proposed_at)
     is distinct from
     (old.booking_id, old.payment_id, old.type, old.amount, old.reason, old.evidence_path, old.proposed_by, old.proposed_at) then
    raise exception 'the proposal of an adjustment never changes; only its approval workflow moves'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger append_only before update or delete on public.payment_adjustments
  for each row execute function internal.payment_adjustments_append_only();

-- Even the service role writes these tables only by inserting.
revoke update, delete, truncate on public.booking_events, public.payment_events, public.webhook_rejections,
  public.package_price_history, public.ticket_scans, public.revenue_share_entries, public.security_events,
  public.audit_logs, public.login_attempts, public.payment_adjustments
  from anon, authenticated, service_role;

revoke execute on function internal.append_only(), internal.payment_adjustments_append_only()
  from public, anon, authenticated;


-- ===== Hash chains (docs/Security.md §3.8, §11.1, Task P1.3.14) =====
-- Each row stores the hash of the row before it, so editing or deleting any row breaks every link
-- after it. The hash covers the whole row as canonical jsonb, with timestamps rendered in UTC so the
-- result does not depend on the session time zone. Left out: the two hash columns themselves and
-- revenue_share_entries.payout_batch_id, the one column the payout run fills in later (once).
--
-- Ids come from a sequence before triggers run, so two concurrent inserts could get ids in a different
-- order than they reach the chain. The trigger therefore takes the advisory lock first and only then
-- draws the row's id: inside the lock, id order is chain order.

create function internal.chain_hash(p_prev_hash text, p_row jsonb) returns text
  language sql immutable
  set search_path = ''
as $$
  select encode(
    extensions.digest(
      coalesce(p_prev_hash, '') || '|' || (p_row - 'prev_hash' - 'entry_hash' - 'payout_batch_id')::text,
      'sha256'
    ),
    'hex'
  );
$$;
revoke execute on function internal.chain_hash(text, jsonb) from public, anon, authenticated;

create function internal.chain_append() returns trigger
  language plpgsql security definer
  set search_path = ''
  set timezone = 'UTC'
as $$
begin
  perform pg_advisory_xact_lock(hashtext('chain:' || tg_table_name));
  new.id := nextval(pg_get_serial_sequence(format('public.%I', tg_table_name), 'id'));
  execute format('select entry_hash from public.%I order by id desc limit 1', tg_table_name)
    into new.prev_hash;
  new.entry_hash := internal.chain_hash(new.prev_hash, to_jsonb(new));
  return new;
end;
$$;
create trigger ledger_chain before insert on public.revenue_share_entries
  for each row execute function internal.chain_append();
create trigger audit_chain before insert on public.audit_logs
  for each row execute function internal.chain_append();

-- Walks the chain in id order, recomputing every hash. The first remaining row's prev_hash is
-- accepted as the anchor, because retention prunes the oldest rows (after a checkpoint).
create function internal.verify_chain(p_table text) returns jsonb
  language plpgsql stable security definer
  set search_path = ''
  set timezone = 'UTC'
as $$
declare
  link record;
  expected_prev text;
  is_first boolean := true;
  checked integer := 0;
begin
  for link in execute format('select id, prev_hash, entry_hash, to_jsonb(t) as row_data from public.%I t order by id', p_table) loop
    if (not is_first and link.prev_hash is distinct from expected_prev)
       or link.entry_hash <> internal.chain_hash(link.prev_hash, link.row_data) then
      return jsonb_build_object('ok', false, 'checked', checked, 'first_broken_id', link.id);
    end if;
    expected_prev := link.entry_hash;
    is_first := false;
    checked := checked + 1;
  end loop;
  return jsonb_build_object('ok', true, 'checked', checked, 'first_broken_id', null);
end;
$$;

create function internal.verify_ledger_chain() returns jsonb
  language sql stable
  set search_path = ''
as $$ select internal.verify_chain('revenue_share_entries'); $$;

create function internal.verify_audit_chain() returns jsonb
  language sql stable
  set search_path = ''
as $$ select internal.verify_chain('audit_logs'); $$;

revoke execute on function internal.chain_append(), internal.verify_chain(text),
  internal.verify_ledger_chain(), internal.verify_audit_chain() from public, anon, authenticated;


-- ===== Audit log (docs/PRD.md §8.5.3, docs/Security.md §6.5, §11.1, Task P1.3.13) =====

-- Who acted, in the vocabulary of audit_logs.actor_role. API requests always SET ROLE; service-role
-- code declares the real actor with app.actor_role / app.actor_id; cron, seed and psql set no role.
create function internal.current_actor_role() returns text
  language sql stable security definer
  set search_path = ''
as $$
  select case coalesce(current_setting('role', true), 'none')
    when 'authenticated' then case when public.app_role() in ('superadmin', 'admin_rw') then public.app_role() else 'anon' end
    when 'anon' then 'anon'
    when 'service_role' then coalesce(nullif(current_setting('app.actor_role', true), ''), 'service')
    else coalesce(nullif(current_setting('app.actor_role', true), ''), 'cron')
  end;
$$;
revoke execute on function internal.current_actor_role() from public, anon, authenticated;

-- The columns whose values may be copied into before/after. Anything not listed (contact details,
-- names, free text, tokens, snapshots) appears in metadata.changed_columns by name only. A column added
-- to a table later is private until someone lists it here.
create function internal.audit_columns(p_table text) returns text[]
  language sql immutable
  set search_path = ''
as $$
  select case p_table
    when 'bookings' then array['id', 'booking_code', 'status', 'channel', 'package_id', 'rw_ids', 'booker_type',
      'institution_name', 'pax_count', 'visit_date', 'visit_date_end', 'subtotal_package', 'subtotal_addons',
      'discount_amount', 'total_amount', 'amount_paid', 'currency', 'expires_at', 'quoted_at', 'paid_at',
      'checked_in_at', 'completed_at', 'cancelled_at', 'cancelled_by', 'expired_at', 'refunded_at', 'needs_review',
      'phone_verified_at', 'email_verified_at', 'consent_version', 'consented_at', 'token_version', 'created_by',
      'created_at', 'pii_purged_at']
    when 'booking_legs' then array['id', 'booking_id', 'rw_id', 'visit_session_id', 'leg_order', 'pax_count', 'status',
      'quota_reserved_at', 'quota_released_at', 'checked_in_at']
    when 'booking_participants' then array['id', 'booking_id', 'seq_no', 'group_label', 'role_label', 'created_at']
    when 'payments' then array['id', 'booking_id', 'attempt_no', 'provider', 'method', 'status', 'order_id',
      'provider_txn_id', 'gross_amount', 'payment_type_raw', 'va_bank', 'transaction_time', 'settlement_time',
      'expiry_time', 'fraud_status', 'status_code', 'manual_reference', 'recorded_by', 'refunded_amount', 'created_at']
    when 'payment_adjustments' then array['id', 'booking_id', 'payment_id', 'type', 'status', 'amount', 'reason',
      'evidence_path', 'proposed_by', 'proposed_at', 'approved_by', 'approved_at', 'rejected_reason',
      'apply_not_before', 'applied_at']
    when 'tickets_qr' then array['id', 'booking_id', 'booking_leg_id', 'rw_id', 'visit_session_id', 'ticket_code',
      'status', 'valid_on', 'valid_from', 'valid_until', 'pax_count', 'key_id', 'issued_at', 'checked_in_at',
      'checked_in_pax', 'unpaid_pax', 'checked_in_by', 'suspended_at', 'suspend_reason', 'revoked_at', 'revoked_by',
      'revoke_reason']
    when 'certificates' then array['id', 'booking_id', 'participant_id', 'kind', 'certificate_number', 'status',
      'institution_name', 'visit_date', 'rw_ids', 'template_version', 'rendered_at', 'released_at',
      'release_waived_by', 'issued_at', 'issued_by', 'revoked_at', 'revoke_reason', 'purged_at']
    when 'quotations' then array['id', 'booking_id', 'quotation_number', 'version', 'status', 'issued_at',
      'valid_until', 'issued_by']
    when 'invoices' then array['id', 'booking_id', 'invoice_number', 'status', 'issued_at', 'due_date', 'amount_due',
      'amount_paid', 'paid_at', 'payment_id', 'receipt_number', 'credit_note_number', 'void_reason', 'voided_at',
      'created_at']
    when 'tour_packages' then array['id', 'rw_id', 'category', 'slug', 'name', 'pricing_basis', 'price_per_pax',
      'flat_price', 'min_pax', 'max_pax', 'is_featured', 'status', 'sort_order', 'valid_from', 'valid_to',
      'created_by', 'updated_by', 'created_at']
    when 'products_umkm' then array['id', 'rw_id', 'vendor_id', 'slug', 'name', 'category', 'price', 'unit_label',
      'min_order_qty', 'max_order_qty', 'lead_time_days', 'is_addon_eligible', 'is_available', 'is_featured',
      'status', 'sort_order', 'created_by', 'created_at']
    when 'umkm_vendors' then array['id', 'rw_id', 'slug', 'name', 'logo_path', 'is_active', 'created_by', 'created_at']
    when 'visit_sessions' then array['id', 'rw_id', 'session_date', 'start_time', 'end_time', 'label', 'capacity',
      'reserved_pax', 'checked_in_pax', 'status', 'template_id', 'created_by', 'created_at']
    when 'session_templates' then array['id', 'rw_id', 'weekday', 'label', 'start_time', 'end_time', 'capacity',
      'is_active', 'created_at']
    when 'profiles' then array['id', 'role', 'rw_id', 'is_active', 'mfa_required', 'claims_version', 'last_login_at',
      'mfa_reset_requested_at', 'mfa_reset_requested_by', 'promotion_requested_at',
      'promotion_requested_by', 'created_by', 'created_at']
    when 'staff_invites' then array['id', 'role', 'rw_id', 'expires_at', 'accepted_at', 'accepted_user_id',
      'revoked_at', 'created_by', 'created_at']
    when 'rw_units' then array['id', 'code', 'slug', 'name', 'theme_label', 'tagline', 'hero_image_path',
      'treasury_bank_name', 'map_lat', 'map_lng', 'is_active', 'sort_order', 'created_at']
    when 'revenue_share_rules' then array['id', 'scope', 'rw_id', 'package_id', 'product_id', 'name',
      'effective_from', 'effective_to', 'is_active', 'created_by', 'created_at']
    when 'revenue_share_rule_lines' then array['id', 'rule_id', 'beneficiary', 'rw_id', 'vendor_id', 'pct']
    when 'revenue_share_entries' then array['id', 'booking_id', 'payment_id', 'adjustment_id', 'entry_type',
      'line_ref', 'booking_addon_id', 'rule_id', 'beneficiary', 'beneficiary_key', 'rw_id', 'vendor_id',
      'base_amount', 'pct', 'amount', 'payout_batch_id', 'entry_hash', 'created_at']
    when 'payout_batches' then array['id', 'beneficiary_key', 'period_from', 'period_to', 'total_amount', 'paid_at',
      'reference', 'proof_path', 'created_by', 'created_at']
    when 'site_settings' then array['key', 'value', 'is_public', 'updated_by']
    when 'reviews' then array['id', 'booking_id', 'rw_ids', 'rating', 'institution_name', 'is_anonymous', 'status',
      'is_featured', 'moderated_by', 'moderated_at', 'moderation_note', 'created_at']
    when 'articles' then array['id', 'rw_id', 'slug', 'title', 'category', 'status', 'author_id', 'reviewed_by',
      'published_at', 'created_at']
    when 'hero_banners' then array['id', 'title', 'cta_label', 'cta_href', 'image_path', 'product_id', 'sort_order',
      'is_active', 'starts_at', 'ends_at', 'created_by', 'created_at']
    else array[]::text[]
  end;
$$;
revoke execute on function internal.audit_columns(text) from public, anon, authenticated;

-- Writes one audit row with the chain hash. Staff and service-role actions must name their actor;
-- only cron, visitor and anon actions may be anonymous (docs/Security.md §6.5).
create function internal.log_audit(p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb)
  returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.write_audit_row(p_action, p_entity_type, p_entity_id, null, null, null, coalesce(p_metadata, '{}'));
end;
$$;

create function internal.write_audit_row(
  p_action text, p_entity_type text, p_entity_id text, p_rw_id smallint,
  p_before jsonb, p_after jsonb, p_metadata jsonb
) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  actor uuid := internal.current_actor_id();
  actor_role text := internal.current_actor_role();
begin
  if actor is null and actor_role not in ('cron', 'visitor', 'anon') then
    raise exception 'audit: a % action must name its actor (set app.actor_id)', actor_role using errcode = '42501';
  end if;
  insert into public.audit_logs (actor_id, actor_role, request_id, action, entity_type, entity_id, rw_id, before, after, metadata)
  values (actor, actor_role, nullif(current_setting('app.request_id', true), ''), p_action, p_entity_type, p_entity_id,
          p_rw_id, p_before, p_after, p_metadata);
end;
$$;

-- Row trigger on the audited tables. In names_only mode (the retention jobs) no value is copied at all.
create function internal.log_audit() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  allowed text[] := internal.audit_columns(tg_table_name);
  before_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  after_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  subject jsonb := coalesce(after_row, before_row);
  names_only boolean := coalesce(current_setting('app.audit_mode', true), '') = 'names_only';
  changed text[];
  kept_before jsonb;
  kept_after jsonb;
begin
  if tg_op = 'UPDATE' then
    select array_agg(column_name order by column_name) into changed
    from jsonb_object_keys(after_row) as column_name
    where before_row -> column_name is distinct from after_row -> column_name and column_name <> 'updated_at';
    if changed is null then
      return null;
    end if;
  end if;

  if not names_only then
    select jsonb_object_agg(column_name, before_row -> column_name) into kept_before
    from unnest(allowed) as column_name
    where before_row ? column_name and (changed is null or column_name = any (changed));
    select jsonb_object_agg(column_name, after_row -> column_name) into kept_after
    from unnest(allowed) as column_name
    where after_row ? column_name and (changed is null or column_name = any (changed));
  end if;

  -- Public contact numbers in site_settings are still phone numbers; their values stay out too.
  if tg_table_name = 'site_settings' and subject ->> 'key' like 'contact.%' then
    kept_before := kept_before - 'value';
    kept_after := kept_after - 'value';
  end if;

  perform internal.write_audit_row(
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(subject ->> 'id', subject ->> 'key'),
    coalesce((subject ->> 'rw_id')::smallint, (subject -> 'rw_ids' ->> 0)::smallint),
    kept_before,
    kept_after,
    jsonb_strip_nulls(jsonb_build_object('changed_columns', to_jsonb(changed), 'audit_mode', nullif(current_setting('app.audit_mode', true), '')))
  );
  return null;
end;
$$;

revoke execute on function internal.log_audit(text, text, text, jsonb),
  internal.write_audit_row(text, text, text, smallint, jsonb, jsonb, jsonb), internal.log_audit()
  from public, anon, authenticated;

do $$
declare
  audited text;
begin
  foreach audited in array array[
    'bookings', 'booking_legs', 'booking_participants', 'payments', 'payment_adjustments', 'tickets_qr',
    'certificates', 'quotations', 'invoices', 'tour_packages', 'products_umkm', 'umkm_vendors', 'visit_sessions',
    'session_templates', 'profiles', 'staff_invites', 'rw_units', 'revenue_share_rules', 'revenue_share_rule_lines',
    'revenue_share_entries', 'payout_batches', 'site_settings', 'reviews', 'articles', 'hero_banners'
  ] loop
    execute format(
      'create trigger log_audit after insert or update or delete on public.%I for each row execute function internal.log_audit()',
      audited
    );
  end loop;
end;
$$;


-- ===== Price governance (docs/PRD.md §8.4.3, docs/Security.md REC-13, Task P1.3.12) =====
-- An RW admin who drops a package to IDR 1, books it and restores the price would skim the shares of
-- the kelurahan and the RW treasury. The floor blocks the first step; the history and the
-- price_changed events let the anomaly scan see the pattern when the floor itself is not enough.

-- NULL when the setting is missing, which leaves prices unfloored; 0008_seed writes it in every
-- environment, and only the superadmin can remove it.
create function internal.price_floor() returns bigint
  language sql stable
  set search_path = ''
as $$
  select (value #>> '{}')::bigint from public.site_settings where key = 'pricing.min_price_per_pax';
$$;

-- A package pays at least the floor for every visitor it can take: price_per_pax >= floor, and a flat
-- group price >= floor × max_pax, the largest group it can be booked for (docs/Security.md REC-13). The
-- smallest group would not do: the RW admin who sets the price also sets min_pax, and min_pax = 1 would
-- let one visitor's floor cover a full bus (review M1). Only a package whose price, basis or largest
-- group is being set is checked, so raising the floor does not block unrelated edits of older packages.
create function internal.tour_packages_price_floor() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  floor_price bigint := internal.price_floor();
begin
  if tg_op = 'UPDATE'
     and (new.price_per_pax, new.flat_price, new.pricing_basis, new.max_pax)
         is not distinct from (old.price_per_pax, old.flat_price, old.pricing_basis, old.max_pax) then
    return new;
  end if;
  if new.price_per_pax < floor_price then
    raise exception 'a price per visitor may not go below IDR %', floor_price
      using errcode = 'check_violation', constraint = 'tour_packages_price_floor';
  end if;
  if new.pricing_basis = 'flat_group' and new.flat_price < floor_price * new.max_pax then
    raise exception 'a group price for up to % visitors may not go below IDR %', new.max_pax, floor_price * new.max_pax
      using errcode = 'check_violation', constraint = 'tour_packages_price_floor';
  end if;
  return new;
end;
$$;
create trigger tour_packages_price_floor
  before insert or update of price_per_pax, flat_price, pricing_basis, max_pax on public.tour_packages
  for each row execute function internal.tour_packages_price_floor();

-- A volume tier prices each visitor, so it meets the same per-visitor floor.
create function internal.tour_package_tiers_price_floor() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  floor_price bigint := internal.price_floor();
begin
  if new.price_per_pax < floor_price
     and (tg_op = 'INSERT' or new.price_per_pax is distinct from old.price_per_pax) then
    raise exception 'a price per visitor may not go below IDR %', floor_price
      using errcode = 'check_violation', constraint = 'tour_packages_price_floor';
  end if;
  return new;
end;
$$;
create trigger tour_packages_price_floor before insert or update of price_per_pax on public.tour_package_price_tiers
  for each row execute function internal.tour_package_tiers_price_floor();

-- Basis and group size change what a group pays as much as the price does, so the history keeps them
-- next to the prices (review M1).
alter table public.package_price_history
  add column old_pricing_basis public.pricing_basis,
  add column new_pricing_basis public.pricing_basis,
  add column old_min_pax integer,
  add column new_min_pax integer,
  add column old_max_pax integer,
  add column new_max_pax integer;

-- One history entry and one price_changed event. p_before and p_after hold the pricing fields of a
-- package, or the price of one tier; the event names only the fields that changed.
create function internal.record_price_change(p_package_id uuid, p_tier_id uuid, p_before jsonb, p_after jsonb)
  returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  field text;
  changed jsonb := jsonb_strip_nulls(jsonb_build_object('tier_id', p_tier_id));
begin
  insert into public.package_price_history (package_id, tier_id, changed_by, old_price_per_pax, new_price_per_pax,
    old_flat_price, new_flat_price, old_pricing_basis, new_pricing_basis, old_min_pax, new_min_pax, old_max_pax,
    new_max_pax)
  values (p_package_id, p_tier_id, internal.current_actor_id(),
          (p_before ->> 'price_per_pax')::bigint, (p_after ->> 'price_per_pax')::bigint,
          (p_before ->> 'flat_price')::bigint, (p_after ->> 'flat_price')::bigint,
          (p_before ->> 'pricing_basis')::public.pricing_basis, (p_after ->> 'pricing_basis')::public.pricing_basis,
          (p_before ->> 'min_pax')::integer, (p_after ->> 'min_pax')::integer,
          (p_before ->> 'max_pax')::integer, (p_after ->> 'max_pax')::integer);

  for field in select jsonb_object_keys(p_before || p_after) loop
    if p_before -> field is distinct from p_after -> field then
      changed := changed || jsonb_strip_nulls(jsonb_build_object('old_' || field, p_before -> field,
                                                                 'new_' || field, p_after -> field));
    end if;
  end loop;

  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('price_changed', 'info', internal.current_actor_id(),
          (select p.rw_id from public.tour_packages p where p.id = p_package_id), 'tour_packages', p_package_id::text,
          changed);
end;
$$;

-- tour_packages_price_history: every change of what a package charges, its basis and group size
-- included, is an entry plus a price_changed event. The first price is in audit_logs; leaving it out
-- here keeps a draft that was never repriced deletable, since a history entry holds its package.
create function internal.tour_packages_price_history() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if (new.price_per_pax, new.flat_price, new.pricing_basis, new.min_pax, new.max_pax)
     is not distinct from (old.price_per_pax, old.flat_price, old.pricing_basis, old.min_pax, old.max_pax) then
    return null;
  end if;
  perform internal.record_price_change(new.id, null,
    jsonb_build_object('price_per_pax', old.price_per_pax, 'flat_price', old.flat_price,
                       'pricing_basis', old.pricing_basis, 'min_pax', old.min_pax, 'max_pax', old.max_pax),
    jsonb_build_object('price_per_pax', new.price_per_pax, 'flat_price', new.flat_price,
                       'pricing_basis', new.pricing_basis, 'min_pax', new.min_pax, 'max_pax', new.max_pax));
  return null;
end;
$$;
create trigger tour_packages_price_history
  after update of price_per_pax, flat_price, pricing_basis, min_pax, max_pax on public.tour_packages
  for each row execute function internal.tour_packages_price_history();

-- Adding, repricing or removing a tier changes what some groups pay, so each is a price change.
-- A removed tier no longer exists for the entry to point at; its FK clears the older entries too.
create function internal.tour_package_tiers_price_history() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.price_per_pax is not distinct from old.price_per_pax then
    return null;
  end if;
  perform internal.record_price_change(coalesce(new.package_id, old.package_id),
                                       case when tg_op <> 'DELETE' then new.id end,
                                       jsonb_build_object('price_per_pax', old.price_per_pax),
                                       jsonb_build_object('price_per_pax', new.price_per_pax));
  return null;
end;
$$;
create trigger tour_packages_price_history after insert or update of price_per_pax or delete
  on public.tour_package_price_tiers
  for each row execute function internal.tour_package_tiers_price_history();

-- package_price_history needs a package, so a product's price change is recorded as a price_changed
-- event; its before and after values are in audit_logs.
create function internal.products_umkm_price_changed() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.price is distinct from old.price then
    insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
    values ('price_changed', 'info', internal.current_actor_id(), new.rw_id, 'products_umkm', new.id::text,
            jsonb_build_object('old_price', old.price, 'new_price', new.price));
  end if;
  return null;
end;
$$;
create trigger products_umkm_price_changed after update of price on public.products_umkm
  for each row execute function internal.products_umkm_price_changed();

revoke execute on function internal.price_floor(), internal.tour_packages_price_floor(),
  internal.tour_package_tiers_price_floor(),
  internal.record_price_change(uuid, uuid, jsonb, jsonb),
  internal.tour_packages_price_history(), internal.tour_package_tiers_price_history(),
  internal.products_umkm_price_changed()
  from public, anon, authenticated;


-- ===== Quota, document numbers, rate limits (docs/PRD.md §8.7, Task P1.3.15–P1.3.17) =====

-- Takes p_pax seats of an open session or raises QUOTA_UNAVAILABLE. The conditional UPDATE locks the
-- session row, and a booking racing for the same session waits and then re-checks the room that is
-- left, so the counter never passes capacity. A caller reserving several legs calls this in
-- visit_session_id order, the order release_booking_quota uses too, so two bookings never wait on
-- each other in a cycle (BOOK-01).
create function internal.reserve_session_quota(p_session_id uuid, p_pax integer) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
begin
  if p_pax is null or p_pax < 1 then
    raise exception 'a reservation needs at least one visitor' using errcode = '22023';
  end if;

  previous_settings := internal.push_settings('{"app.in_rpc": "1"}');
  update public.visit_sessions
  set reserved_pax = reserved_pax + p_pax
  where id = p_session_id and status = 'open' and reserved_pax + p_pax <= capacity;
  if not found then
    raise exception 'session % has no room for % more visitors', p_session_id, p_pax
      using errcode = 'P0001', hint = 'QUOTA_UNAVAILABLE';
  end if;
  perform internal.restore_settings(previous_settings);
end;
$$;

-- Gives back the seats of every reserved leg of a booking. A leg is released once: its
-- quota_released_at stamp makes a second call (a late webhook, a retried job) a no-op. A counter that
-- has already lost those seats (drift) is not pushed below zero, which its CHECK would refuse and so
-- fail the whole release; it is floored at zero and logged as quota.drift for a person to look at.
create function internal.release_booking_quota(p_booking_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  leg record;
  stored integer;
begin
  previous_settings := internal.push_settings('{"app.in_rpc": "1"}');
  for leg in
    select l.id, l.visit_session_id, l.pax_count
    from public.booking_legs l
    where l.booking_id = p_booking_id and l.status = 'reserved' and l.quota_released_at is null
    order by l.visit_session_id
    for update
  loop
    select s.reserved_pax into stored from public.visit_sessions s where s.id = leg.visit_session_id for update;
    if stored < leg.pax_count then
      perform internal.log_audit('quota.drift', 'visit_sessions', leg.visit_session_id::text,
        jsonb_build_object('stored', stored, 'released', leg.pax_count, 'corrected', true,
                           'source', 'release_booking_quota'));
    end if;
    update public.visit_sessions set reserved_pax = greatest(stored - leg.pax_count, 0) where id = leg.visit_session_id;
    update public.booking_legs set status = 'released', quota_released_at = now() where id = leg.id;
  end loop;
  perform internal.restore_settings(previous_settings);
end;
$$;

-- The next gapless number of a document kind (docs/PRD.md Appendix C). The upsert locks the period's
-- counter row until the caller's transaction ends, and a rollback takes the number back with it, so
-- numbers are never skipped or reused. The period follows the Jakarta calendar.
create function internal.next_document_number(p_kind public.document_kind, p_at timestamptz) returns text
  language plpgsql security definer
  set search_path = ''
as $$
declare
  is_monthly boolean := p_kind in ('quotation', 'invoice', 'receipt');
  counter_period text := to_char(p_at at time zone 'Asia/Jakarta', case when is_monthly then 'YYYY-MM' else 'YYYY' end);
  digits integer := case when p_kind = 'certificate' then 5 else 4 end;
  prefix text := case p_kind
    when 'quotation' then 'SP'
    when 'invoice' then 'INV'
    when 'receipt' then 'KW'
    when 'credit_note' then 'CN'
    when 'certificate' then 'SERT'
  end;
  number integer;
begin
  if p_at is null then
    raise exception 'a document number needs the time it is issued' using errcode = '22004';
  end if;

  insert into public.document_sequences as sequence (kind, period, last_value)
  values (p_kind, counter_period, 1)
  on conflict (kind, period) do update set last_value = sequence.last_value + 1
  returning sequence.last_value into number;

  -- A period that outgrows its digits keeps counting rather than wrapping.
  return prefix || '/GSK/' || replace(counter_period, '-', '/') || '/'
    || lpad(number::text, greatest(digits, length(number::text)), '0');
end;
$$;

-- Counts one hit for p_key in the current fixed window and says whether the caller is still within
-- p_limit. Keys name the subject by id or keyed hash, never by a raw phone number or email.
create function internal.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer) returns boolean
  language plpgsql security definer
  set search_path = ''
as $$
declare
  current_window timestamptz;
  hits integer;
begin
  if p_window_seconds is null or p_window_seconds < 1 or p_limit is null or p_limit < 0 then
    raise exception 'a rate limit needs a positive window and a limit' using errcode = '22023';
  end if;

  current_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_buckets as bucket (key, window_start, count)
  values (p_key, current_window, 1)
  on conflict (key, window_start) do update set count = bucket.count + 1
  returning bucket.count into hits;
  return hits <= p_limit;
end;
$$;

revoke execute on function internal.reserve_session_quota(uuid, integer), internal.release_booking_quota(uuid),
  internal.next_document_number(public.document_kind, timestamptz), internal.rate_limit_hit(text, integer, integer)
  from public, anon, authenticated;


-- ===== Notification outbox (docs/PRD.md §8.7, docs/Security.md GUEST-07, GUEST-08, Task P1.3.25) =====

-- Why an outbox message's text is refused, or NULL when it is fine: a link in any form, a host
-- (name.tld) or an IPv4 address in params or recipient_name, or a link_scope outside the five the worker
-- knows. Messages go out from the kelurahan's own number and the worker mints every link itself.
-- Indonesian academic and honorific titles written with dots (S.Pd., M.Sc, Dr., Univ.Diponegoro) are
-- set aside first, unless a dot, letter or slash carries on from them, so "s.pd.com" or
-- "univ.gisik-bayar.top" still counts as a host. The title list is kept in step with ACADEMIC_TITLE in
-- src/lib/validations/free-text.ts, which checks the same text when a visitor types it.
create function internal.refused_notification_text(p_params jsonb, p_recipient_name text) returns text
  language plpgsql immutable
  set search_path = ''
as $$
declare
  title_pattern constant text := '(?<![[:alnum:].-])((s\.(pd\.i|pd|si|ag|kom|t|h|e|sos|ip|ked|psi|farm|kep|hum|ak|pt|tr|gz)'
    || '|m\.(pd\.i|pd|si|sc|kom|m|t|h|kes|ag|hum|psi|ak|eng)|b\.sc|a\.md|ph\.d)\M(?!\.?[[:alnum:]/:])\.?'
    || '|(dr|dra|drs|ir|prof|univ|hj|kh|st|h)\.(?![/:]))';
  link_pattern constant text := '(://|www\.|javascript:|data:|\m[[:alnum:]-]+\.[[:alpha:]]{2,}\M'
    || '|\m((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\M)';
begin
  if regexp_replace(p_params::text, title_pattern, ' ', 'gi') ~* link_pattern then
    return 'params_link';
  elsif regexp_replace(coalesce(p_recipient_name, ''), title_pattern, ' ', 'gi') ~* link_pattern then
    return 'recipient_name_link';
  elsif p_params ? 'link_scope'
        and p_params ->> 'link_scope' not in ('pay', 'manage', 'view', 'review', 'certificate') then
    return 'unknown_link_scope';
  end if;
  return null;
end;
$$;

-- notifications_guest_guard: the backstop for any outbox row, including ones written without
-- enqueue_notification, on insert and whenever its routing, text or status change. A booking's message
-- goes only to that booking's own contact; WhatsApp only once the number is verified (the OTP that
-- verifies it excepted); an unconfirmed email address gets view links only. Refused text never fails
-- the transaction that queues the message, since a payment may be committing in it: the message is
-- held as cancelled, with the reason in last_error_code, and reported as notification_blocked; it stays
-- cancelled until its text is clean. The recipient is checked again only when the routing changes, so
-- emptying old params during the prune still works after a booking's contact has changed.
create function internal.notifications_guest_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  refusal text := internal.refused_notification_text(new.params, new.recipient_name);
  booking record;
  is_new_route boolean := tg_op = 'INSERT'
    or (new.booking_id, new.channel, new.template, new.recipient)
       is distinct from (old.booking_id, old.channel, old.template, old.recipient);
begin
  if refusal is not null then
    new.status := 'cancelled';
    new.last_error_code := 'blocked_' || refusal;
    new.last_error := 'held by notifications_guest_guard: the message text was refused';
    if tg_op = 'INSERT' or old.last_error_code is distinct from new.last_error_code then
      insert into public.security_events (event_type, severity, entity_type, entity_id, details)
      values ('notification_blocked', 'medium', 'notifications', new.id::text,
              jsonb_build_object('reason', refusal, 'template', new.template, 'channel', new.channel,
                                 'booking_id', new.booking_id));
    end if;
  end if;
  if new.booking_id is null then
    return new;
  end if;

  select b.pic_phone, b.pic_email, b.phone_verified_at, b.email_verified_at into booking
  from public.bookings b where b.id = new.booking_id;
  if is_new_route then
    if new.recipient is distinct from (case new.channel when 'whatsapp' then booking.pic_phone else booking.pic_email end) then
      raise exception 'a booking''s message goes only to that booking''s own contact' using errcode = '42501';
    end if;
    if new.channel = 'whatsapp' and new.template <> 'phone_otp' and booking.phone_verified_at is null then
      raise exception 'WhatsApp goes only to a verified number' using errcode = '42501';
    end if;
  end if;
  if new.channel = 'email' and booking.email_verified_at is null and new.params ? 'link_scope' then
    new.params := jsonb_set(new.params, '{link_scope}', '"view"');
  end if;
  return new;
end;
$$;
create trigger notifications_guest_guard
  before insert or update of booking_id, channel, template, recipient, recipient_name, params, status
  on public.notifications
  for each row execute function internal.notifications_guest_guard();

-- Queues one message about a booking for the outbox worker and returns its id. The recipient always
-- comes from the booking itself. Returns NULL instead of queueing when WhatsApp would go to an
-- unverified number (GUEST-08) or when the contact has been anonymised; a repeat of the same
-- template on the same channel returns the row already queued.
create function internal.enqueue_notification(
  p_booking_id uuid, p_template public.notification_template, p_channel public.notification_channel, p_params jsonb
) returns uuid
  language plpgsql security definer
  set search_path = ''
as $$
declare
  booking record;
  recipient text;
  dedupe text := format('booking:%s:%s:%s', p_booking_id, p_template, p_channel);
  notification_id uuid;
begin
  select b.pic_phone, b.pic_email, b.pic_first_name, b.phone_verified_at into booking
  from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;

  if p_channel = 'whatsapp' and p_template <> 'phone_otp' and booking.phone_verified_at is null then
    return null;
  end if;
  recipient := case p_channel when 'whatsapp' then booking.pic_phone else booking.pic_email end;
  if recipient is null then
    return null;
  end if;

  insert into public.notifications (booking_id, channel, template, recipient, recipient_name, params, dedupe_key)
  values (p_booking_id, p_channel, p_template, recipient, booking.pic_first_name, coalesce(p_params, '{}'), dedupe)
  on conflict (dedupe_key) do nothing
  returning id into notification_id;
  if notification_id is null then
    select n.id into notification_id from public.notifications n where n.dedupe_key = dedupe;
  end if;
  return notification_id;
end;
$$;

revoke execute on function internal.refused_notification_text(jsonb, text), internal.notifications_guest_guard(),
  internal.enqueue_notification(uuid, public.notification_template, public.notification_channel, jsonb)
  from public, anon, authenticated;


-- ===== Scheduled jobs (docs/PRD.md §8.7, §8.9, Task P1.3.18) =====
-- Scheduled work belongs to no person. pg_cron runs it as postgres and the job routes run it as the
-- service role; either way it is logged as cron, and like any transition it may move statuses and
-- counters. Each run is its own transaction, so the settings below end with it.

create function internal.begin_scheduled_job() returns jsonb
  language plpgsql
  set search_path = ''
as $$
begin
  return internal.push_settings('{"app.actor_role": "cron", "app.in_rpc": "1"}');
end;
$$;

-- An unpaid hold expires five minutes after its deadline, leaving a late Midtrans notification time
-- to land first; a quotation expires the day after its validity. Rows another worker holds are
-- skipped and picked up by the next run.
create function internal.expire_stale_bookings() returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  quotation_days integer := (select (value #>> '{}')::integer from public.site_settings
                             where key = 'booking.quotation_valid_days');
  stale record;
  expired_count integer := 0;
begin
  previous_settings := internal.begin_scheduled_job();
  for stale in
    select b.id, b.status
    from public.bookings b
    where (b.status = 'pending_payment' and b.expires_at < now() - interval '5 minutes')
       or (b.status = 'quoted' and coalesce(
             (select max(q.valid_until) from public.quotations q where q.booking_id = b.id and q.status = 'issued'),
             (b.created_at at time zone 'Asia/Jakarta')::date + quotation_days
           ) < public.today_jkt())
    order by b.id
    for update skip locked
  loop
    -- One booking that fails must not keep every other hold from expiring: it is rolled back on its
    -- own, reported as cron_failed, and tried again on the next run.
    begin
      update public.bookings set status = 'expired', expired_at = now() where id = stale.id;
      perform internal.release_booking_quota(stale.id);
      update public.payments set status = 'expired' where booking_id = stale.id and status in ('initiated', 'pending');
      update public.quotations set status = 'expired' where booking_id = stale.id and status = 'issued';
      insert into public.booking_events (booking_id, from_status, to_status, actor_type, reason)
      values (stale.id, stale.status, 'expired', 'cron',
              case when stale.status = 'quoted' then 'quotation_lapsed' else 'hold_lapsed' end);
      perform internal.enqueue_notification(stale.id, 'booking_expired', 'whatsapp', '{}');
      perform internal.enqueue_notification(stale.id, 'booking_expired', 'email', '{}');
      expired_count := expired_count + 1;
    exception when others then
      insert into public.security_events (event_type, severity, entity_type, entity_id, details)
      values ('cron_failed', 'high', 'bookings', stale.id::text,
              jsonb_build_object('job', 'expire_stale_bookings', 'sqlstate', sqlstate));
    end;
  end loop;
  perform internal.restore_settings(previous_settings);
  return expired_count;
end;
$$;

-- After the last visit day: a group that came is completed and invited to review; a paid group that
-- never showed up is a no-show. Tickets past their window stop scanning.
create function internal.close_past_bookings() returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  past record;
  next_status public.booking_status;
  closed_count integer := 0;
begin
  previous_settings := internal.begin_scheduled_job();
  for past in
    select b.id, b.status
    from public.bookings b
    where b.status in ('checked_in', 'paid') and b.visit_date_end < public.today_jkt()
    order by b.id
    for update skip locked
  loop
    if past.status = 'checked_in' then
      next_status := 'completed';
      update public.bookings set status = next_status, completed_at = now() where id = past.id;
      perform internal.enqueue_notification(past.id, 'review_invite', 'whatsapp', '{"link_scope": "review"}');
      perform internal.enqueue_notification(past.id, 'review_invite', 'email', '{"link_scope": "review"}');
    else
      next_status := 'no_show';
      update public.bookings set status = next_status where id = past.id;
    end if;
    insert into public.booking_events (booking_id, from_status, to_status, actor_type)
    values (past.id, past.status, next_status, 'cron');
    closed_count := closed_count + 1;
  end loop;

  update public.tickets_qr set status = 'expired' where status = 'issued' and valid_until < now();
  perform internal.restore_settings(previous_settings);
  return closed_count;
end;
$$;

create function internal.enqueue_visit_reminders() returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  due record;
  reminded_count integer := 0;
begin
  previous_settings := internal.begin_scheduled_job();
  for due in
    select distinct b.id
    from public.bookings b
    join public.booking_legs l on l.booking_id = b.id
    join public.visit_sessions s on s.id = l.visit_session_id
    where b.status = 'paid' and s.session_date = public.today_jkt() + 1
  loop
    perform internal.enqueue_notification(due.id, 'visit_reminder_d1', 'whatsapp', '{"link_scope": "view"}');
    perform internal.enqueue_notification(due.id, 'visit_reminder_d1', 'email', '{"link_scope": "view"}');
    reminded_count := reminded_count + 1;
  end loop;
  perform internal.restore_settings(previous_settings);
  return reminded_count;
end;
$$;

-- Compares each upcoming session's counter with the seats its legs actually hold. A counter that is
-- too high is corrected, since it only turns visitors away; one that is too low is left for a person
-- to look at, because raising it could push a session past capacity. Both are logged as quota.drift.
create function internal.reconcile_session_counters() returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  upcoming record;
  stored integer;
  held integer;
  drift_count integer := 0;
begin
  previous_settings := internal.begin_scheduled_job();
  for upcoming in
    select s.id from public.visit_sessions s where s.session_date >= public.today_jkt() order by s.id
  loop
    select s.reserved_pax into stored from public.visit_sessions s where s.id = upcoming.id for update;
    select coalesce(sum(l.pax_count), 0) into held
    from public.booking_legs l
    where l.visit_session_id = upcoming.id and l.status in ('reserved', 'checked_in');
    continue when stored = held;

    if stored > held then
      update public.visit_sessions set reserved_pax = held where id = upcoming.id;
    end if;
    perform internal.log_audit('quota.drift', 'visit_sessions', upcoming.id::text,
      jsonb_build_object('stored', stored, 'held', held, 'corrected', stored > held));
    drift_count := drift_count + 1;
  end loop;
  perform internal.restore_settings(previous_settings);
  return drift_count;
end;
$$;


-- ===== Retention (docs/PRD.md §8.7, docs/Security.md §7.3, Task P1.3.19) =====
-- A retention run passes the append-only triggers and keeps every erased value out of the audit log.
-- Each run ends with one purge_run audit row carrying its counts. Storage objects cannot be deleted
-- from SQL; api/jobs/purge-storage removes the files of whatever these runs marked.

create function internal.begin_retention_run() returns jsonb
  language plpgsql
  set search_path = ''
as $$
begin
  return internal.push_settings(
    '{"app.actor_role": "cron", "app.in_rpc": "1", "app.purge": "on", "app.audit_mode": "names_only"}');
end;
$$;

-- Participant names go 90 days after the visit. Their certificates are unlinked first, because a
-- participant certificate must either point at its participant or be marked purged.
create function internal.purge_participants() returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  cutoff date := public.today_jkt() - 90;
  certificates_marked integer;
  participants_deleted integer;
  exports_marked integer;
begin
  previous_settings := internal.begin_retention_run();

  update public.certificates c set participant_id = null, recipient_name = '[dihapus]', purged_at = now()
  from public.bookings b
  where b.id = c.booking_id and b.visit_date_end < cutoff and c.kind = 'participant' and c.purged_at is null;
  get diagnostics certificates_marked = row_count;

  delete from public.booking_participants p using public.bookings b
  where b.id = p.booking_id and b.visit_date_end < cutoff;
  get diagnostics participants_deleted = row_count;

  update public.exports set deleted_at = now() where deleted_at is null and expires_at < now();
  get diagnostics exports_marked = row_count;

  perform internal.log_audit('purge_run', 'booking_participants', null, jsonb_build_object(
    'job', 'purge_participants', 'participants_deleted', participants_deleted,
    'certificates_marked', certificates_marked, 'exports_marked', exports_marked));
  perform internal.restore_settings(previous_settings);
  return participants_deleted;
end;
$$;

-- Two groups lose their booker's contact: unpaid bookings a week after they expired or were
-- cancelled (with their participants, since they never visited), and every booking
-- pii_retention_months after its visit. Along with the contact go the verification stamps, every
-- free-text field that may name someone (the visitor's note, staff notes, cancel, review and discount
-- reasons), the IP and user agent, every guest link (token_version) and the outbox rows that still
-- name the contact. Expired OTP rows go the day after. A missing
-- pii_retention_months skips the second group; 0008_seed writes it in every environment.
create function internal.anonymise_booker_pii() returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  retention_months integer := (select (value #>> '{}')::integer from public.site_settings
                               where key = 'pii_retention_months');
  unpaid_cutoff timestamptz := now() - interval '7 days';
  anonymised integer;
  participants_deleted integer;
  otps_deleted integer;
begin
  previous_settings := internal.begin_retention_run();

  delete from public.booking_participants p using public.bookings b
  where b.id = p.booking_id and b.status in ('expired', 'cancelled') and b.paid_at is null
    and coalesce(b.expired_at, b.cancelled_at) < unpaid_cutoff;
  get diagnostics participants_deleted = row_count;

  with anonymised_bookings as (
    update public.bookings
    set pic_name = 'anon', pic_phone = null, pic_email = null, phone_verified_at = null, email_verified_at = null,
        notes = null, admin_notes = null, cancel_reason = null, review_reason = null, discount_note = null,
        source_ip = null, user_agent = null, pii_purged_at = now(), token_version = token_version + 1
    where pii_purged_at is null
      and ((status in ('expired', 'cancelled') and paid_at is null and coalesce(expired_at, cancelled_at) < unpaid_cutoff)
           or visit_date_end < public.today_jkt() - make_interval(months => retention_months))
    returning id
  ), forgotten_messages as (
    delete from public.notifications n using anonymised_bookings a where n.booking_id = a.id
  )
  select count(*) into anonymised from anonymised_bookings;

  delete from public.guest_otps where expires_at < now() - interval '1 day';
  get diagnostics otps_deleted = row_count;

  perform internal.log_audit('purge_run', 'bookings', null, jsonb_build_object(
    'job', 'anonymise_booker_pii', 'bookings_anonymised', anonymised,
    'participants_deleted', participants_deleted, 'otps_deleted', otps_deleted));
  perform internal.restore_settings(previous_settings);
  return anonymised;
end;
$$;

-- Operational tables shrink to their windows. The audit log is pruned only while its chain still
-- verifies, so pruning never destroys the evidence of tampering; the hash of the last pruned row is
-- kept in the purge_run row as the new anchor. payment_events go whole after 24 months, customer
-- details included.
create function internal.prune_operational_tables() returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  audit_cutoff_id bigint := (select max(a.id) from public.audit_logs a where a.occurred_at < now() - interval '24 months');
  anchor_hash text := (select a.entry_hash from public.audit_logs a where a.id = audit_cutoff_id);
  chain jsonb := internal.verify_audit_chain();
  counts jsonb := '{}';
  pruned integer;
begin
  previous_settings := internal.begin_retention_run();

  update public.notifications set params = '{}' where created_at < now() - interval '30 days' and params <> '{}';
  delete from public.notifications where created_at < now() - interval '180 days';
  get diagnostics pruned = row_count;
  counts := counts || jsonb_build_object('notifications', pruned);
  delete from public.webhook_rejections where received_at < now() - interval '30 days';
  get diagnostics pruned = row_count;
  counts := counts || jsonb_build_object('webhook_rejections', pruned);
  delete from public.payment_events where received_at < now() - interval '24 months';
  get diagnostics pruned = row_count;
  counts := counts || jsonb_build_object('payment_events', pruned);
  delete from public.security_events where occurred_at < now() - interval '12 months';
  get diagnostics pruned = row_count;
  counts := counts || jsonb_build_object('security_events', pruned);
  delete from public.login_attempts where attempted_at < now() - interval '24 hours';
  get diagnostics pruned = row_count;
  counts := counts || jsonb_build_object('login_attempts', pruned);
  delete from public.rate_limit_buckets where window_start < now() - interval '1 day';
  get diagnostics pruned = row_count;
  counts := counts || jsonb_build_object('rate_limit_buckets', pruned);
  -- Attendance itself stays in tickets_qr; the scan rows carry the officer's IP and device.
  delete from public.ticket_scans where scanned_at < now() - interval '24 months';
  get diagnostics pruned = row_count;
  counts := counts || jsonb_build_object('ticket_scans', pruned);

  if not (chain ->> 'ok')::boolean then
    insert into public.security_events (event_type, severity, entity_type, entity_id, details)
    values ('cron_failed', 'high', 'audit_logs', chain ->> 'first_broken_id',
            jsonb_build_object('job', 'prune_operational_tables', 'reason', 'audit_chain_broken'));
  elsif audit_cutoff_id is not null then
    delete from public.audit_logs where id <= audit_cutoff_id;
    get diagnostics pruned = row_count;
    counts := counts || jsonb_build_object('audit_logs', pruned, 'audit_anchor_id', audit_cutoff_id,
                                           'audit_anchor_hash', anchor_hash);
  end if;

  perform internal.log_audit('purge_run', 'operational_tables', null,
    jsonb_build_object('job', 'prune_operational_tables') || counts);
  perform internal.restore_settings(previous_settings);
end;
$$;

revoke execute on function internal.begin_scheduled_job(), internal.expire_stale_bookings(),
  internal.close_past_bookings(), internal.enqueue_visit_reminders(), internal.reconcile_session_counters(),
  internal.begin_retention_run(), internal.purge_participants(), internal.anonymise_booker_pii(),
  internal.prune_operational_tables()
  from public, anon, authenticated;


-- ===== Session generation, UI events, booklet downloads (docs/PRD.md §8.7, Task P1.3.20, P1.3.24) =====
-- The staff RPCs below are granted to authenticated in 0005 (P1.4.07); each re-checks its caller here.

-- Turns the active weekly templates of one RW into dated sessions. Dates that already have a session
-- at that start time are left alone, so the nightly run and a staff click never duplicate or
-- overwrite one. The range is capped at a year so one call cannot flood the calendar.
create function public.generate_visit_sessions(p_rw_id smallint, p_from date, p_to date) returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  first_day date := greatest(p_from, public.today_jkt());
  created integer;
begin
  if not (coalesce(current_setting('role', true), 'none') = 'none'
          or (public.aal2() and public.owns_rw(p_rw_id))) then
    raise exception 'sessions are generated by the RW''s own admin or the superadmin at AAL2, or by the nightly job'
      using errcode = '42501';
  end if;
  if p_to < first_day or p_to - first_day > 366 then
    raise exception 'sessions are generated for at most a year ahead' using errcode = '22023';
  end if;

  insert into public.visit_sessions (rw_id, session_date, start_time, end_time, label, capacity, template_id, created_by)
  select t.rw_id, day::date, t.start_time, t.end_time, t.label, t.capacity, t.id, auth.uid()
  from public.session_templates t
  cross join generate_series(first_day, p_to, interval '1 day') as day
  where t.rw_id = p_rw_id and t.is_active and extract(dow from day) = t.weekday
  on conflict (rw_id, session_date, start_time) do nothing;
  get diagnostics created = row_count;
  return created;
end;
$$;

-- The one event a browser may write to the audit log: a staff member opening the scanner or a masked
-- contact. Only those two events, only staff, at most 600 an hour each; the actor is always the
-- signed-in user, never a parameter (docs/Security.md AZ-15).
create function public.rpc_log_ui_event(p_event text, p_entity_id uuid default null) returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if not (public.is_staff() and public.aal2()) then
    raise exception 'only staff with a verified authenticator log UI events' using errcode = '42501';
  end if;
  if p_event is null or p_event not in ('pii_revealed', 'scanner_opened') then
    raise exception 'unknown UI event' using errcode = '22023';
  end if;
  if not internal.rate_limit_hit('ui_event:' || auth.uid(), 600, 3600) then
    raise exception 'too many UI events this hour' using errcode = 'P0001', hint = 'RATE_LIMITED';
  end if;

  perform internal.log_audit('ui.' || p_event,
    case p_event when 'pii_revealed' then 'bookings' else 'scanner' end,
    p_entity_id::text, jsonb_build_object('source', 'client'));
end;
$$;

-- Counted by the public download route under the service role; a draft or archived booklet is not.
create function internal.increment_booklet_download(p_booklet_id uuid) returns void
  language sql security definer
  set search_path = ''
as $$
  update public.booklets set download_count = download_count + 1 where id = p_booklet_id and status = 'published';
$$;

-- Staff RPCs run as the signed-in user; the service role never calls them (docs/Security.md L3 review).
revoke execute on function public.generate_visit_sessions(smallint, date, date),
  public.rpc_log_ui_event(text, uuid), internal.increment_booklet_download(uuid)
  from public, anon, authenticated, service_role;


-- ===== Staff management (docs/PRD.md §8.7, docs/Security.md §5.3, §5.6, Task P1.3.21) =====

-- AUTH-11: an authenticator code verified in the last five minutes, not just an AAL2 session that may
-- have been left open on a desk.
create function internal.has_fresh_totp() returns boolean
  language sql stable
  set search_path = ''
as $$
  select public.aal2() and exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as method
    where method ->> 'method' = 'totp' and (method ->> 'timestamp')::bigint > extract(epoch from now()) - 300
  );
$$;

create function internal.require_superadmin_step_up() returns void
  language plpgsql
  set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'only the superadmin manages staff' using errcode = '42501';
  end if;
  if not internal.has_fresh_totp() then
    raise exception 'confirm with a fresh authenticator code first' using errcode = '42501';
  end if;
end;
$$;

-- Moves a staff member to another role or RW. profiles_guard refuses the caller's own row and the last
-- active superadmin, and bumps claims_version so tokens minted before the change stop working; the
-- open sessions are ended too, so the next request has to sign in again. Making someone superadmin
-- hands over everything, so it waits like an MFA reset: the first call records the request, a call 24
-- hours to 7 days later applies it, each step raises a critical alert, and cancel_superadmin_promotion
-- stops it. Every other change applies at once. Returns the stage reached.
-- p_rw_id defaults to NULL so the generated types let a superadmin or 'none' role pass none.
create function public.set_staff_role(p_user_id uuid, p_role public.app_role, p_rw_id smallint default null)
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

-- Deactivates or reactivates a staff member, with a reason for the audit log. Deactivation takes the
-- role and RW away, ends every session, removes every MFA factor and drops any pending request, so a
-- returning officer enrols again and gets a role back only through set_staff_role, where a former
-- superadmin waits 24 hours like any promotion (review L9); reactivation only reopens the account.
-- Banning the Auth user is the staff service's next step through the Auth admin API (docs/Security.md
-- §5.6).
create function public.set_staff_status(p_user_id uuid, p_is_active boolean, p_reason text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  previous record;
begin
  perform internal.require_superadmin_step_up();
  if p_is_active is null or length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'a status change needs a reason of 3 to 300 characters' using errcode = '22023';
  end if;
  select p.role, p.rw_id into previous from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception 'no staff profile %', p_user_id using errcode = 'P0002';
  end if;

  previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
  update public.profiles
  set is_active = p_is_active,
      role = case when p_is_active then role else 'none' end,
      rw_id = case when p_is_active then rw_id end,
      mfa_reset_requested_at = case when p_is_active then mfa_reset_requested_at end,
      mfa_reset_requested_by = case when p_is_active then mfa_reset_requested_by end,
      promotion_requested_at = case when p_is_active then promotion_requested_at end,
      promotion_requested_by = case when p_is_active then promotion_requested_by end
  where id = p_user_id;
  perform internal.restore_settings(previous_settings);

  if not p_is_active then
    delete from auth.sessions where user_id = p_user_id;
    delete from auth.mfa_factors where user_id = p_user_id;
    insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
    values ('staff_disabled', 'high', auth.uid(), previous.rw_id, 'profiles', p_user_id::text,
            jsonb_build_object('from_role', previous.role, 'from_rw_id', previous.rw_id));
  end if;
  perform internal.log_audit(case when p_is_active then 'staff.reactivated' else 'staff.deactivated' end,
    'profiles', p_user_id::text, jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

revoke execute on function internal.has_fresh_totp(), internal.require_superadmin_step_up(),
  public.set_staff_role(uuid, public.app_role, smallint), public.set_staff_status(uuid, boolean, text)
  from public, anon, authenticated, service_role;


-- ===== Service-role entry points (decision of 2026-10-16, CLAUDE.md §6.1) =====
-- PostgREST exposes public only, so server code (src/lib/supabase/admin.ts) reaches internal.* through
-- these svc_ wrappers. Each is security definer, so the service role needs no right on internal at
-- all, and each is executable by the service role only. An internal function the server calls gets
-- its svc_ wrapper in the same migration that creates it.

create function public.svc_rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer) returns boolean
  language sql security definer
  set search_path = ''
as $$ select internal.rate_limit_hit(p_key, p_limit, p_window_seconds); $$;

create function public.svc_enqueue_notification(
  p_booking_id uuid, p_template public.notification_template, p_channel public.notification_channel, p_params jsonb
) returns uuid
  language sql security definer
  set search_path = ''
as $$ select internal.enqueue_notification(p_booking_id, p_template, p_channel, p_params); $$;

create function public.svc_increment_booklet_download(p_booklet_id uuid) returns void
  language sql security definer
  set search_path = ''
as $$ select internal.increment_booklet_download(p_booklet_id); $$;

create function public.svc_expire_stale_bookings() returns integer
  language sql security definer
  set search_path = ''
as $$ select internal.expire_stale_bookings(); $$;

-- Application events the server writes (export.*, document.signed_url, booking.access_link_resent, ...).
-- A PostgREST call cannot set app.actor_id beforehand, so the actor comes in as a parameter: a staff
-- member's profile id, or NULL when the server acts for a visitor. The nullable parameters have
-- defaults so the generated types can leave them out; src/db/rpc.ts still makes callers say which.
create function public.svc_log_audit(
  p_action text, p_entity_type text, p_actor_id uuid default null, p_entity_id text default null,
  p_metadata jsonb default '{}'
) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  staff_role public.app_role;
begin
  if p_actor_id is not null then
    select p.role into staff_role from public.profiles p where p.id = p_actor_id and p.is_active;
    if staff_role is null or staff_role = 'none' then
      raise exception 'audit actor % is not active staff', p_actor_id using errcode = '42501';
    end if;
  end if;
  previous_settings := internal.push_settings(jsonb_build_object(
    'app.actor_id', coalesce(p_actor_id::text, ''), 'app.actor_role', coalesce(staff_role::text, 'visitor')));
  perform internal.log_audit(p_action, p_entity_type, p_entity_id, p_metadata);
  perform internal.restore_settings(previous_settings);
end;
$$;

revoke execute on function public.svc_rate_limit_hit(text, integer, integer),
  public.svc_enqueue_notification(uuid, public.notification_template, public.notification_channel, jsonb),
  public.svc_increment_booklet_download(uuid), public.svc_expire_stale_bookings(),
  public.svc_log_audit(text, text, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.svc_rate_limit_hit(text, integer, integer),
  public.svc_enqueue_notification(uuid, public.notification_template, public.notification_channel, jsonb),
  public.svc_increment_booklet_download(uuid), public.svc_expire_stale_bookings(),
  public.svc_log_audit(text, text, uuid, text, jsonb)
  to service_role;


-- ===== Delayed staff changes: MFA reset and promotion to superadmin (decision of 2026-10-16,
-- docs/Security.md §5.2, Task P1.3.21) =====
-- Removing someone's authenticator, or making someone superadmin, is how a stolen superadmin session
-- would take over the kelurahan, and there may be a single superadmin, so dual approval is not always
-- possible. Both changes are therefore requested first and applied no sooner than 24 hours and no
-- later than 7 days after the request; an older request has lapsed and the next call starts a new
-- one. Every step (requested, completed, cancelled) raises a critical alert that the alert sender
-- delivers out of band to SECURITY_ALERT_EMAIL / SECURITY_ALERT_WA_PHONE, so the kelurahan head can
-- have the request cancelled in time.

alter table public.security_events drop constraint security_events_event_type_check;
alter table public.security_events add constraint security_events_event_type_check check (event_type in (
  'webhook_signature_invalid','webhook_amount_mismatch','status_disagreement','login_failed','login_locked',
  'mfa_failed','mfa_enrolled','scanner_invalid_signature','scanner_lockout','rate_limited','turnstile_failed',
  'upload_rejected','role_changed','staff_disabled','key_rotated','export_downloaded','pii_revealed',
  'manual_checkin','manual_backfill','undo_check_in','cron_failed','notification_dead','price_changed',
  'session_changed_with_bookings','quota_pressure','mfa_reset','notification_blocked'));

create function internal.staff_change_delay() returns interval
  language sql immutable
  set search_path = ''
as $$ select interval '24 hours'; $$;

create function internal.staff_change_has_lapsed(p_requested_at timestamptz) returns boolean
  language sql stable
  set search_path = ''
as $$ select p_requested_at < now() - interval '7 days'; $$;

-- True only inside the window in which a request may be carried out.
create function internal.staff_change_is_due(p_requested_at timestamptz) returns boolean
  language sql stable
  set search_path = ''
as $$
  select p_requested_at is not null and p_requested_at <= now() - internal.staff_change_delay()
    and not internal.staff_change_has_lapsed(p_requested_at);
$$;

create function internal.staff_change_requested() returns jsonb
  language sql stable
  set search_path = ''
as $$
  select jsonb_build_object('stage', 'requested', 'completes_after', now() + internal.staff_change_delay(),
                            'lapses_after', now() + interval '7 days');
$$;

-- One security event, one critical alert and one audit row per step. The alert keeps a single open row
-- per account and change; a later step bumps it and clears notified_at so it goes out again.
create function internal.record_staff_change_step(p_user_id uuid, p_change text, p_stage text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  staff_rw_id smallint := (select p.rw_id from public.profiles p where p.id = p_user_id);
  step jsonb := jsonb_build_object('change', p_change, 'stage', p_stage, 'user_id', p_user_id, 'by', auth.uid());
  title text := case p_change || ':' || p_stage
    when 'mfa_reset:requested' then 'Permintaan reset MFA staf'
    when 'mfa_reset:completed' then 'Reset MFA staf dijalankan'
    when 'mfa_reset:cancelled' then 'Permintaan reset MFA staf dibatalkan'
    when 'superadmin_promotion:requested' then 'Permintaan menjadikan staf superadmin'
    when 'superadmin_promotion:completed' then 'Staf dijadikan superadmin'
    when 'superadmin_promotion:cancelled' then 'Permintaan superadmin dibatalkan'
  end;
begin
  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values (case p_change when 'mfa_reset' then 'mfa_reset' else 'role_changed' end, 'critical', auth.uid(),
          staff_rw_id, 'profiles', p_user_id::text, step);

  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values (p_change, 'critical', p_change || ':' || p_user_id, title, step)
  on conflict (fingerprint) where acknowledged_at is null do update
  set title = excluded.title, details = excluded.details, last_seen_at = now(),
      occurrences = public.security_alerts.occurrences + 1, notified_at = null;

  perform internal.log_audit('staff.' || p_change || '_' || p_stage, 'profiles', p_user_id::text, step - 'user_id');
end;
$$;

-- The first call records the request; a call 24 hours to 7 days later deletes every factor of the
-- account, ends its sessions and bumps claims_version, so the person enrols a new authenticator at the
-- next sign-in. Returns the stage reached and, for a request, when it can be completed and when it
-- lapses.
create function public.reset_staff_mfa(p_user_id uuid) returns jsonb
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
  set mfa_reset_requested_at = null, mfa_reset_requested_by = null, claims_version = claims_version + 1
  where id = p_user_id;
  perform internal.restore_settings(previous_settings);
  perform internal.record_staff_change_step(p_user_id, 'mfa_reset', 'completed');
  return jsonb_build_object('stage', 'completed');
end;
$$;

-- Stops a pending MFA reset. The superadmin may, and so may the staff member it targets, who proves
-- with a fresh code from the very authenticator the reset would remove that it is still theirs.
create function public.cancel_staff_mfa_reset(p_user_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  was_pending boolean;
begin
  if not (public.is_superadmin() or (auth.uid() = p_user_id and public.is_staff())) then
    raise exception 'only the superadmin or the staff member themselves cancels an MFA reset' using errcode = '42501';
  end if;
  if not internal.has_fresh_totp() then
    raise exception 'confirm with a fresh authenticator code first' using errcode = '42501';
  end if;
  previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
  update public.profiles set mfa_reset_requested_at = null, mfa_reset_requested_by = null
  where id = p_user_id and mfa_reset_requested_at is not null;
  was_pending := found;
  perform internal.restore_settings(previous_settings);
  if not was_pending then
    raise exception 'no MFA reset is pending for %', p_user_id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  perform internal.record_staff_change_step(p_user_id, 'mfa_reset', 'cancelled');
end;
$$;

-- Stops a pending promotion to superadmin; any superadmin with a fresh TOTP check may.
create function public.cancel_superadmin_promotion(p_user_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  was_pending boolean;
begin
  perform internal.require_superadmin_step_up();
  previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
  update public.profiles set promotion_requested_at = null, promotion_requested_by = null
  where id = p_user_id and promotion_requested_at is not null;
  was_pending := found;
  perform internal.restore_settings(previous_settings);
  if not was_pending then
    raise exception 'no promotion to superadmin is pending for %', p_user_id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  perform internal.record_staff_change_step(p_user_id, 'superadmin_promotion', 'cancelled');
end;
$$;

revoke execute on function internal.staff_change_delay(), internal.staff_change_has_lapsed(timestamptz),
  internal.staff_change_is_due(timestamptz), internal.staff_change_requested(),
  internal.record_staff_change_step(uuid, text, text), public.reset_staff_mfa(uuid),
  public.cancel_staff_mfa_reset(uuid), public.cancel_superadmin_promotion(uuid)
  from public, anon, authenticated, service_role;


-- ===== Views (docs/PRD.md §8.4.10, Task P1.3.22) =====
-- Every view is security_invoker, so the reader's own grants and RLS apply to each table it reads
-- (granted in 0005). A view therefore cannot hide a column its reader is granted; private values stay
-- out of reach through column grants and stored generated columns instead (decision of 2026-10-16).
-- The staff views also repeat their scope in WHERE, as the first line in front of RLS.

-- What a public review shows of its author: 'Pengunjung' when anonymous, else the first name. anon is
-- granted this column, never reviewer_name.
alter table public.reviews add column public_reviewer_name text generated always as (
  case when is_anonymous then 'Pengunjung' else split_part(btrim(reviewer_name), ' ', 1) end
) stored;

-- Bookable sessions for the calendar and the wizard. The share held by unpaid bookings is not here:
-- computing it needs booking rows anon may not read, so create_booking enforces that rule itself and
-- the staff dashboard computes the pressure on its own path.
create view public.v_session_availability with (security_invoker = true) as
select s.id, s.rw_id, s.session_date, s.start_time, s.end_time, s.label, s.capacity,
       s.capacity - s.reserved_pax as remaining
from public.visit_sessions s
where s.status = 'open' and s.session_date >= public.today_jkt();

create view public.v_public_reviews with (security_invoker = true) as
select r.id, r.rating, r.title, r.body, r.public_reviewer_name as reviewer_name, r.institution_name, r.rw_ids,
       r.is_featured, r.created_at
from public.reviews r
where r.status = 'published';

-- The staff booking list. Contact details appear only masked; rpc_reveal_booking_contact is the one way
-- to the real values. docs/Security.md STAFF-02: an RW admin sees the money of their own RW's bookings,
-- because they set those prices, but a combo's total also holds the other RW's share, so only the
-- superadmin sees it. An RW admin sees bookings visiting from a week ago to a month ahead.
create view public.v_bookings_staff with (security_invoker = true) as
select
  b.id, b.booking_code, b.status, b.channel, b.package_id, p.name as package_name, b.rw_ids, b.booker_type,
  b.institution_name, b.pic_first_name, b.phone_masked, b.email_masked,
  b.phone_verified_at is not null as is_phone_verified, b.email_verified_at is not null as is_email_verified,
  b.pii_purged_at is not null as is_anonymised,
  b.pax_count, b.visit_date, b.visit_date_end, b.notes, b.admin_notes,
  money.shows_amounts,
  case when money.shows_amounts then b.subtotal_package end as subtotal_package,
  case when money.shows_amounts then b.subtotal_addons end as subtotal_addons,
  case when money.shows_amounts then b.discount_amount end as discount_amount,
  case when money.shows_amounts then b.total_amount end as total_amount,
  case when money.shows_amounts then b.amount_paid end as amount_paid,
  b.expires_at, b.quoted_at, b.paid_at, b.checked_in_at, b.completed_at, b.cancelled_at, b.cancel_reason,
  b.expired_at, b.refunded_at, b.needs_review, b.review_reason, b.created_at,
  (select jsonb_agg(jsonb_build_object('rw_id', l.rw_id, 'session_date', s.session_date, 'start_time', s.start_time,
                                       'label', s.label, 'pax', l.pax_count, 'status', l.status) order by l.leg_order)
   from public.booking_legs l join public.visit_sessions s on s.id = l.visit_session_id
   where l.booking_id = b.id) as legs,
  (select py.status from public.payments py where py.booking_id = b.id order by py.attempt_no desc limit 1)
    as payment_status,
  (select jsonb_object_agg(t.rw_id, t.status) from public.tickets_qr t where t.booking_id = b.id) as ticket_statuses
from public.bookings b
join public.tour_packages p on p.id = b.package_id
cross join lateral (
  select (select public.is_superadmin()) or b.rw_ids = array[(select public.app_rw_id())] as shows_amounts
) as money
where (select public.is_superadmin())
   or (public.owns_any_rw(b.rw_ids)
       and b.visit_date_end >= (select public.today_jkt()) - 7 and b.visit_date <= (select public.today_jkt()) + 30);

-- The booking detail page: the list row plus its payments, tickets and invoices.
create view public.v_booking_admin with (security_invoker = true) as
select v.*,
  (select jsonb_agg(jsonb_build_object('attempt_no', py.attempt_no, 'method', py.method, 'status', py.status,
                                       'order_id', py.order_id,
                                       'gross_amount', case when v.shows_amounts then py.gross_amount end,
                                       'settlement_time', py.settlement_time) order by py.attempt_no)
   from public.payments py where py.booking_id = v.id) as payments,
  (select jsonb_agg(jsonb_build_object('ticket_code', t.ticket_code, 'rw_id', t.rw_id, 'status', t.status,
                                       'valid_on', t.valid_on, 'pax', t.pax_count, 'checked_in_pax', t.checked_in_pax,
                                       'unpaid_pax', t.unpaid_pax, 'checked_in_at', t.checked_in_at) order by t.rw_id)
   from public.tickets_qr t where t.booking_id = v.id) as tickets,
  (select jsonb_agg(jsonb_build_object('invoice_number', i.invoice_number, 'status', i.status,
                                       'receipt_number', i.receipt_number, 'credit_note_number', i.credit_note_number,
                                       'issued_at', i.issued_at) order by i.issued_at)
   from public.invoices i where i.booking_id = v.id) as invoices
from public.v_bookings_staff v;

-- Today's gate list per RW, one row per ticket.
create view public.v_attendance_today with (security_invoker = true) as
select t.rw_id, t.booking_id, b.booking_code, b.institution_name, b.pic_first_name, b.booker_type,
       s.label as session_label, s.start_time, s.end_time,
       t.id as ticket_id, t.ticket_code, t.status as ticket_status,
       t.pax_count as booked_pax, t.checked_in_pax, t.unpaid_pax, t.checked_in_at,
       exists (select 1 from public.ticket_scans sc
               where sc.ticket_id = t.id and sc.source <> 'qr' and sc.result = 'ok') as is_manual
from public.tickets_qr t
join public.bookings b on b.id = t.booking_id
join public.visit_sessions s on s.id = t.visit_session_id
where t.valid_on = (select public.today_jkt())
  and ((select public.is_superadmin()) or public.owns_rw(t.rw_id));

-- One row per leg for the visits and attendance exports: no contact columns, and an RW admin gets
-- only their own RW's legs, so a combo's other leg never reaches their file.
create view public.v_booking_export with (security_invoker = true) as
select b.booking_code, b.status as booking_status, p.name as package_name, b.booker_type, b.institution_name,
       l.rw_id, s.session_date, s.start_time, s.label as session_label, l.pax_count as leg_pax, l.status as leg_status,
       t.ticket_code, t.status as ticket_status, t.checked_in_pax, t.unpaid_pax, b.paid_at,
       case when (select public.is_superadmin()) or b.rw_ids = array[(select public.app_rw_id())]
            then b.total_amount end as total_amount
from public.booking_legs l
join public.bookings b on b.id = l.booking_id
join public.tour_packages p on p.id = b.package_id
join public.visit_sessions s on s.id = l.visit_session_id
left join public.tickets_qr t on t.booking_leg_id = l.id
where (select public.is_superadmin()) or public.owns_rw(l.rw_id);

-- Ledger recaps (REC-07): amounts come from revenue_share_entries only. An RW admin sees the keys of
-- their own RW (its treasury and its vendors), never the kelurahan's. sum() of bigint is numeric, so
-- every money sum is cast back to integer rupiah.
create view public.v_revenue_recap_daily with (security_invoker = true) as
select (e.created_at at time zone 'Asia/Jakarta')::date as day, e.rw_id, e.beneficiary_key,
       coalesce(sum(e.amount) filter (where e.entry_type = 'settlement'), 0)::bigint as settled_amount,
       coalesce(sum(e.amount) filter (where e.entry_type = 'reversal'), 0)::bigint as reversed_amount,
       sum(e.amount)::bigint as net_amount,
       count(distinct e.booking_id) as bookings
from public.revenue_share_entries e
where (select public.is_superadmin()) or public.owns_rw(e.rw_id)
group by 1, 2, 3;

-- beneficiary_name is NULL for the kelurahan; the dashboard labels it from its own copy.
create view public.v_revenue_recap_by_party with (security_invoker = true) as
select e.beneficiary, e.beneficiary_key, coalesce(r.name, v.name) as beneficiary_name, e.rw_id,
       sum(e.amount)::bigint as accrued,
       coalesce(sum(e.amount) filter (where e.payout_batch_id is not null), 0)::bigint as paid_out,
       (sum(e.amount) - coalesce(sum(e.amount) filter (where e.payout_batch_id is not null), 0))::bigint as outstanding
from public.revenue_share_entries e
left join public.rw_units r on e.beneficiary = 'rw_treasury' and r.id = e.rw_id
left join public.umkm_vendors v on v.id = e.vendor_id
where (select public.is_superadmin()) or public.owns_rw(e.rw_id)
group by e.beneficiary, e.beneficiary_key, coalesce(r.name, v.name), e.rw_id;

create view public.v_revenue_recap_by_booking with (security_invoker = true) as
select b.id as booking_id, b.booking_code, b.paid_at, b.total_amount,
       jsonb_agg(jsonb_build_object('id', e.id, 'entry_type', e.entry_type, 'beneficiary_key', e.beneficiary_key,
                                    'line_ref', e.line_ref, 'amount', e.amount, 'created_at', e.created_at)
                 order by e.id) as entries
from public.revenue_share_entries e
join public.bookings b on b.id = e.booking_id
where (select public.is_superadmin())
group by b.id;

-- Payments per Jakarta day of settlement; a refund counts on the day of the payment it reverses.
create view public.v_finance_daily with (security_invoker = true) as
select (coalesce(py.settlement_time, py.transaction_time, py.created_at) at time zone 'Asia/Jakarta')::date as day,
       sum(py.gross_amount)::bigint as gross_settled,
       coalesce(sum(py.refunded_amount), 0)::bigint as refunds,
       (sum(py.gross_amount) - coalesce(sum(py.refunded_amount), 0))::bigint as net,
       count(*) as payments_count,
       count(*) filter (where py.method = 'qris') as qris_count,
       count(*) filter (where py.method = 'virtual_account') as va_count
from public.payments py
where py.status in ('settled', 'refunded', 'partially_refunded') and (select public.is_superadmin())
group by 1;


-- ===== PII paths for staff (docs/PRD.md §8.7, docs/Security.md DATA-04, AZ-12, Task P1.3.23) =====
-- No API role reads a booker's contact or a participant name directly; these two RPCs are the only
-- way, for every staff role, superadmin included. Both need an AAL2 session and a booking the caller
-- may see, visiting between a week ago and a month ahead.

create function internal.require_booking_pii_access(p_booking_id uuid) returns smallint[]
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  booking record;
begin
  if not (public.is_staff() and public.aal2()) then
    raise exception 'personal data is shown to staff with a verified authenticator only' using errcode = '42501';
  end if;
  select b.rw_ids, b.visit_date, b.visit_date_end into booking from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if not (public.is_superadmin() or public.owns_any_rw(booking.rw_ids)) then
    raise exception 'this booking belongs to another RW' using errcode = '42501';
  end if;
  if booking.visit_date_end < public.today_jkt() - 7 or booking.visit_date > public.today_jkt() + 30 then
    raise exception 'personal data is shown only from a week before to a month after the visit'
      using errcode = '42501';
  end if;
  return booking.rw_ids;
end;
$$;

-- The booker's full contact for one booking, with the reason the staff member gave. Each reveal is a
-- pii_revealed security event; the 50th of the caller's Jakarta day also raises an alert, and the
-- 51st is refused. (A refused call cannot write anything, which is why the alert comes with the
-- 50th.)
create function public.rpc_reveal_booking_contact(p_booking_id uuid, p_reason text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  daily_cap constant integer := 50;
  rw_ids smallint[] := internal.require_booking_pii_access(p_booking_id);
  revealed_today integer;
  contact jsonb;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'a reveal needs a reason of 3 to 300 characters' using errcode = '22023';
  end if;
  -- One staff member's reveals take turns, so parallel calls cannot all count below the cap.
  perform pg_advisory_xact_lock(hashtext('pii_reveal:' || auth.uid()::text));
  select count(*) into revealed_today from public.security_events e
  where e.event_type = 'pii_revealed' and e.actor_id = auth.uid()
    and e.occurred_at >= public.today_jkt()::timestamp at time zone 'Asia/Jakarta';
  if revealed_today >= daily_cap then
    raise exception 'the daily limit of % contact reveals is reached', daily_cap
      using errcode = 'P0001', hint = 'RATE_LIMITED';
  end if;

  select jsonb_build_object('pic_name', b.pic_name, 'pic_phone', b.pic_phone, 'pic_email', b.pic_email) into contact
  from public.bookings b where b.id = p_booking_id;
  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('pii_revealed', 'info', auth.uid(), rw_ids[1], 'bookings', p_booking_id::text,
          jsonb_build_object('reason', btrim(p_reason)));

  if revealed_today + 1 >= daily_cap then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('pii_reveal_cap', 'high', 'pii_reveal_cap:' || auth.uid() || ':' || public.today_jkt(),
            'Batas harian buka kontak tercapai', jsonb_build_object('actor_id', auth.uid(), 'cap', daily_cap))
    on conflict (fingerprint) where acknowledged_at is null do nothing;
  end if;
  return contact;
end;
$$;

-- The participant list of one booking, at most 300 rows, with the read audited.
create function public.rpc_get_participants(p_booking_id uuid) returns setof public.booking_participants
  language plpgsql security definer
  set search_path = ''
as $$
declare
  row_cap constant integer := 300;
  rw_ids smallint[] := internal.require_booking_pii_access(p_booking_id);
  returned integer;
begin
  return query
    select p.* from public.booking_participants p where p.booking_id = p_booking_id order by p.seq_no limit row_cap;
  get diagnostics returned = row_count;
  perform internal.log_audit('participants.read', 'bookings', p_booking_id::text,
    jsonb_build_object('rows', returned, 'rw_id', rw_ids[1]));
end;
$$;

revoke execute on function internal.require_booking_pii_access(uuid), public.rpc_reveal_booking_contact(uuid, text),
  public.rpc_get_participants(uuid)
  from public, anon, authenticated, service_role;


-- ===== Contact-free document snapshots (docs/PRD.md §8.4.5, docs/Security.md §7.2, review M7) =====
-- A quotation or invoice snapshot is kept for years, and an invoice's is frozen once paid, so the
-- retention run could never erase a contact stored there. A snapshot therefore has one fixed shape, the
-- document fields of docs/PRD.md §8.4.5 and nothing else: any other key is refused at any depth, and so
-- is any value that looks like an email address or an Indonesian phone number (+62 / 62 / 08), or runs
-- past 300 characters. The booker appears as institution_name only.

-- A leaf (true) holds a plain value or a list of plain values; a nested shape holds an object, or a
-- list of objects, with only those keys.
create function internal.document_snapshot_shape() returns jsonb
  language sql immutable
  set search_path = ''
as $$
  select '{
    "booking_code": true, "institution_name": true, "booker_type": true, "package_name": true,
    "package_category": true, "pricing_basis": true, "rw_names": true, "visit_date": true, "visit_date_end": true,
    "sessions": {"rw_name": true, "session_date": true, "start_time": true, "end_time": true},
    "pax_count": true,
    "lines": {"kind": true, "product_name": true, "qty": true, "unit_price": true, "line_total": true},
    "subtotal_package": true, "subtotal_addons": true, "discount_amount": true, "total_amount": true, "currency": true,
    "valid_until": true, "due_date": true,
    "payment": {"method": true, "va_bank": true, "order_id": true, "paid_at": true, "amount_paid": true},
    "credit_note": {"number": true, "issued_at": true, "amount": true},
    "signatory_name": true, "signatory_title": true, "template_version": true
  }'::jsonb;
$$;

-- The first thing wrong with p_value against p_shape, or NULL. The message names the key, never the
-- value, since the value may be the very contact detail being refused. A phone number counts only
-- where it does not continue a code (GSK-08123456 or INV/GSK/2026/10/0812 are not phones).
create function internal.snapshot_problem(p_value jsonb, p_shape jsonb, p_path text) returns text
  language plpgsql immutable
  set search_path = ''
as $$
declare
  email_pattern constant text := '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}';
  phone_pattern constant text := '(^|[^[:alnum:]/-])(\+ ?62|62|0)[ .-]?8([ .-]?[0-9]){7,11}([^[:alnum:]]|$)';
  field record;
  element jsonb;
  problem text;
  plain_value text;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      if jsonb_typeof(p_shape) <> 'object' then
        return p_path || ' must be a plain value';
      end if;
      for field in select key, value from jsonb_each(p_value) loop
        if not p_shape ? field.key then
          return 'unknown key ' || ltrim(p_path || '.' || field.key, '.');
        end if;
        problem := internal.snapshot_problem(field.value, p_shape -> field.key, ltrim(p_path || '.' || field.key, '.'));
        if problem is not null then
          return problem;
        end if;
      end loop;
    when 'array' then
      for element in select value from jsonb_array_elements(p_value) loop
        problem := case when jsonb_typeof(element) = 'array' then p_path || ' nests a list in a list'
                        else internal.snapshot_problem(element, p_shape, p_path) end;
        if problem is not null then
          return problem;
        end if;
      end loop;
    else
      plain_value := p_value #>> '{}';
      if jsonb_typeof(p_shape) = 'object' then
        return p_path || ' must be an object';
      elsif length(plain_value) > 300 then
        return p_path || ' is longer than 300 characters';
      elsif plain_value ~* email_pattern or plain_value ~ phone_pattern then
        return p_path || ' looks like an email address or a phone number';
      end if;
  end case;
  return null;
end;
$$;

create function internal.snapshot_without_contact() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  problem text := case when jsonb_typeof(new.snapshot) = 'object'
                       then internal.snapshot_problem(new.snapshot, internal.document_snapshot_shape(), '')
                       else 'the snapshot must be an object' end;
begin
  if problem is not null then
    raise exception '%.snapshot: %', tg_table_name, problem
      using errcode = 'check_violation', constraint = 'snapshot_without_contact';
  end if;
  return new;
end;
$$;
create trigger snapshot_without_contact before insert or update of snapshot on public.invoices
  for each row execute function internal.snapshot_without_contact();
create trigger snapshot_without_contact before insert or update of snapshot on public.quotations
  for each row execute function internal.snapshot_without_contact();

revoke execute on function internal.document_snapshot_shape(), internal.snapshot_problem(jsonb, jsonb, text),
  internal.snapshot_without_contact()
  from public, anon, authenticated, service_role;


-- ===== Midtrans payload minimisation (docs/Security.md §7.2, DATA-01, PAY-07) =====
-- Midtrans echoes back what it was sent about the booker (customer_details, billing and shipping
-- addresses, the merchant's custom fields). We need none of it to reconcile a payment, and storing it
-- would keep the booker's contact long after the booking is anonymised, frozen on settled payments.
-- So a stored reply keeps only the keys reconciliation reads; anything else, including keys a future
-- Midtrans version adds, is dropped before any writer stores it. A nested object keeps only its own
-- known keys.

-- An object keeps only p_keys; an array keeps only p_keys in each of its objects.
create function internal.keep_keys(p_value jsonb, p_keys text[]) returns jsonb
  language sql immutable
  set search_path = ''
as $$
  select case jsonb_typeof(p_value)
    when 'object' then (
      select coalesce(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
      from jsonb_each(p_value) as field where field.key = any (p_keys))
    when 'array' then (
      select coalesce(jsonb_agg(
               case jsonb_typeof(element.value)
                 when 'object' then (
                   select coalesce(jsonb_object_agg(inner_field.key, inner_field.value), '{}'::jsonb)
                   from jsonb_each(element.value) as inner_field where inner_field.key = any (p_keys))
                 else element.value
               end order by element.position), '[]'::jsonb)
      from jsonb_array_elements(p_value) with ordinality as element(value, position))
    else p_value
  end;
$$;

create function internal.minimise_midtrans_payload(p_payload jsonb) returns jsonb
  language plpgsql immutable
  set search_path = ''
as $$
declare
  kept_keys constant text[] := array[
    'transaction_id', 'transaction_status', 'transaction_time', 'transaction_type', 'settlement_time',
    'expiry_time', 'status_code', 'status_message', 'payment_type', 'order_id', 'merchant_id', 'gross_amount',
    'currency', 'fraud_status', 'va_numbers', 'permata_va_number', 'bill_key', 'biller_code', 'payment_code',
    'store', 'issuer', 'acquirer', 'channel_response_code', 'channel_response_message', 'refund_amount',
    'refund_key', 'refunds', 'payment_amounts', 'item_details', 'transaction_details'];
  nested_keys constant jsonb := '{
    "va_numbers": ["bank", "va_number"],
    "refunds": ["refund_chargeback_id", "refund_amount", "refund_key", "refund_method", "created_at", "bank_confirmed_at"],
    "payment_amounts": ["paid_at", "amount"],
    "item_details": ["id", "price", "quantity", "name"],
    "transaction_details": ["order_id", "gross_amount"]
  }';
  field record;
  minimised jsonb := '{}';
begin
  -- A reply that is not an object is nothing reconciliation can read.
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return null;
  end if;
  for field in select key, value from jsonb_each(p_payload) where key = any (kept_keys) loop
    minimised := minimised || jsonb_build_object(field.key,
      case when nested_keys ? field.key
           then internal.keep_keys(field.value, array(select jsonb_array_elements_text(nested_keys -> field.key)))
           else field.value end);
  end loop;
  return minimised;
end;
$$;

create function internal.minimise_stored_midtrans_payload() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if tg_table_name = 'payments' then
    new.last_payload := internal.minimise_midtrans_payload(new.last_payload);
  else
    new.payload := internal.minimise_midtrans_payload(new.payload);
  end if;
  return new;
end;
$$;
create trigger midtrans_payload_minimise before insert or update of last_payload on public.payments
  for each row execute function internal.minimise_stored_midtrans_payload();
create trigger midtrans_payload_minimise before insert or update of payload on public.payment_events
  for each row execute function internal.minimise_stored_midtrans_payload();

revoke execute on function internal.keep_keys(jsonb, text[]), internal.minimise_midtrans_payload(jsonb),
  internal.minimise_stored_midtrans_payload()
  from public, anon, authenticated;


-- ===== Storage purge support (docs/Security.md §7.3, Task P1.3.25) =====
-- Supabase refuses delete from storage.objects, so the retention runs only mark rows. The job
-- api/jobs/purge-storage asks here for the marked files, deletes them through the Storage API, and
-- then forgets their paths here, logged as cron. A file whose deletion failed is not forgotten, so
-- the next run tries it again.

create function internal.purgeable_files(p_limit integer) returns table (bucket text, path text)
  language sql stable security definer
  set search_path = ''
as $$
  (select 'documents', c.pdf_path from public.certificates c
   where c.purged_at is not null and c.pdf_path is not null order by c.purged_at limit p_limit)
  union all
  (select 'documents', e.storage_path from public.exports e
   where e.deleted_at is not null and e.storage_path is not null order by e.deleted_at limit p_limit)
  union all
  -- Ticket PDFs are kept for 12 months after the visit.
  (select 'documents', b.ticket_pdf_path from public.bookings b
   where b.ticket_pdf_path is not null and b.visit_date_end < (public.today_jkt() - interval '12 months')::date
   order by b.visit_date_end limit p_limit);
$$;

-- Clears only paths that are still marked, so a wrong or replayed list cannot unlink a live file.
create function internal.forget_purged_files(p_paths text[]) returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  forgotten integer := 0;
  cleared integer;
begin
  previous_settings := internal.begin_scheduled_job();
  update public.certificates set pdf_path = null where purged_at is not null and pdf_path = any (p_paths);
  get diagnostics cleared = row_count;
  forgotten := forgotten + cleared;
  update public.exports set storage_path = null where deleted_at is not null and storage_path = any (p_paths);
  get diagnostics cleared = row_count;
  forgotten := forgotten + cleared;
  update public.bookings set ticket_pdf_path = null
  where ticket_pdf_path = any (p_paths) and visit_date_end < (public.today_jkt() - interval '12 months')::date;
  get diagnostics cleared = row_count;
  perform internal.restore_settings(previous_settings);
  return forgotten + cleared;
end;
$$;

create function public.svc_purgeable_files(p_limit integer) returns table (bucket text, path text)
  language sql security definer
  set search_path = ''
as $$ select * from internal.purgeable_files(p_limit); $$;

create function public.svc_forget_purged_files(p_paths text[]) returns integer
  language sql security definer
  set search_path = ''
as $$ select internal.forget_purged_files(p_paths); $$;

revoke execute on function internal.purgeable_files(integer), internal.forget_purged_files(text[]),
  public.svc_purgeable_files(integer), public.svc_forget_purged_files(text[])
  from public, anon, authenticated;
grant execute on function public.svc_purgeable_files(integer), public.svc_forget_purged_files(text[]) to service_role;
