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
