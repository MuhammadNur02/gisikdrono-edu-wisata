-- 0005_policies_grants: who may read and write what through the API (docs/PRD.md §8.5, docs/Security.md §6,
-- Task P1.4). Every table has had RLS enabled and forced, and no grant, since 0003; this file grants the API
-- roles the least each one needs and writes the policies that pick their rows.
--
-- Superadmin and admin_rw share the authenticated role, so a column grant always applies to both. Columns no
-- staff member may read through the API (booker contacts, bank and treasury accounts, pay links, participant
-- names, outbox recipients) are therefore granted to nobody; they reach a screen only through the audited
-- RPCs (decisions of 2026-10-16). Columns are always listed, so a column added later stays private until a
-- migration grants it. Policies call the 0004 helpers wrapped in (select ...), so the JWT is read once per
-- statement, and never read auth.jwt() themselves, so is_active and claims_version apply everywhere. Every
-- table authenticated may touch also carries a restrictive AAL2 policy, written once at the end of the file:
-- no staff member reads or writes a single row without a verified authenticator.
--
-- The 0001 note that service_role access would be granted here is superseded: service_role keeps its
-- Supabase table rights and reaches internal.* only through the svc_* wrappers of 0004. The review of this
-- file (2026-10-17) also tightened a few 0003 and 0004 objects that the grants rely on; 0003 and 0004 are
-- merged, so those changes are made here, forward-only, next to the grants they protect.


-- ===== Baseline (Task P1.4.01, P1.4.07) =====

-- Already true since 0003; repeated so this file states the whole rule on its own.
do $$
declare
  public_table text;
begin
  for public_table in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', public_table);
    execute format('alter table public.%I force row level security', public_table);
  end loop;
end;
$$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on schema internal from public, anon, authenticated, service_role;

-- fresh_totp(): an authenticator code verified in the last five minutes, not just an AAL2 session that may have
-- been left open on a desk (AUTH-11, docs/Security.md §5.3). The superadmin's own writes ask for it through
-- restrictive policies at the end of this file, so it is an RLS helper callable by authenticated. It is the one
-- copy of the rule: internal.has_fresh_totp, which the 0004 staff RPCs call, now asks it.
create function public.fresh_totp() returns boolean
  language sql stable
  set search_path = ''
as $$
  select public.aal2() and exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as method
    where method ->> 'method' = 'totp' and (method ->> 'timestamp')::bigint > extract(epoch from now()) - 300
  );
$$;
create or replace function internal.has_fresh_totp() returns boolean
  language sql stable
  set search_path = ''
as $$
  select public.fresh_totp();
$$;

-- Functions: the RLS helpers and the staff RPCs that exist so far. A later staff RPC is granted in the
-- migration that creates it; the svc_* wrappers stay service_role only, as 0004 granted them.
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.today_jkt() to anon, authenticated;
grant execute on function public.app_role(), public.app_rw_id(), public.is_superadmin(), public.is_admin_rw(),
  public.is_staff(), public.owns_rw(smallint), public.owns_any_rw(smallint[]), public.aal2(), public.fresh_totp()
  to authenticated;
grant execute on function public.generate_visit_sessions(smallint, date, date), public.rpc_log_ui_event(text, uuid),
  public.set_staff_role(uuid, public.app_role, smallint), public.set_staff_status(uuid, boolean, text),
  public.reset_staff_mfa(uuid), public.cancel_staff_mfa_reset(uuid), public.cancel_superadmin_promotion(uuid),
  public.rpc_reveal_booking_contact(uuid, text), public.rpc_get_participants(uuid)
  to authenticated;


-- ===== Configuration: rw_units, profiles, staff_invites, site_settings =====

-- rw_units: the public profile of each RW. The treasury account is granted to no API role; the superadmin
-- edits it through an RPC that comes with the finance pages (P4). An RW admin edits their own RW's content;
-- code, slug and status are not granted for update at all, which rw_units_guard enforces as well.
grant select (id, code, slug, name, theme_label, tagline, description_md, vision_md, hero_image_path,
  contact_phone, contact_email, map_lat, map_lng, is_active, sort_order) on public.rw_units to anon;
grant select (id, code, slug, name, theme_label, tagline, description_md, vision_md, hero_image_path,
  contact_phone, contact_email, map_lat, map_lng, is_active, sort_order, created_at, updated_at)
  on public.rw_units to authenticated;
grant insert (id, code, slug, name, theme_label, tagline, description_md, vision_md, hero_image_path,
  contact_phone, contact_email, map_lat, map_lng, is_active, sort_order) on public.rw_units to authenticated;
grant update (name, theme_label, tagline, description_md, vision_md, hero_image_path, contact_phone,
  contact_email, map_lat, map_lng, sort_order) on public.rw_units to authenticated;

create policy rw_units_public_read on public.rw_units for select to anon using (is_active);
create policy rw_units_staff_read on public.rw_units for select to authenticated
  using ((select public.is_staff()));
create policy rw_units_super_insert on public.rw_units for insert to authenticated
  with check ((select public.is_superadmin()));
create policy rw_units_staff_update on public.rw_units for update to authenticated
  using ((select public.owns_rw(id))) with check ((select public.owns_rw(id)));

-- profiles: staff see their own row and their RW's colleagues; the superadmin sees everyone. A staff member
-- edits only their own name, phone and avatar; role, RW, status and the pending requests move through the
-- staff RPCs (profiles_guard, 0004).
grant select (id, email, full_name, phone, role, rw_id, is_active, mfa_required, claims_version, avatar_path,
  last_login_at, created_by, created_at, updated_at, mfa_reset_requested_at, mfa_reset_requested_by,
  promotion_requested_at, promotion_requested_by) on public.profiles to authenticated;
grant update (full_name, phone, avatar_path) on public.profiles to authenticated;

create policy profiles_staff_read on public.profiles for select to authenticated using (
  (select public.is_superadmin())
  or ((select public.is_admin_rw()) and (id = (select auth.uid()) or rw_id = (select public.app_rw_id())))
);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select public.is_superadmin()) or ((select public.is_staff()) and id = (select auth.uid())))
  with check ((select public.is_superadmin()) or ((select public.is_staff()) and id = (select auth.uid())));

-- staff_invites: the superadmin's alone (FR-ADMIN-01). An invite names its creator and is later only revoked;
-- accepting one happens in the onboarding service. The code's hash is written once and read by no API role,
-- so nobody can try codes against it offline; onboarding compares it inside the database. An invite lives
-- 72 hours at most, whatever expiry its creator sends, and writing one needs a fresh TOTP code (end of file).
grant select (id, email, role, rw_id, expires_at, accepted_at, accepted_user_id, revoked_at, created_by, created_at)
  on public.staff_invites to authenticated;
grant insert (email, role, rw_id, invite_code_hash, expires_at, created_by) on public.staff_invites to authenticated;
grant update (revoked_at) on public.staff_invites to authenticated;
alter table public.staff_invites add constraint staff_invites_expiry_72h
  check (expires_at <= created_at + interval '72 hours');

create policy staff_invites_super_read on public.staff_invites for select to authenticated
  using ((select public.is_superadmin()));
create policy staff_invites_super_insert on public.staff_invites for insert to authenticated
  with check ((select public.is_superadmin()) and created_by = (select auth.uid()));
create policy staff_invites_super_revoke on public.staff_invites for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));

-- site_settings: public keys for everyone, the rest for the superadmin, who alone writes them. Whoever writes
-- a setting signs it with their own id, with a fresh TOTP code (end of file). Only the keys docs/PRD.md §8.6
-- marks public may be public, so a slipped flag never publishes a private value such as the payout account.
alter table public.site_settings add constraint site_settings_public_keys check (
  not is_public or key in ('booking_enabled', 'maintenance_mode', 'booking.min_lead_hours', 'booking.max_advance_days',
                           'booking.max_pax', 'contact.whatsapp_number', 'contact.email', 'kelurahan.address',
                           'seo.default_description')
);
grant select (key, value, is_public) on public.site_settings to anon;
grant select (key, value, is_public, description, updated_by, updated_at) on public.site_settings to authenticated;
grant insert (key, value, is_public, description, updated_by) on public.site_settings to authenticated;
grant update (value, is_public, description, updated_by) on public.site_settings to authenticated;
grant delete on public.site_settings to authenticated;

