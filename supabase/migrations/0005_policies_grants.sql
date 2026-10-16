-- 0005_policies_grants: who may read and write what through the API (docs/PRD.md §8.5, docs/Security.md §6,
-- Task P1.4). Every table has had RLS enabled and forced, and no grant, since 0003; this file grants the API
-- roles the least each one needs and writes the policies that pick their rows.
--
-- Superadmin and admin_rw share the authenticated role, so a column grant always applies to both. Columns no
-- staff member may read through the API (booker contacts, bank and treasury accounts, pay links, participant
-- names, outbox recipients) are therefore granted to nobody; they reach a screen only through the audited
-- RPCs (decisions of 2026-10-16). Columns are always listed, so a column added later stays private until a
-- migration grants it. Policies call the 0004 helpers wrapped in (select ...), so the JWT is read once per
-- statement, and never read auth.jwt() themselves, so is_active and claims_version apply everywhere.
--
-- The 0001 note that service_role access would be granted here is superseded: service_role keeps its
-- Supabase table rights and reaches internal.* only through the svc_* wrappers of 0004.


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

-- Functions: the RLS helpers and the staff RPCs that exist so far. A later staff RPC is granted in the
-- migration that creates it; the svc_* wrappers stay service_role only, as 0004 granted them.
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.today_jkt() to anon, authenticated;
grant execute on function public.app_role(), public.app_rw_id(), public.is_superadmin(), public.is_admin_rw(),
  public.is_staff(), public.owns_rw(smallint), public.owns_any_rw(smallint[]), public.aal2() to authenticated;
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
-- staff RPCs (profiles_guard, 0004). Every command needs AAL2.
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
create policy profiles_aal2 on public.profiles as restrictive for all to authenticated
  using ((select public.aal2()));

-- staff_invites: the superadmin's alone (FR-ADMIN-01). An invite names its creator and is later only revoked;
-- accepting one happens in the onboarding service.
grant select (id, email, role, rw_id, invite_code_hash, expires_at, accepted_at, accepted_user_id, revoked_at,
  created_by, created_at) on public.staff_invites to authenticated;
grant insert (email, role, rw_id, invite_code_hash, expires_at, created_by) on public.staff_invites to authenticated;
grant update (revoked_at) on public.staff_invites to authenticated;

create policy staff_invites_super_read on public.staff_invites for select to authenticated
  using ((select public.is_superadmin()));
create policy staff_invites_super_insert on public.staff_invites for insert to authenticated
  with check ((select public.is_superadmin()) and created_by = (select auth.uid()));
create policy staff_invites_super_revoke on public.staff_invites for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy staff_invites_aal2 on public.staff_invites as restrictive for all to authenticated
  using ((select public.aal2()));

-- site_settings: public keys for everyone, the rest for the superadmin, who alone writes them. Whoever writes
-- a setting signs it with their own id.
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
create policy site_settings_aal2 on public.site_settings as restrictive for all to authenticated
  using ((select public.aal2()));


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


-- ===== Catalogue: tour_packages, tour_package_legs, tour_package_price_tiers, package_price_history,
--       umkm_vendors, products_umkm =====
-- Published rows are public. An RW admin manages their own RW's catalogue and reads, never edits, a combo
-- that visits their RW (REC-14); only the superadmin deletes a package, a vendor or a product, which the RW
-- admin archives through its status instead (decision of 2026-10-16). Whoever creates a row signs it with their
-- own id, and whoever edits a package signs the edit.

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
  with check ((select public.owns_rw(rw_id)) and created_by = (select auth.uid()));
create policy tour_packages_staff_update on public.tour_packages for update to authenticated
  using ((select public.owns_rw(rw_id)))
  with check ((select public.owns_rw(rw_id)) and updated_by = (select auth.uid()));
create policy tour_packages_super_delete on public.tour_packages for delete to authenticated
  using ((select public.is_superadmin()));

-- tour_package_legs: a leg belongs to the RW it visits, so an RW admin never sees the other RW's leg of a
-- combo. The package's read policy asks the legs, and Postgres refuses policies that ask each other, so the
-- rules that need the package itself (a combo's legs are the superadmin's; an RW package visits its own RW
-- only) sit in the trigger tour_package_legs_guard below.
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
  if package.category = 'combo' and not internal.is_superadmin_or_system() then
    raise exception 'only the superadmin changes the legs of a combo package' using errcode = '42501';
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
