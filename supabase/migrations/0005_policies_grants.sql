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


-- ===== Bookings: bookings, booking_legs, booking_addons, booking_participants, booking_events, guest_otps =====
-- No API role reads a booker's contact or a participant's name (DATA-04, AZ-12): those columns are granted to
-- nobody and leave the database only through rpc_reveal_booking_contact and rpc_get_participants, which audit
-- every read. An RW admin sees a booking that visits their RW from a week before its visit until a month
-- ahead; the superadmin sees every booking (decision of 2026-10-16). Today's visits, and so today's check-in
-- and certificates, always fall inside that window. The legs and add-ons, which carry no personal data, are
-- scoped by RW alone, so visit statistics and RW recaps can count every period.

grant select (id, booking_code, status, channel, package_id, package_snapshot, rw_ids, booker_type, institution_name,
  pax_count, visit_date, visit_date_end, notes, subtotal_package, subtotal_addons, discount_amount, discount_note,
  total_amount, amount_paid, currency, expires_at, quoted_at, paid_at, checked_in_at, completed_at, cancelled_at,
  cancelled_by, cancel_reason, expired_at, refunded_at, needs_review, review_reason, phone_verified_at,
  email_verified_at, consent_version, consented_at, token_version, ticket_pdf_path, admin_notes, created_by,
  created_at, updated_at, pii_purged_at, phone_masked, email_masked, pic_first_name) on public.bookings to authenticated;
-- A discount also recomputes the total, so it waits for its own RPC (P4); staff write notes only.
grant update (admin_notes) on public.bookings to authenticated;
grant select on public.v_bookings_staff, public.v_booking_admin, public.v_booking_export to authenticated;

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

-- booking_addons: the kitchen of each RW marks its own lines prepared or handed over.
grant select (id, booking_id, product_id, rw_id, vendor_id, product_name_snapshot, unit_price, qty, line_total, notes,
  fulfillment_status, created_at, updated_at) on public.booking_addons to authenticated;
grant update (fulfillment_status) on public.booking_addons to authenticated;
create policy booking_addons_staff_read on public.booking_addons for select to authenticated
  using ((select public.owns_rw(rw_id)));
create policy booking_addons_staff_fulfil on public.booking_addons for update to authenticated
  using ((select public.owns_rw(rw_id))) with check ((select public.owns_rw(rw_id)));

-- booking_participants: no grant at all; names only through rpc_get_participants, corrections with their UI
-- (decision of 2026-10-16). The AAL2 policy stands ready for the day a grant is added.
create policy booking_participants_aal2 on public.booking_participants as restrictive for all to authenticated
  using ((select public.aal2()));

-- booking_events: a booking's timeline, visible wherever the booking itself is.
grant select (id, booking_id, from_status, to_status, actor_type, actor_id, reason, payload, occurred_at)
  on public.booking_events to authenticated;
create policy booking_events_staff_read on public.booking_events for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = booking_events.booking_id)
);

-- guest_otps: nothing at all; only issue_phone_otp and verify_phone_otp touch it.


-- ===== Payments and documents: payments, payment_events, webhook_rejections, payment_adjustments,
--       reconciliation_runs, reconciliation_issues, quotations, invoices, document_sequences =====
-- Every write here belongs to the transition functions and the jobs. Staff read a payment where they read its
-- booking, with the amounts of their own RW (STAFF-02), but never the hosted pay link, the snap token, the VA
-- number or the stored Midtrans reply, which carries the VA number too (decision of 2026-10-16). Everything
-- about money needs AAL2; events, rejections, adjustments and reconciliation are the superadmin's alone.

grant select (id, booking_id, attempt_no, provider, method, status, order_id, provider_txn_id, gross_amount,
  payment_type_raw, va_bank, transaction_time, settlement_time, expiry_time, fraud_status, status_code,
  manual_proof_path, manual_reference, recorded_by, refunded_amount, created_at, updated_at)
  on public.payments to authenticated;
create policy payments_staff_read on public.payments for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = payments.booking_id)
);
create policy payments_aal2 on public.payments as restrictive for all to authenticated using ((select public.aal2()));

grant select (id, payment_id, order_id, source, event_hash, transaction_status, fraud_status, status_code,
  gross_amount_raw, payload, received_at, processed_at, processing_result) on public.payment_events to authenticated;
create policy payment_events_super_read on public.payment_events for select to authenticated
  using ((select public.is_superadmin()));
create policy payment_events_aal2 on public.payment_events as restrictive for all to authenticated
  using ((select public.aal2()));