create policy site_settings_public_read on public.site_settings for select to anon using (is_public);
create policy site_settings_staff_read on public.site_settings for select to authenticated
  using ((select public.is_superadmin()) or ((select public.is_staff()) and is_public));
create policy site_settings_super_insert on public.site_settings for insert to authenticated
  with check ((select public.is_superadmin()) and updated_by = (select auth.uid()));
create policy site_settings_super_update on public.site_settings for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()) and updated_by = (select auth.uid()));
create policy site_settings_super_delete on public.site_settings for delete to authenticated
  using ((select public.is_superadmin()));

-- Three settings are read by functions that cannot run safely without them: the price floor, how long a
-- quotation holds and how long a booker's contact is kept. Anyone may change them, nobody may remove them or
-- set them to anything but a number, so a stale session cannot quietly switch the floor or the retention off.
create function internal.site_settings_required_keys() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  required_keys constant text[] := array['pricing.min_price_per_pax', 'booking.quotation_valid_days',
                                         'pii_retention_months'];
begin
  if tg_op <> 'INSERT' and old.key = any (required_keys) and (tg_op = 'DELETE' or new.key <> old.key) then
    raise exception 'site setting % is required and cannot be removed', old.key
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if tg_op <> 'DELETE' and new.key = any (required_keys) and jsonb_typeof(new.value) <> 'number' then
    raise exception 'site setting % must be a number', new.key using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger site_settings_required_keys before insert or update or delete on public.site_settings
  for each row execute function internal.site_settings_required_keys();
revoke execute on function internal.site_settings_required_keys() from public, anon, authenticated, service_role;

-- price_floor() replaces its 0004 version, which returned NULL without the setting and so left every price
-- unfloored: a package write now fails until the floor exists (0008_seed writes it in every environment).
create or replace function internal.price_floor() returns bigint
  language plpgsql stable
  set search_path = ''
