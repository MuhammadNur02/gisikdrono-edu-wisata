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


-- ===== Self-escalation lock on profiles (docs/PRD.md §8.5.2–§8.5.3, Task P1.3.05) =====

-- 0005 grants authenticated an UPDATE on full_name, phone and avatar_path only; the revoke here
-- states the intent now and costs nothing.
revoke update (role, rw_id, is_active, mfa_required, email, claims_version) on public.profiles from authenticated;

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
-- so tokens minted before it stop working at the next request.
create function internal.profiles_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  protected_change boolean :=
    new.role is distinct from old.role
    or new.rw_id is distinct from old.rw_id
    or new.is_active is distinct from old.is_active
    or new.mfa_required is distinct from old.mfa_required
    or new.email is distinct from old.email;
  loses_superadmin boolean :=
    old.role = 'superadmin' and old.is_active and (new.role <> 'superadmin' or not new.is_active);
begin
  if not protected_change then
    return new;
  end if;

  if coalesce(current_setting('app.privileged_rpc', true), '') <> 'on' then
    raise exception 'role, rw_id, is_active, mfa_required and email change only through set_staff_role / set_staff_status'
      using errcode = '42501';
  end if;

  if new.id = internal.current_actor_id() then
    raise exception 'a staff member cannot change their own role or status'
      using errcode = '42501';
  end if;

  if loses_superadmin and not exists (
    select 1 from public.profiles p
    where p.role = 'superadmin' and p.is_active and p.id <> old.id
  ) then
    raise exception 'the last active superadmin cannot be demoted or deactivated'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  new.claims_version := old.claims_version + 1;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
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

revoke execute on function internal.in_rpc(), internal.in_adjustment() from public, anon, authenticated;

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
     and (new.subtotal_package, new.subtotal_addons, new.discount_amount, new.discount_note,
          new.total_amount, new.amount_paid, new.currency)
         is distinct from
         (old.subtotal_package, old.subtotal_addons, old.discount_amount, old.discount_note,
          old.total_amount, old.amount_paid, old.currency) then
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

revoke execute on function internal.guard_status_writes(), internal.bookings_immutable_guard(),
  internal.bookings_discount_guard(), internal.payments_immutable_guard(), internal.invoices_immutable_guard(),
  internal.booking_addons_freeze(), internal.tickets_require_paid_booking(), internal.tickets_no_revive()
  from public, anon, authenticated;