grant select (id, provider, reason, order_id, status_code, body_sha256, ip, user_agent, received_at)
  on public.webhook_rejections to authenticated;
create policy webhook_rejections_super_read on public.webhook_rejections for select to authenticated
  using ((select public.is_superadmin()));
create policy webhook_rejections_aal2 on public.webhook_rejections as restrictive for all to authenticated
  using ((select public.aal2()));

-- payment_adjustments: proposed, approved and applied through their RPCs (P4.7.03).
grant select (id, booking_id, payment_id, type, status, amount, reason, evidence_path, proposed_by, proposed_at,
  approved_by, approved_at, rejected_reason, apply_not_before, applied_at) on public.payment_adjustments to authenticated;
create policy payment_adjustments_super_read on public.payment_adjustments for select to authenticated
  using ((select public.is_superadmin()));
create policy payment_adjustments_aal2 on public.payment_adjustments as restrictive for all to authenticated
  using ((select public.aal2()));

grant select (id, run_date, source, started_at, finished_at, payments_checked, issues_found, ledger_chain_ok,
  audit_chain_ok, summary, created_by) on public.reconciliation_runs to authenticated;
create policy reconciliation_runs_super_read on public.reconciliation_runs for select to authenticated
  using ((select public.is_superadmin()));
create policy reconciliation_runs_aal2 on public.reconciliation_runs as restrictive for all to authenticated
  using ((select public.aal2()));

-- reconciliation_issues: the superadmin resolves an issue in their own name.
grant select (id, run_id, booking_id, payment_id, issue_type, severity, details, resolved_at, resolved_by,
  resolution_note, created_at) on public.reconciliation_issues to authenticated;
grant update (resolved_at, resolved_by, resolution_note) on public.reconciliation_issues to authenticated;
create policy reconciliation_issues_super_read on public.reconciliation_issues for select to authenticated
  using ((select public.is_superadmin()));
create policy reconciliation_issues_super_resolve on public.reconciliation_issues for update to authenticated
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()) and resolved_by = (select auth.uid()));
create policy reconciliation_issues_aal2 on public.reconciliation_issues as restrictive for all to authenticated
  using ((select public.aal2()));

-- quotations and invoices: read where their booking is; their snapshots hold no contact (0004).
grant select (id, booking_id, quotation_number, verify_code, version, status, issued_at, valid_until, snapshot,
  pdf_path, issued_by) on public.quotations to authenticated;
create policy quotations_staff_read on public.quotations for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = quotations.booking_id)
);

grant select (id, booking_id, invoice_number, status, issued_at, due_date, amount_due, amount_paid, paid_at,
  payment_id, receipt_number, credit_note_number, snapshot, pdf_path, receipt_pdf_path, credit_note_pdf_path,
  void_reason, voided_at, created_at, updated_at) on public.invoices to authenticated;
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

grant select (id, attempt_id, ticket_id, rw_id, scanned_by, phase, result, source, attendee_count, override_reason,
  raw_payload, device_info, ip, scanned_at) on public.ticket_scans to authenticated;
create policy ticket_scans_staff_read on public.ticket_scans for select to authenticated
  using ((select public.owns_rw(rw_id)));

grant select (id, booking_id, participant_id, kind, certificate_number, verify_code, status, institution_name,
  visit_date, rw_ids, template_version, pdf_path, rendered_at, released_at, release_waived_by, issued_at, issued_by,
  revoked_at, revoke_reason, purged_at) on public.certificates to authenticated;
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

-- reviews: the public reads a published review through v_public_reviews, which shows the author's first name
-- or 'Pengunjung', never reviewer_name or the booking. Staff read their RW's reviews; the superadmin moderates
-- (reviews_moderation_stamp records who and when) and deletes.
grant select (id, rating, title, body, public_reviewer_name, institution_name, rw_ids, is_featured, status, created_at)
  on public.reviews to anon;
grant select (id, booking_id, rw_ids, rating, title, body, reviewer_name, institution_name, is_anonymous, status,
  is_featured, moderated_by, moderated_at, moderation_note, created_at, updated_at, public_reviewer_name)
  on public.reviews to authenticated;
grant update (status, is_featured, moderation_note) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;
grant select on public.v_public_reviews to anon, authenticated;

create policy reviews_public_read on public.reviews for select to anon using (status = 'published');
create policy reviews_staff_read on public.reviews for select to authenticated using ((select public.owns_any_rw(rw_ids)));
create policy reviews_super_moderate on public.reviews for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy reviews_super_delete on public.reviews for delete to authenticated using ((select public.is_superadmin()));