as $$
declare
  floor_price bigint := (select (value #>> '{}')::bigint from public.site_settings
                         where key = 'pricing.min_price_per_pax');
begin
  if floor_price is null then
    raise exception 'site setting pricing.min_price_per_pax is missing, so no price can be checked against the floor'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return floor_price;
end;
$$;


-- ===== Sessions: session_templates, visit_sessions, v_session_availability =====

-- session_templates: each RW plans its own week.
grant select (id, rw_id, weekday, label, start_time, end_time, capacity, is_active, created_at, updated_at)
  on public.session_templates to authenticated;
grant insert (rw_id, weekday, label, start_time, end_time, capacity, is_active) on public.session_templates to authenticated;
grant update (weekday, label, start_time, end_time, capacity, is_active) on public.session_templates to authenticated;
grant delete on public.session_templates to authenticated;

create policy session_templates_staff on public.session_templates for all to authenticated
  using ((select public.owns_rw(rw_id))) with check ((select public.owns_rw(rw_id)));

-- visit_sessions: anyone may see the open calendar from today on, which v_session_availability reads with
-- its reader's rights; staff manage their own RW's sessions. The counters are never granted for insert or
-- update: only the transition functions move them (review M4; guard_status_inserts and guard_status_writes
-- in 0004 refuse them as well). A session created by hand is signed by its creator.
grant select (id, rw_id, session_date, start_time, end_time, label, capacity, reserved_pax, status)
  on public.visit_sessions to anon;
grant select (id, rw_id, session_date, start_time, end_time, label, capacity, reserved_pax, checked_in_pax, status,
  template_id, notes, created_by, created_at, updated_at) on public.visit_sessions to authenticated;
grant insert (rw_id, session_date, start_time, end_time, label, capacity, status, template_id, notes, created_by)
  on public.visit_sessions to authenticated;
grant update (session_date, start_time, end_time, label, capacity, status, notes) on public.visit_sessions to authenticated;
grant delete on public.visit_sessions to authenticated;
grant select on public.v_session_availability to anon, authenticated;

create policy visit_sessions_public_read on public.visit_sessions for select to anon
  using (status = 'open' and session_date >= (select public.today_jkt()));
create policy visit_sessions_staff_read on public.visit_sessions for select to authenticated
  using ((select public.owns_rw(rw_id)));
create policy visit_sessions_staff_insert on public.visit_sessions for insert to authenticated
  with check ((select public.owns_rw(rw_id)) and created_by = (select auth.uid()));
create policy visit_sessions_staff_update on public.visit_sessions for update to authenticated
  using ((select public.owns_rw(rw_id))) with check ((select public.owns_rw(rw_id)));
create policy visit_sessions_staff_delete on public.visit_sessions for delete to authenticated
  using ((select public.owns_rw(rw_id)));

-- A foreign key checks that its row exists, past RLS, so the reference columns below need their own scope
-- check: an RW admin points only at rows of their own RW, and a row that does not exist gets the same
-- refusal as another RW's, so the check reveals nothing about either. The superadmin and the system may
-- point anywhere.
create function internal.visit_sessions_template_rw_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.template_id is not null and not internal.is_superadmin_or_system()
     and not exists (select 1 from public.session_templates t where t.id = new.template_id and t.rw_id = new.rw_id) then
    raise exception 'a session follows a template of its own RW' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger visit_sessions_template_rw_guard before insert or update of template_id, rw_id on public.visit_sessions
  for each row execute function internal.visit_sessions_template_rw_guard();
revoke execute on function internal.visit_sessions_template_rw_guard() from public, anon, authenticated, service_role;


-- ===== Catalogue: tour_packages, tour_package_legs, tour_package_price_tiers, package_price_history,
--       umkm_vendors, products_umkm =====
-- Published rows are public. An RW admin manages their own RW's catalogue and reads, never edits, a combo
-- that visits their RW (REC-14); only the superadmin deletes a package, a vendor or a product, which the RW
-- admin archives through its status instead (decision of 2026-10-16). Whoever creates a row signs it with their
-- own id; a new package carries that id as its last editor too, and whoever edits a package signs the edit.

grant select (id, rw_id, category, slug, name, tagline, description_md, highlights, inclusions, itinerary,
  duration_minutes, pricing_basis, price_per_pax, flat_price, min_pax, max_pax, image_paths, is_featured, status,
  sort_order, valid_from, valid_to, created_at, updated_at) on public.tour_packages to anon;
grant select (id, rw_id, category, slug, name, tagline, description_md, highlights, inclusions, itinerary,
  duration_minutes, pricing_basis, price_per_pax, flat_price, min_pax, max_pax, image_paths, is_featured, status,
  sort_order, valid_from, valid_to, created_by, updated_by, created_at, updated_at) on public.tour_packages to authenticated;
grant insert (rw_id, category, slug, name, tagline, description_md, highlights, inclusions, itinerary,
  duration_minutes, pricing_basis, price_per_pax, flat_price, min_pax, max_pax, image_paths, is_featured, status,
  sort_order, valid_from, valid_to, created_by, updated_by) on public.tour_packages to authenticated;
grant update (category, slug, name, tagline, description_md, highlights, inclusions, itinerary, duration_minutes,
  pricing_basis, price_per_pax, flat_price, min_pax, max_pax, image_paths, is_featured, status, sort_order,
  valid_from, valid_to, updated_by) on public.tour_packages to authenticated;
grant delete on public.tour_packages to authenticated;

create policy tour_packages_public_read on public.tour_packages for select to anon using (status = 'published');
create policy tour_packages_staff_read on public.tour_packages for select to authenticated using (
  (select public.owns_rw(rw_id))
  or exists (select 1 from public.tour_package_legs l
             where l.package_id = tour_packages.id and l.rw_id = (select public.app_rw_id()))
);
create policy tour_packages_staff_insert on public.tour_packages for insert to authenticated
  with check ((select public.owns_rw(rw_id)) and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy tour_packages_staff_update on public.tour_packages for update to authenticated
  using ((select public.owns_rw(rw_id)))
  with check ((select public.owns_rw(rw_id)) and updated_by = (select auth.uid()));
create policy tour_packages_super_delete on public.tour_packages for delete to authenticated
  using ((select public.is_superadmin()));

-- tour_package_legs: a leg belongs to the RW it visits, so an RW admin never sees the other RW's leg of a
-- combo. The package's read policy asks the legs, and Postgres refuses policies that ask each other, so the
-- rules that need the package itself (a combo's legs are the superadmin's; an RW package visits its own RW
-- only) sit in the trigger tour_package_legs_guard below. An RW admin who names a package that is not one of
-- their RW's, a combo, another RW's package or one that does not exist, gets one answer for all three, so the
-- guard tells them nothing about packages they cannot read.
grant select (id, package_id, rw_id, leg_order, duration_minutes, notes) on public.tour_package_legs to anon, authenticated;
grant insert (package_id, rw_id, leg_order, duration_minutes, notes) on public.tour_package_legs to authenticated;
grant update (leg_order, duration_minutes, notes) on public.tour_package_legs to authenticated;
grant delete on public.tour_package_legs to authenticated;

create policy tour_package_legs_public_read on public.tour_package_legs for select to anon using (
  exists (select 1 from public.tour_packages p where p.id = tour_package_legs.package_id and p.status = 'published')
);
create policy tour_package_legs_staff on public.tour_package_legs for all to authenticated
  using ((select public.owns_rw(rw_id))) with check ((select public.owns_rw(rw_id)));

create function internal.tour_package_legs_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  package record;
begin
  select p.category, p.rw_id into package from public.tour_packages p where p.id = coalesce(new.package_id, old.package_id);
  if not internal.is_superadmin_or_system() and (package.rw_id is null or not public.owns_rw(package.rw_id)) then
    raise exception 'an RW admin changes the legs of their own RW''s packages only' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' and package.category <> 'combo' and new.rw_id is distinct from package.rw_id then
    raise exception 'an RW package visits its own RW only' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger tour_package_legs_guard before insert or update or delete on public.tour_package_legs
  for each row execute function internal.tour_package_legs_guard();
revoke execute on function internal.tour_package_legs_guard() from public, anon, authenticated, service_role;

-- tour_package_price_tiers: follow their package, readable where it is and editable where its RW is owned.
grant select (id, package_id, min_pax, max_pax, price_per_pax) on public.tour_package_price_tiers to anon, authenticated;
grant insert (package_id, min_pax, max_pax, price_per_pax) on public.tour_package_price_tiers to authenticated;
grant update (min_pax, max_pax, price_per_pax) on public.tour_package_price_tiers to authenticated;
grant delete on public.tour_package_price_tiers to authenticated;

create policy tour_package_price_tiers_public_read on public.tour_package_price_tiers for select to anon using (
  exists (select 1 from public.tour_packages p where p.id = tour_package_price_tiers.package_id and p.status = 'published')
);
create policy tour_package_price_tiers_staff_read on public.tour_package_price_tiers for select to authenticated using (
  exists (select 1 from public.tour_packages p where p.id = tour_package_price_tiers.package_id)
);
create policy tour_package_price_tiers_staff_write on public.tour_package_price_tiers for all to authenticated using (
  exists (select 1 from public.tour_packages p
          where p.id = tour_package_price_tiers.package_id and (select public.owns_rw(p.rw_id)))
) with check (
  exists (select 1 from public.tour_packages p
          where p.id = tour_package_price_tiers.package_id and (select public.owns_rw(p.rw_id)))
);

-- package_price_history: written by trigger only; an RW admin reads their own packages' history.
grant select (id, package_id, tier_id, changed_by, old_price_per_pax, new_price_per_pax, old_flat_price,
  new_flat_price, reason, changed_at, old_pricing_basis, new_pricing_basis, old_min_pax, new_min_pax, old_max_pax,
  new_max_pax) on public.package_price_history to authenticated;

create policy package_price_history_staff_read on public.package_price_history for select to authenticated using (
  exists (select 1 from public.tour_packages p
          where p.id = package_price_history.package_id and (select public.owns_rw(p.rw_id)))
);

-- umkm_vendors: the public sees an active vendor's name and story, staff their own RW's vendors. The owner's
-- name and phone are staff-only, and the bank account goes to no API role (decision of 2026-10-16).
grant select (id, rw_id, slug, name, description_md, logo_path, is_active) on public.umkm_vendors to anon;
grant select (id, rw_id, slug, name, owner_name, phone, description_md, logo_path, is_active, created_by, created_at,
  updated_at) on public.umkm_vendors to authenticated;
grant insert (rw_id, slug, name, owner_name, phone, description_md, logo_path, is_active, created_by)
  on public.umkm_vendors to authenticated;
grant update (slug, name, owner_name, phone, description_md, logo_path, is_active) on public.umkm_vendors to authenticated;
grant delete on public.umkm_vendors to authenticated;

create policy umkm_vendors_public_read on public.umkm_vendors for select to anon using (is_active);
create policy umkm_vendors_staff_read on public.umkm_vendors for select to authenticated
  using ((select public.owns_rw(rw_id)));
create policy umkm_vendors_staff_insert on public.umkm_vendors for insert to authenticated
  with check ((select public.owns_rw(rw_id)) and created_by = (select auth.uid()));
create policy umkm_vendors_staff_update on public.umkm_vendors for update to authenticated
  using ((select public.owns_rw(rw_id))) with check ((select public.owns_rw(rw_id)));
create policy umkm_vendors_super_delete on public.umkm_vendors for delete to authenticated
  using ((select public.is_superadmin()));

-- products_umkm
grant select (id, rw_id, vendor_id, slug, name, category, description_md, price, unit_label, min_order_qty,
  max_order_qty, lead_time_days, is_addon_eligible, is_available, is_featured, image_paths, status, sort_order,
  created_at, updated_at) on public.products_umkm to anon;
grant select (id, rw_id, vendor_id, slug, name, category, description_md, price, unit_label, min_order_qty,
  max_order_qty, lead_time_days, is_addon_eligible, is_available, is_featured, image_paths, status, sort_order,
  created_by, created_at, updated_at) on public.products_umkm to authenticated;
grant insert (rw_id, vendor_id, slug, name, category, description_md, price, unit_label, min_order_qty, max_order_qty,
  lead_time_days, is_addon_eligible, is_available, is_featured, image_paths, status, sort_order, created_by)
  on public.products_umkm to authenticated;
grant update (vendor_id, slug, name, category, description_md, price, unit_label, min_order_qty, max_order_qty,
  lead_time_days, is_addon_eligible, is_available, is_featured, image_paths, status, sort_order)
  on public.products_umkm to authenticated;
grant delete on public.products_umkm to authenticated;

create policy products_umkm_public_read on public.products_umkm for select to anon using (status = 'published');
create policy products_umkm_staff_read on public.products_umkm for select to authenticated
  using ((select public.owns_rw(rw_id)));
create policy products_umkm_staff_insert on public.products_umkm for insert to authenticated
  with check ((select public.owns_rw(rw_id)) and created_by = (select auth.uid()));
create policy products_umkm_staff_update on public.products_umkm for update to authenticated
  using ((select public.owns_rw(rw_id))) with check ((select public.owns_rw(rw_id)));
create policy products_umkm_super_delete on public.products_umkm for delete to authenticated
  using ((select public.is_superadmin()));


-- ===== Bookings: bookings, booking_legs, booking_addons, booking_participants, booking_events, guest_otps =====
-- No API role reads a booker's contact or a participant's name (DATA-04, AZ-12): those columns are granted to
-- nobody and leave the database only through rpc_reveal_booking_contact and rpc_get_participants, which audit
-- every read. An RW admin sees a booking that visits their RW from a week before its visit until a month
-- ahead; the superadmin sees every booking (decision of 2026-10-16). Today's visits, and so today's check-in
-- and certificates, always fall inside that window. The legs and add-ons are scoped by RW alone, so visit
-- statistics and RW recaps can count every period; an add-on's note, the one free text among them, is
-- granted to nobody.
--
-- A booking's total stays readable, a combo's included (accepted risk R14: its prices are published). The
-- add-on subtotal, the discount and its note are not: for a combo they are the other RW's sales and a price the
-- superadmin negotiated, which no published price explains, and the note is free text. The superadmin reads
-- them through the finance RPC of P4.7.01.
grant select (id, booking_code, status, channel, package_id, package_snapshot, rw_ids, booker_type, institution_name,
  pax_count, visit_date, visit_date_end, notes, subtotal_package, total_amount, amount_paid, currency, expires_at,
  quoted_at, paid_at, checked_in_at, completed_at, cancelled_at, cancelled_by, cancel_reason, expired_at, refunded_at,
  needs_review, review_reason, phone_verified_at, email_verified_at, consent_version, consented_at, token_version,
  ticket_pdf_path, admin_notes, created_by, created_at, updated_at, pii_purged_at, phone_masked, email_masked,
  pic_first_name) on public.bookings to authenticated;
-- A discount also recomputes the total, so it waits for its own RPC (P4); staff write notes only.
grant update (admin_notes) on public.bookings to authenticated;

-- v_bookings_staff and v_booking_admin replace their 0004 versions. Both read with their invoker's rights, so
-- every column withheld here and below leaves them too: the add-on subtotal and the discount, and each payment's
-- amount. A view cannot lose a column in place, so both are dropped and created again. The staff booking
-- list: contact details appear only masked, rpc_reveal_booking_contact being the one way to the real values.
-- docs/Security.md STAFF-02: an RW admin sees the money of their own RW's bookings, because they set those
-- prices, but a combo's total also holds the other RW's share, so only the superadmin sees it on screen. An RW
-- admin sees bookings visiting from a week ago to a month ahead.
drop view public.v_booking_admin;
drop view public.v_bookings_staff;
create view public.v_bookings_staff with (security_invoker = true) as
select
  b.id, b.booking_code, b.status, b.channel, b.package_id, p.name as package_name, b.rw_ids, b.booker_type,
  b.institution_name, b.pic_first_name, b.phone_masked, b.email_masked,
  b.phone_verified_at is not null as is_phone_verified, b.email_verified_at is not null as is_email_verified,
  b.pii_purged_at is not null as is_anonymised,
  b.pax_count, b.visit_date, b.visit_date_end, b.notes, b.admin_notes,
  money.shows_amounts,
  case when money.shows_amounts then b.subtotal_package end as subtotal_package,
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

-- The booking detail page: the list row plus its payments, tickets and invoices, the payments without their
-- amounts.
create view public.v_booking_admin with (security_invoker = true) as
select v.*,
  (select jsonb_agg(jsonb_build_object('attempt_no', py.attempt_no, 'method', py.method, 'status', py.status,
                                       'order_id', py.order_id, 'settlement_time', py.settlement_time)
                    order by py.attempt_no)
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

-- v_booking_export feeds the exports, which carry a watermark, a rate limit and an audit row, so it is
-- granted to nobody and read by rpc_create_export (P4.6.01).
grant select on public.v_bookings_staff, public.v_booking_admin to authenticated;

create policy bookings_staff_read on public.bookings for select to authenticated using (
  (select public.is_superadmin())
  or ((select public.owns_any_rw(rw_ids))
      and visit_date_end >= (select public.today_jkt()) - 7 and visit_date <= (select public.today_jkt()) + 30)
);
create policy bookings_staff_notes on public.bookings for update to authenticated using (
  (select public.is_superadmin())
  or ((select public.owns_any_rw(rw_ids))
      and visit_date_end >= (select public.today_jkt()) - 7 and visit_date <= (select public.today_jkt()) + 30)
) with check (
  (select public.is_superadmin())
  or ((select public.owns_any_rw(rw_ids))
      and visit_date_end >= (select public.today_jkt()) - 7 and visit_date <= (select public.today_jkt()) + 30)
);

grant select (id, booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at,
  quota_released_at, checked_in_at) on public.booking_legs to authenticated;
create policy booking_legs_staff_read on public.booking_legs for select to authenticated
  using ((select public.owns_rw(rw_id)));

-- booking_addons: the kitchen of each RW marks its own lines prepared or handed over. These lines are the money
-- an RW admin reads per booking: their own RW's, never the other RW's lines of a combo (STAFF-02). A line's note
-- is the visitor's free text and the lines have no booking window, so the note is granted to nobody; the kitchen
-- reads it inside the window through the booking detail RPC of P4.3.02.
grant select (id, booking_id, product_id, rw_id, vendor_id, product_name_snapshot, unit_price, qty, line_total,
  fulfillment_status, created_at, updated_at) on public.booking_addons to authenticated;
grant update (fulfillment_status) on public.booking_addons to authenticated;
create policy booking_addons_staff_read on public.booking_addons for select to authenticated
  using ((select public.owns_rw(rw_id)));
create policy booking_addons_staff_fulfil on public.booking_addons for update to authenticated
  using ((select public.owns_rw(rw_id))) with check ((select public.owns_rw(rw_id)));

-- anonymise_booker_pii replaces its 0004 version, which left an add-on's note in place and skipped the
-- retention group when pii_retention_months was missing. The note is the visitor's own text for the kitchen and
-- may name someone, so it now goes with the booker's contact, and a missing setting stops the whole run with an
-- error instead of keeping every contact (0008_seed writes it in every environment, and
-- site_settings_required_keys keeps it there). The function keeps its 0004 grants. Two groups lose their
-- booker's contact: unpaid bookings a week after they expired or were cancelled (with their participants,
-- since they never visited), and every booking pii_retention_months after its visit. Along with the contact go
-- the verification stamps, every free-text field that may name someone (the visitor's notes on the booking and
-- its add-ons, staff notes, cancel, review and discount reasons), the IP and user agent, every guest link
-- (token_version) and the outbox rows that still name the contact. Expired OTP rows go the day after.
create or replace function internal.anonymise_booker_pii() returns integer
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
  if retention_months is null then
    raise exception 'site setting pii_retention_months is missing, so no booker contact can be erased on time'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
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
  ), forgotten_addon_notes as (
    update public.booking_addons ad set notes = null
    from anonymised_bookings a where ad.booking_id = a.id and ad.notes is not null
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

-- booking_participants: no grant at all; names only through rpc_get_participants, corrections with their UI
-- (decision of 2026-10-16). It still gets the AAL2 policy at the end of the file, ready for the day a grant
-- is added.

-- rpc_reveal_booking_contact and rpc_get_participants replace their 0004 versions, so that both spend one daily
-- budget of personal-data reveals per staff member (docs/Security.md §6.6, MON-07): the 0004 participant read
-- was audited but wrote no pii_revealed event, so it escaped the cap and the anomaly scan. Each reveal is a
-- pii_revealed security event; the 50th of the caller's Jakarta day also raises an alert, and the 51st is
-- refused. (A refused call cannot write anything, which is why the alert comes with the 50th.)
create function internal.record_pii_reveal(p_booking_id uuid, p_rw_id smallint, p_details jsonb) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  daily_cap constant integer := 50;
  revealed_today integer;
begin
  -- One staff member's reveals take turns, so parallel calls cannot all count below the cap.
  perform pg_advisory_xact_lock(hashtext('pii_reveal:' || auth.uid()::text));
  select count(*) into revealed_today from public.security_events e
  where e.event_type = 'pii_revealed' and e.actor_id = auth.uid()
    and e.occurred_at >= public.today_jkt()::timestamp at time zone 'Asia/Jakarta';
  if revealed_today >= daily_cap then
    raise exception 'the daily limit of % personal-data reveals is reached', daily_cap
      using errcode = 'P0001', hint = 'RATE_LIMITED';
  end if;

  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('pii_revealed', 'info', auth.uid(), p_rw_id, 'bookings', p_booking_id::text, p_details);
  if revealed_today + 1 >= daily_cap then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('pii_reveal_cap', 'high', 'pii_reveal_cap:' || auth.uid() || ':' || public.today_jkt(),
            'Batas harian buka data pribadi tercapai', jsonb_build_object('actor_id', auth.uid(), 'cap', daily_cap))
    on conflict (fingerprint) where acknowledged_at is null do nothing;
  end if;
end;
$$;
revoke execute on function internal.record_pii_reveal(uuid, smallint, jsonb) from public, anon, authenticated, service_role;

-- The booker's full contact for one booking, with the reason the staff member gave.
create or replace function public.rpc_reveal_booking_contact(p_booking_id uuid, p_reason text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  rw_ids smallint[] := internal.require_booking_pii_access(p_booking_id);
  contact jsonb;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'a reveal needs a reason of 3 to 300 characters' using errcode = '22023';
  end if;
  perform internal.record_pii_reveal(p_booking_id, rw_ids[1], jsonb_build_object('reason', btrim(p_reason)));
  select jsonb_build_object('pic_name', b.pic_name, 'pic_phone', b.pic_phone, 'pic_email', b.pic_email) into contact
  from public.bookings b where b.id = p_booking_id;
  return contact;
end;
$$;

-- The participant list of one booking, at most 300 rows, counted as one reveal and audited with its rows.
create or replace function public.rpc_get_participants(p_booking_id uuid) returns setof public.booking_participants
  language plpgsql security definer
  set search_path = ''
as $$
declare
  row_cap constant integer := 300;
  rw_ids smallint[] := internal.require_booking_pii_access(p_booking_id);
  returned integer;
begin
  perform internal.record_pii_reveal(p_booking_id, rw_ids[1], jsonb_build_object('count', 'participants'));
  return query
    select p.* from public.booking_participants p where p.booking_id = p_booking_id order by p.seq_no limit row_cap;
  get diagnostics returned = row_count;
  perform internal.log_audit('participants.read', 'bookings', p_booking_id::text,
    jsonb_build_object('rows', returned, 'rw_id', rw_ids[1]));
end;
$$;

-- booking_events: a booking's timeline, visible wherever the booking itself is.
grant select (id, booking_id, from_status, to_status, actor_type, actor_id, reason, payload, occurred_at)
  on public.booking_events to authenticated;
create policy booking_events_staff_read on public.booking_events for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = booking_events.booking_id)
);

-- guest_otps: nothing at all; only issue_phone_otp and verify_phone_otp touch it.


-- ===== Payments and documents: payments, payment_events, webhook_rejections, payment_adjustments,
--       reconciliation_runs, reconciliation_issues, quotations, invoices, document_sequences =====
-- Every write here belongs to the transition functions and the jobs. Staff read a payment, a quotation and an
-- invoice where they read its booking, but not their amounts: a payment, an invoice and a quotation each carry
-- the whole booking's money, which for a combo holds the other RW's share, and superadmin and admin_rw share
-- one role, so the amount columns and the document snapshots are granted to nobody. The superadmin reads them
-- through the finance RPC of P4.7.01; an RW admin's money per booking is their own RW's add-on lines and ledger
-- keys (STAFF-02). Nobody reads the hosted pay link, the snap token, the VA number or the stored Midtrans reply,
-- which carries the VA number too (decision of 2026-10-16). Events, rejections, adjustments and reconciliation
-- are the superadmin's alone, and a payment event's payload stays in the database, like the stored reply.

grant select (id, booking_id, attempt_no, provider, method, status, order_id, provider_txn_id, payment_type_raw,
  va_bank, transaction_time, settlement_time, expiry_time, fraud_status, status_code, manual_proof_path,
  manual_reference, recorded_by, created_at, updated_at)
  on public.payments to authenticated;
create policy payments_staff_read on public.payments for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = payments.booking_id)
);

grant select (id, payment_id, order_id, source, event_hash, transaction_status, fraud_status, status_code,
  gross_amount_raw, received_at, processed_at, processing_result) on public.payment_events to authenticated;
create policy payment_events_super_read on public.payment_events for select to authenticated
  using ((select public.is_superadmin()));

grant select (id, provider, reason, order_id, status_code, body_sha256, ip, user_agent, received_at)
  on public.webhook_rejections to authenticated;
create policy webhook_rejections_super_read on public.webhook_rejections for select to authenticated
  using ((select public.is_superadmin()));

-- payment_adjustments: proposed, approved and applied through their RPCs (P4.7.03).
grant select (id, booking_id, payment_id, type, status, amount, reason, evidence_path, proposed_by, proposed_at,
  approved_by, approved_at, rejected_reason, apply_not_before, applied_at) on public.payment_adjustments to authenticated;
create policy payment_adjustments_super_read on public.payment_adjustments for select to authenticated
  using ((select public.is_superadmin()));

grant select (id, run_date, source, started_at, finished_at, payments_checked, issues_found, ledger_chain_ok,
  audit_chain_ok, summary, created_by) on public.reconciliation_runs to authenticated;
create policy reconciliation_runs_super_read on public.reconciliation_runs for select to authenticated
  using ((select public.is_superadmin()));

-- reconciliation_issues: the superadmin resolves an issue in their own name.
grant select (id, run_id, booking_id, payment_id, issue_type, severity, details, resolved_at, resolved_by,
  resolution_note, created_at) on public.reconciliation_issues to authenticated;
grant update (resolved_at, resolved_by, resolution_note) on public.reconciliation_issues to authenticated;
create policy reconciliation_issues_super_read on public.reconciliation_issues for select to authenticated
  using ((select public.is_superadmin()));
create policy reconciliation_issues_super_resolve on public.reconciliation_issues for update to authenticated
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()) and resolved_by = (select auth.uid()));

-- quotations and invoices: read where their booking is, without the amounts and the snapshot (above).
grant select (id, booking_id, quotation_number, verify_code, version, status, issued_at, valid_until, pdf_path,
  issued_by) on public.quotations to authenticated;
create policy quotations_staff_read on public.quotations for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = quotations.booking_id)
);

grant select (id, booking_id, invoice_number, status, issued_at, due_date, paid_at, payment_id, receipt_number,
  credit_note_number, pdf_path, receipt_pdf_path, credit_note_pdf_path, void_reason, voided_at, created_at, updated_at)
  on public.invoices to authenticated;
create policy invoices_staff_read on public.invoices for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = invoices.booking_id)
);

-- document_sequences: nothing at all; only next_document_number touches it.


-- ===== Tickets: tickets_qr, ticket_scans, certificates, v_attendance_today =====
-- Each RW's gate sees its own tickets and scans, without the booking window, since a ticket carries no
-- personal data; check-in itself goes through check_in_ticket (P4.4). A participant certificate names a
-- participant, often a child, so recipient_name is granted to nobody (decision of 2026-10-16).

grant select (id, booking_id, booking_leg_id, rw_id, visit_session_id, ticket_code, status, valid_on, valid_from,
  valid_until, pax_count, key_id, issued_at, checked_in_at, checked_in_pax, unpaid_pax, checked_in_by, check_in_note,
  suspended_at, suspend_reason, revoked_at, revoked_by, revoke_reason, updated_at) on public.tickets_qr to authenticated;
create policy tickets_qr_staff_read on public.tickets_qr for select to authenticated
  using ((select public.owns_rw(rw_id)));

-- ticket_scans: what an officer scanned is kept only as the sha256 hex of the scanned string, so a scan log is
-- never a list of working tickets: for a valid ticket the string is the signed token itself. 0003 kept its
-- first 128 characters. The digest still matches repeated scans of one string, and no API role reads it. The
-- officer's IP address and device are personal data of a colleague, kept for the security review, so they are
-- granted to nobody either.
alter table public.ticket_scans drop constraint ticket_scans_raw_payload_check;
alter table public.ticket_scans add constraint ticket_scans_raw_payload_sha256 check (raw_payload ~ '^[0-9a-f]{64}$');
grant select (id, attempt_id, ticket_id, rw_id, scanned_by, phase, result, source, attendee_count, override_reason,
  scanned_at) on public.ticket_scans to authenticated;
create policy ticket_scans_staff_read on public.ticket_scans for select to authenticated
  using ((select public.owns_rw(rw_id)));

-- certificates: the verify code opens /verifikasi/[code], which shows a participant certificate's name (FR-PUB-20),
-- and the certificates have no booking window, so an RW admin holding every code of their RW could read names
-- the window and rpc_get_participants keep from them. The code is granted to nobody; the server builds the
-- verification URL it prints on the PDF.
grant select (id, booking_id, participant_id, kind, certificate_number, status, institution_name, visit_date, rw_ids,
  template_version, pdf_path, rendered_at, released_at, release_waived_by, issued_at, issued_by, revoked_at,
  revoke_reason, purged_at) on public.certificates to authenticated;
create policy certificates_staff_read on public.certificates for select to authenticated
  using ((select public.owns_any_rw(rw_ids)));

grant select on public.v_attendance_today to authenticated;


-- ===== Content: galleries, articles, booklets, hero_banners, activity_points, performance_schedules, reviews =====
-- Published content is public, without the staff ids behind it or a gallery item's link to a booking. An RW
-- admin manages their own RW's content; kelurahan-level rows (rw_id NULL) and the hero banners are the
-- superadmin's. Only the superadmin publishes an article (articles_moderation_guard, 0004) and deletes an
-- article or a booklet (decision of 2026-10-16). Whoever creates a row signs it with their own id.

grant select (id, rw_id, category, media_type, storage_path, thumbnail_path, video_url, width, height, blurhash, caption,
  alt_text, taken_at, tags, status, sort_order, created_at, updated_at) on public.galleries to anon;
grant select (id, rw_id, category, media_type, storage_path, thumbnail_path, video_url, width, height, blurhash, caption,
  alt_text, taken_at, booking_id, tags, status, sort_order, uploaded_by, created_at, updated_at)
  on public.galleries to authenticated;
grant insert (rw_id, category, media_type, storage_path, thumbnail_path, video_url, width, height, blurhash, caption,
  alt_text, taken_at, booking_id, tags, status, sort_order, uploaded_by) on public.galleries to authenticated;
grant update (category, media_type, storage_path, thumbnail_path, video_url, width, height, blurhash, caption, alt_text,
  taken_at, booking_id, tags, status, sort_order) on public.galleries to authenticated;
grant delete on public.galleries to authenticated;

create policy galleries_public_read on public.galleries for select to anon using (status = 'published');
create policy galleries_staff_read on public.galleries for select to authenticated using ((select public.owns_rw(rw_id)));
create policy galleries_staff_insert on public.galleries for insert to authenticated
  with check ((select public.owns_rw(rw_id)) and uploaded_by = (select auth.uid()));
create policy galleries_staff_update on public.galleries for update to authenticated
  using ((select public.owns_rw(rw_id))) with check ((select public.owns_rw(rw_id)));
create policy galleries_staff_delete on public.galleries for delete to authenticated using ((select public.owns_rw(rw_id)));

-- A gallery item links a booking that visited its own RW (see visit_sessions_template_rw_guard).
create function internal.galleries_booking_rw_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.booking_id is not null and not internal.is_superadmin_or_system()
     and not exists (select 1 from public.bookings b where b.id = new.booking_id and new.rw_id = any (b.rw_ids)) then
    raise exception 'a gallery item links a booking that visited its own RW' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger galleries_booking_rw_guard before insert or update of booking_id, rw_id on public.galleries
  for each row execute function internal.galleries_booking_rw_guard();
revoke execute on function internal.galleries_booking_rw_guard() from public, anon, authenticated, service_role;

grant select (id, rw_id, slug, title, excerpt, body_json, cover_path, category, tags, status, published_at, seo_title,
  seo_description, reading_minutes, created_at, updated_at) on public.articles to anon;
grant select (id, rw_id, slug, title, excerpt, body_json, cover_path, category, tags, status, author_id, reviewed_by,
  published_at, seo_title, seo_description, reading_minutes, created_at, updated_at) on public.articles to authenticated;
grant insert (rw_id, slug, title, excerpt, body_json, cover_path, category, tags, status, author_id, seo_title,
  seo_description, reading_minutes) on public.articles to authenticated;
grant update (slug, title, excerpt, body_json, cover_path, category, tags, status, seo_title, seo_description,
  reading_minutes) on public.articles to authenticated;
grant delete on public.articles to authenticated;

create policy articles_public_read on public.articles for select to anon using (status = 'published');
create policy articles_staff_read on public.articles for select to authenticated using ((select public.owns_rw(rw_id)));
create policy articles_staff_insert on public.articles for insert to authenticated
  with check ((select public.owns_rw(rw_id)) and author_id = (select auth.uid()));
create policy articles_staff_update on public.articles for update to authenticated
  using ((select public.owns_rw(rw_id))) with check ((select public.owns_rw(rw_id)));
create policy articles_super_delete on public.articles for delete to authenticated using ((select public.is_superadmin()));

-- booklets: download_count moves only through svc_increment_booklet_download.
grant select (id, rw_id, kind, slug, title, description, pdf_path, cover_path, page_images_prefix, page_count,
  file_size_bytes, download_count, status, published_at, created_at, updated_at) on public.booklets to anon;
grant select (id, rw_id, kind, slug, title, description, pdf_path, cover_path, page_images_prefix, page_count,
  file_size_bytes, download_count, status, published_at, created_by, created_at, updated_at) on public.booklets to authenticated;
grant insert (rw_id, kind, slug, title, description, pdf_path, cover_path, page_images_prefix, page_count,
  file_size_bytes, status, published_at, created_by) on public.booklets to authenticated;
grant update (kind, slug, title, description, pdf_path, cover_path, page_images_prefix, page_count, file_size_bytes,
  status, published_at) on public.booklets to authenticated;
grant delete on public.booklets to authenticated;

create policy booklets_public_read on public.booklets for select to anon using (status = 'published');
create policy booklets_staff_read on public.booklets for select to authenticated using ((select public.owns_rw(rw_id)));
create policy booklets_staff_insert on public.booklets for insert to authenticated
  with check ((select public.owns_rw(rw_id)) and created_by = (select auth.uid()));
create policy booklets_staff_update on public.booklets for update to authenticated
  using ((select public.owns_rw(rw_id))) with check ((select public.owns_rw(rw_id)));
create policy booklets_super_delete on public.booklets for delete to authenticated using ((select public.is_superadmin()));

-- hero_banners: the home page carousel, the superadmin's alone; the public sees an active banner in its window.
grant select (id, title, subtitle, cta_label, cta_href, image_path, mobile_image_path, product_id, sort_order, is_active,
  starts_at, ends_at, created_at, updated_at) on public.hero_banners to anon;
grant select (id, title, subtitle, cta_label, cta_href, image_path, mobile_image_path, product_id, sort_order, is_active,
  starts_at, ends_at, created_by, created_at, updated_at) on public.hero_banners to authenticated;
grant insert (title, subtitle, cta_label, cta_href, image_path, mobile_image_path, product_id, sort_order, is_active,
  starts_at, ends_at, created_by) on public.hero_banners to authenticated;
grant update (title, subtitle, cta_label, cta_href, image_path, mobile_image_path, product_id, sort_order, is_active,
  starts_at, ends_at) on public.hero_banners to authenticated;
grant delete on public.hero_banners to authenticated;

create policy hero_banners_public_read on public.hero_banners for select to anon
  using (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
create policy hero_banners_super_read on public.hero_banners for select to authenticated
  using ((select public.is_superadmin()));
create policy hero_banners_super_insert on public.hero_banners for insert to authenticated
  with check ((select public.is_superadmin()) and created_by = (select auth.uid()));
create policy hero_banners_super_update on public.hero_banners for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy hero_banners_super_delete on public.hero_banners for delete to authenticated
  using ((select public.is_superadmin()));

grant select (id, rw_id, slug, name, point_type, short_description, body_md, image_path, map_x, map_y, svg_hotspot_id,
  lat, lng, sort_order, status, created_at, updated_at) on public.activity_points to anon, authenticated;
grant insert (rw_id, slug, name, point_type, short_description, body_md, image_path, map_x, map_y, svg_hotspot_id, lat,
  lng, sort_order, status) on public.activity_points to authenticated;
grant update (slug, name, point_type, short_description, body_md, image_path, map_x, map_y, svg_hotspot_id, lat, lng,
  sort_order, status) on public.activity_points to authenticated;
grant delete on public.activity_points to authenticated;

create policy activity_points_public_read on public.activity_points for select to anon using (status = 'published');
create policy activity_points_staff on public.activity_points for all to authenticated
  using ((select public.owns_rw(rw_id))) with check ((select public.owns_rw(rw_id)));

grant select (id, rw_id, title, schedule_type, description_md, starts_at, ends_at, venue, recurrence_rule, image_path,
  package_id, status, created_at, updated_at) on public.performance_schedules to anon;
grant select (id, rw_id, title, schedule_type, description_md, starts_at, ends_at, venue, recurrence_rule, image_path,
  package_id, status, created_by, created_at, updated_at) on public.performance_schedules to authenticated;
grant insert (rw_id, title, schedule_type, description_md, starts_at, ends_at, venue, recurrence_rule, image_path,
  package_id, status, created_by) on public.performance_schedules to authenticated;
grant update (title, schedule_type, description_md, starts_at, ends_at, venue, recurrence_rule, image_path, package_id,
  status) on public.performance_schedules to authenticated;
grant delete on public.performance_schedules to authenticated;

create policy performance_schedules_public_read on public.performance_schedules for select to anon
  using (status = 'published');
create policy performance_schedules_staff_read on public.performance_schedules for select to authenticated
  using ((select public.owns_rw(rw_id)));
create policy performance_schedules_staff_insert on public.performance_schedules for insert to authenticated
  with check ((select public.owns_rw(rw_id)) and created_by = (select auth.uid()));
create policy performance_schedules_staff_update on public.performance_schedules for update to authenticated
  using ((select public.owns_rw(rw_id))) with check ((select public.owns_rw(rw_id)));
create policy performance_schedules_staff_delete on public.performance_schedules for delete to authenticated
  using ((select public.owns_rw(rw_id)));

-- A schedule links a package of its own RW (see visit_sessions_template_rw_guard); a combo, which belongs to
-- no RW, is linked by the superadmin.
create function internal.performance_schedules_package_rw_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.package_id is not null and not internal.is_superadmin_or_system()
     and not exists (select 1 from public.tour_packages p where p.id = new.package_id and p.rw_id = new.rw_id) then
    raise exception 'a schedule links a package of its own RW' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger performance_schedules_package_rw_guard before insert or update of package_id, rw_id
  on public.performance_schedules for each row execute function internal.performance_schedules_package_rw_guard();
revoke execute on function internal.performance_schedules_package_rw_guard() from public, anon, authenticated, service_role;

-- reviews: the public reads a published review through v_public_reviews, which shows the author's first name
-- or 'Pengunjung', never reviewer_name or the booking. Staff read their RW's reviews under the same name, so
-- the full name a visitor typed reaches no screen; the superadmin moderates (reviews_moderation_stamp records
-- who and when) and deletes.
grant select (id, rating, title, body, public_reviewer_name, institution_name, rw_ids, is_featured, status, created_at)
  on public.reviews to anon;
grant select (id, booking_id, rw_ids, rating, title, body, institution_name, is_anonymous, status, is_featured,
  moderated_by, moderated_at, moderation_note, created_at, updated_at, public_reviewer_name)
  on public.reviews to authenticated;
grant update (status, is_featured, moderation_note) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;
grant select on public.v_public_reviews to anon, authenticated;

create policy reviews_public_read on public.reviews for select to anon using (status = 'published');
create policy reviews_staff_read on public.reviews for select to authenticated using ((select public.owns_any_rw(rw_ids)));
create policy reviews_super_moderate on public.reviews for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy reviews_super_delete on public.reviews for delete to authenticated using ((select public.is_superadmin()));


-- ===== Finance: revenue_share_rules, revenue_share_rule_lines, revenue_share_entries, payout_batches =====
-- The ledger is the superadmin's. An RW admin reads only their own keys: their RW's treasury ('rw:<id>') and
-- their RW's vendors, never the kelurahan's share, whatever rw_id an entry carries (STAFF-02), and in every
-- period, so RW recaps count the whole history.

-- revenue_share_rules: the rules that apply to an RW admin's RW, packages and products; the superadmin writes
-- them and their lines with a fresh TOTP code (end of file; revenue_rules_immutable_once_used, 0004, closes a
-- used rule instead of changing it).
grant select (id, scope, rw_id, package_id, product_id, name, effective_from, effective_to, is_active, created_by,
  created_at, updated_at) on public.revenue_share_rules to authenticated;
grant insert (scope, rw_id, package_id, product_id, name, effective_from, effective_to, is_active, created_by)
  on public.revenue_share_rules to authenticated;
grant update (scope, rw_id, package_id, product_id, name, effective_from, effective_to, is_active)
  on public.revenue_share_rules to authenticated;
grant delete on public.revenue_share_rules to authenticated;

create policy revenue_share_rules_staff_read on public.revenue_share_rules for select to authenticated using (
  (select public.owns_rw(rw_id))
  or exists (select 1 from public.tour_packages p
             where p.id = revenue_share_rules.package_id and p.rw_id = (select public.app_rw_id()))
  or exists (select 1 from public.products_umkm pr
             where pr.id = revenue_share_rules.product_id and pr.rw_id = (select public.app_rw_id()))
);
create policy revenue_share_rules_super_insert on public.revenue_share_rules for insert to authenticated
  with check ((select public.is_superadmin()) and created_by = (select auth.uid()));
create policy revenue_share_rules_super_update on public.revenue_share_rules for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy revenue_share_rules_super_delete on public.revenue_share_rules for delete to authenticated
  using ((select public.is_superadmin()));

grant select (id, rule_id, beneficiary, rw_id, vendor_id, pct) on public.revenue_share_rule_lines to authenticated;
grant insert (rule_id, beneficiary, rw_id, vendor_id, pct) on public.revenue_share_rule_lines to authenticated;
grant update (beneficiary, rw_id, vendor_id, pct) on public.revenue_share_rule_lines to authenticated;
grant delete on public.revenue_share_rule_lines to authenticated;

create policy revenue_share_rule_lines_staff_read on public.revenue_share_rule_lines for select to authenticated using (
  exists (select 1 from public.revenue_share_rules r where r.id = revenue_share_rule_lines.rule_id)
);
create policy revenue_share_rule_lines_super_write on public.revenue_share_rule_lines for all to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));

-- revenue_share_entries: written by allocate_revenue_share and settled by settle_revenue_entries only.
grant select (id, booking_id, payment_id, adjustment_id, entry_type, line_ref, booking_addon_id, rule_id, rule_version,
  beneficiary, beneficiary_key, rw_id, vendor_id, base_amount, pct, amount, payout_batch_id, prev_hash, entry_hash,
  created_at) on public.revenue_share_entries to authenticated;
-- v_finance_daily sums payments.gross_amount, which no API role reads, so it is granted to nobody and serves the
-- finance RPC of P4.7.01 instead.
grant select on public.v_revenue_recap_daily, public.v_revenue_recap_by_party, public.v_revenue_recap_by_booking
  to authenticated;

create policy revenue_share_entries_staff_read on public.revenue_share_entries for select to authenticated using (
  (select public.is_superadmin())
  or ((select public.is_admin_rw())
      and (beneficiary_key = 'rw:' || (select public.app_rw_id())
           or (beneficiary = 'umkm_vendor'
               and exists (select 1 from public.umkm_vendors v
                           where v.id = revenue_share_entries.vendor_id and v.rw_id = (select public.app_rw_id())))))
);

-- payout_batches: the superadmin records a payout in their own name; an RW admin sees the payouts to their keys.
grant select (id, beneficiary_key, period_from, period_to, total_amount, paid_at, reference, proof_path, notes,
  created_by, created_at) on public.payout_batches to authenticated;
grant insert (beneficiary_key, period_from, period_to, total_amount, paid_at, reference, proof_path, notes, created_by)
  on public.payout_batches to authenticated;
grant update (paid_at, reference, proof_path, notes) on public.payout_batches to authenticated;

create policy payout_batches_staff_read on public.payout_batches for select to authenticated using (
  (select public.is_superadmin())
  or ((select public.is_admin_rw())
      and (beneficiary_key = 'rw:' || (select public.app_rw_id())
           or exists (select 1 from public.umkm_vendors v
                      where 'vendor:' || v.id = payout_batches.beneficiary_key and v.rw_id = (select public.app_rw_id()))))
);
create policy payout_batches_super_insert on public.payout_batches for insert to authenticated
  with check ((select public.is_superadmin()) and created_by = (select auth.uid()));
create policy payout_batches_super_update on public.payout_batches for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));


-- ===== Operations: notifications, security_events, security_alerts, exports, dsr_requests, audit_logs,
--       login_attempts, rate_limit_buckets =====

-- notifications: staff see whether a message about a booking they see went out, never to whom or with what:
-- recipient, recipient_name, params and last_error are granted to nobody (decision of 2026-10-16). Messages
-- without a booking (staff alerts) are the superadmin's.
grant select (id, booking_id, channel, template, document_path, dedupe_key, status, attempts, max_attempts,
  next_attempt_at, locked_at, last_error_code, dead_at, provider_message_id, provider_status, sent_at, delivered_at,
  read_at, created_at, updated_at) on public.notifications to authenticated;
create policy notifications_staff_read on public.notifications for select to authenticated using (
  (select public.is_superadmin())
  or exists (select 1 from public.bookings b where b.id = notifications.booking_id)
);

grant select (id, event_type, severity, actor_id, actor_role, ip_hash, user_agent, rw_id, entity_type, entity_id,
  fingerprint, details, occurred_at) on public.security_events to authenticated;
create policy security_events_super_read on public.security_events for select to authenticated
  using ((select public.is_superadmin()));

-- security_alerts: acknowledged by the superadmin, in their own name and with a fresh authenticator code (end
-- of file), since an acknowledged alert stops calling for attention. The moment is the database's: the client
-- writes acknowledged_by only, and security_alerts_acknowledge_stamp sets acknowledged_at to now(), so nobody
-- can date an acknowledgement back.
grant select (id, rule, severity, fingerprint, title, details, first_seen_at, last_seen_at, occurrences, notified_at,
  acknowledged_by, acknowledged_at, created_at) on public.security_alerts to authenticated;
grant update (acknowledged_by) on public.security_alerts to authenticated;
create policy security_alerts_super_read on public.security_alerts for select to authenticated
  using ((select public.is_superadmin()));
create policy security_alerts_super_acknowledge on public.security_alerts for update to authenticated
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()) and acknowledged_by = (select auth.uid()));

create function internal.security_alerts_acknowledge_stamp() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.acknowledged_by is distinct from old.acknowledged_by then
    new.acknowledged_at := case when new.acknowledged_by is null then null else now() end;
  end if;
  return new;
end;
$$;
create trigger security_alerts_acknowledge_stamp before update of acknowledged_by on public.security_alerts
  for each row execute function internal.security_alerts_acknowledge_stamp();
revoke execute on function internal.security_alerts_acknowledge_stamp() from public, anon, authenticated, service_role;

-- exports: requested through rpc_create_export (P4.6); a staff member sees their own, the superadmin all.
grant select (id, kind, format, requested_by, rw_id, filters, reason, row_count, storage_path, watermark, expires_at,
  downloaded_at, deleted_at, created_at) on public.exports to authenticated;
create policy exports_staff_read on public.exports for select to authenticated using (
  (select public.is_superadmin()) or ((select public.is_staff()) and requested_by = (select auth.uid()))
);

-- dsr_requests: a data subject's request names their phone or email, which the superadmin needs to answer it;
-- the superadmin handles it in their own name.
grant select (id, request_type, phone, email, booking_code, message, otp_id, verified_at, status, due_at, handled_by,
  handled_at, resolution_note, created_at) on public.dsr_requests to authenticated;
grant update (status, handled_by, handled_at, resolution_note) on public.dsr_requests to authenticated;
create policy dsr_requests_super_read on public.dsr_requests for select to authenticated
  using ((select public.is_superadmin()));
create policy dsr_requests_super_handle on public.dsr_requests for update to authenticated
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()) and handled_by = (select auth.uid()));

grant select (id, occurred_at, actor_id, actor_role, actor_ip, request_id, action, entity_type, entity_id, rw_id,
  before, after, metadata, prev_hash, entry_hash) on public.audit_logs to authenticated;
create policy audit_logs_super_read on public.audit_logs for select to authenticated using ((select public.is_superadmin()));

-- login_attempts: the superadmin reads them to unlock an account (FR-ADMIN-18); they hold an email hash only.
grant select (id, user_id, email_hash, ip, success, reason, attempted_at) on public.login_attempts to authenticated;
create policy login_attempts_super_read on public.login_attempts for select to authenticated
  using ((select public.is_superadmin()));

-- rate_limit_buckets: nothing at all; only rate_limit_hit touches it.


-- ===== AAL2 for every staff command (docs/PRD.md §8.5.2, docs/Security.md §6.3, Task P1.4.05) =====
-- Every staff account signs in with TOTP and the dashboard turns AAL1 sessions away (FR-ADMIN-01), so the
-- database asks for the second factor too, on every table authenticated holds a right on: a restrictive policy
-- no permissive policy can widen. An AAL1 session reads no row and writes none, so a stolen password alone
-- reaches nothing. booking_participants has no grant but takes the policy as well, ready for the day it gets
-- one. A table granted in a later migration adds its own <table>_aal2 policy there; rls_hygiene.sql fails
-- otherwise.
do $$
declare
  staff_table text;
begin
  for staff_table in
    select c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and (has_any_column_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE')
           or has_table_privilege('authenticated', c.oid, 'DELETE')
           or c.relname = 'booking_participants')
    order by c.relname
  loop
    execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select public.aal2()))',
                   staff_table || '_aal2', staff_table);
  end loop;
end;
$$;


-- ===== A fresh authenticator code for the superadmin's own writes (docs/Security.md §5.3, AUTH-11) =====
-- An AAL2 session may have sat open on a desk for hours. Inviting staff, changing a setting, a revenue-share
-- rule or its lines, and acknowledging a security alert therefore need a TOTP code verified in the last five
-- minutes, as the staff RPCs of 0004 do: one restrictive policy per command, so reading stays open to the AAL2
-- session. A stale session inserts nothing (42501) and updates or deletes no row.
do $$
declare
  step_up_table text;
  command text;
begin
  foreach step_up_table in array array['staff_invites', 'site_settings', 'revenue_share_rules',
                                       'revenue_share_rule_lines'] loop
    foreach command in array array['insert', 'update', 'delete'] loop
      execute format('create policy %I on public.%I as restrictive for %s to authenticated %s ((select public.fresh_totp()))',
                     step_up_table || '_fresh_totp_' || command, step_up_table, command,
                     case command when 'insert' then 'with check' else 'using' end);
    end loop;
  end loop;
end;
$$;
create policy security_alerts_fresh_totp_update on public.security_alerts as restrictive for update to authenticated
  using ((select public.fresh_totp()));
