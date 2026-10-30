-- Decision of 2026-10-30 (product owner; docs/PRD.md §13.1 A29 decision 8, FR-PUB-13, FR-PUB-13a, FR-ADMIN-09): one
-- UMKM product, such as a patchwork vest, comes in several variants (a motif or a colour), each with its own name and
-- photo. The visitor picks one on /produk/[slug] and the WhatsApp order to the Koperasi Merah Putih names it; nothing
-- else follows from a variant (no price, stock or seller of its own: the product keeps those).
--
--   label         what the variant is called, trimmed, 1-60 characters, once per product whatever its case
--   image_path    one of its product's own photos (products_umkm.image_paths), or none; the photo goes up through the
--                 product's upload pipeline (api/uploads/sign + finalize), so it lies in the product's folder and
--                 keepRowPhotos never removes it while the product shows it
--   sort_order    the order the product page lists the variants in
--   is_available  an unavailable variant is shown, marked and not selectable
--
-- Access mirrors the parent product: anon reads the variants of a published product (products_umkm_public_read), staff
-- read those of their own RW's products (products_umkm_staff_read), and only the superadmin writes them, as only the
-- superadmin writes products since 20261028080100 (decision of 2026-10-24, review of PR #45, finding 4). Every command
-- of authenticated asks for AAL2. The form saves a product's variants in one transaction through save_product_variants,
-- security invoker, so these grants and policies decide exactly as for a direct write.

create table public.product_variants (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products_umkm(id) on delete cascade,
  label        text not null check (label = btrim(label) and char_length(label) between 1 and 60),
  image_path   text,
  sort_order   smallint not null default 0 check (sort_order >= 0),
  is_available boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index product_variants_label_key on public.product_variants (product_id, lower(label));
create index product_variants_order_idx on public.product_variants (product_id, sort_order);

alter table public.product_variants enable row level security;
alter table public.product_variants force row level security;
revoke all on public.product_variants from anon, authenticated;
create trigger set_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

grant select (id, product_id, label, image_path, sort_order, is_available) on public.product_variants to anon;
grant select (id, product_id, label, image_path, sort_order, is_available, created_at, updated_at)
  on public.product_variants to authenticated;
grant insert (product_id, label, image_path, sort_order, is_available) on public.product_variants to authenticated;
grant update (label, image_path, sort_order, is_available) on public.product_variants to authenticated;
grant delete on public.product_variants to authenticated;

create policy product_variants_public_read on public.product_variants for select to anon using (
  exists (select 1 from public.products_umkm p where p.id = product_variants.product_id and p.status = 'published')
);
create policy product_variants_staff_read on public.product_variants for select to authenticated using (
  exists (select 1 from public.products_umkm p
          where p.id = product_variants.product_id and (select public.owns_rw(p.rw_id)))
);
create policy product_variants_super_insert on public.product_variants for insert to authenticated
  with check ((select public.is_superadmin()));
create policy product_variants_super_update on public.product_variants for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy product_variants_super_delete on public.product_variants for delete to authenticated
  using ((select public.is_superadmin()));
create policy product_variants_aal2 on public.product_variants as restrictive for all to authenticated
  using ((select public.aal2()));


-- ===== The row: its product's photo, its product for good, at most 20 a product =====

create function internal.product_variants_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  -- A product page lists every variant as a choice; more than this is a catalogue of its own.
  max_variants constant integer := 20;
  product public.products_umkm;
begin
  if tg_op = 'UPDATE' and new.product_id is distinct from old.product_id then
    raise exception 'a variant stays with its product' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  -- The product's row lock lets one writer count its variants at a time, so two saves cannot pass the cap together.
  select p.* into product from public.products_umkm p where p.id = new.product_id for update;
  if not found then
    raise exception 'product % does not exist', new.product_id using errcode = '23503';
  end if;
  if new.image_path is not null and not (new.image_path = any (product.image_paths)) then
    raise exception 'a variant shows one of its product''s own photos' using errcode = '23514';
  end if;
  if tg_op = 'INSERT'
     and (select count(*) from public.product_variants v where v.product_id = new.product_id) >= max_variants then
    raise exception 'a product has at most % variants', max_variants using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return new;
end;
$$;
revoke execute on function internal.product_variants_guard() from public, anon, authenticated;
create trigger product_variants_guard before insert or update on public.product_variants
  for each row execute function internal.product_variants_guard();

-- A photo taken off the product is taken off its variants too, in the same statement, so the product form never has
-- to save its variants before its photos (and keepRowPhotos removes only what nothing shows).
create function internal.products_umkm_variant_photos() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  update public.product_variants v set image_path = null
  where v.product_id = new.id and v.image_path is not null and not (v.image_path = any (new.image_paths));
  return null;
end;
$$;
revoke execute on function internal.products_umkm_variant_photos() from public, anon, authenticated;
create trigger products_umkm_variant_photos after update of image_paths on public.products_umkm
  for each row execute function internal.products_umkm_variant_photos();


-- ===== Audit: a variant is catalogue content like its product =====

create trigger log_audit after insert or update or delete on public.product_variants
  for each row execute function internal.log_audit();

-- Replaces the 20261025080300 version: product_variants joins the audited tables. Everything else is unchanged.
create or replace function internal.audit_columns(p_table text) returns text[]
  language sql immutable
  set search_path = ''
as $$
  select case p_table
    when 'bookings' then array['id', 'booking_code', 'status', 'channel', 'package_id', 'rw_ids', 'booker_type',
      'institution_name', 'pax_count', 'visit_date', 'visit_date_end', 'subtotal_package', 'subtotal_addons',
      'discount_amount', 'total_amount', 'amount_paid', 'currency', 'expires_at', 'quoted_at', 'paid_at',
      'checked_in_at', 'completed_at', 'cancelled_at', 'cancelled_by', 'expired_at', 'refunded_at', 'needs_review',
      'phone_verified_at', 'email_verified_at', 'consent_version', 'consented_at', 'guardian_consented_at',
      'token_version', 'created_by', 'created_at', 'pii_purged_at']
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
      'release_waived_by', 'issued_at', 'issued_by', 'revoked_at', 'revoke_reason', 'revoked_by_undo', 'purged_at']
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
    when 'product_variants' then array['id', 'product_id', 'label', 'image_path', 'sort_order', 'is_available',
      'created_at']
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
    when 'rw_units' then array['id', 'code', 'slug', 'name', 'short_name', 'theme_label', 'tagline', 'hero_image_path',
      'treasury_bank_name', 'map_lat', 'map_lng', 'accent_key', 'icon_key', 'schedule_enabled', 'products_heading',
      'is_active', 'sort_order', 'created_at']
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


-- ===== save_product_variants: the product form's variants in one transaction =====

-- The variants as the form sends them, in order: each {label, image_path, is_available}, sort_order its position.
-- They replace the product's variants (deleted, then inserted in order), as save_package_legs replaces a combo's legs,
-- so renaming two variants into each other's names never trips the unique label; a list equal to the stored one
-- writes nothing, so a save that changed no variant leaves no audit row. Security invoker: the grants, policies and
-- triggers above decide, so an RW admin, AAL1 or a product of another RW is refused as a direct write would be.
create function public.save_product_variants(p_product_id uuid, p_variants jsonb) returns void
  language plpgsql security invoker
  set search_path = ''
as $$
declare
  wanted jsonb := coalesce(p_variants, '[]');
  current_list jsonb;
begin
  if jsonb_typeof(wanted) <> 'array' or exists (
       select 1 from jsonb_array_elements(wanted) as v
       where jsonb_typeof(v) <> 'object'
          or (select array_agg(k order by k) from jsonb_object_keys(v) as k)
             is distinct from array['image_path', 'is_available', 'label']
          or jsonb_typeof(v -> 'label') <> 'string'
          or jsonb_typeof(v -> 'is_available') <> 'boolean'
          or jsonb_typeof(v -> 'image_path') not in ('string', 'null')) then
    raise exception 'a variant is a label, an image_path and is_available' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('label', v.label, 'image_path', v.image_path,
                                               'is_available', v.is_available) order by v.sort_order, v.label), '[]')
    into current_list
  from public.product_variants v where v.product_id = p_product_id;
  if current_list = wanted then
    return;
  end if;

  delete from public.product_variants v where v.product_id = p_product_id;
  insert into public.product_variants (product_id, label, image_path, sort_order, is_available)
  select p_product_id, v ->> 'label', v ->> 'image_path', (seq - 1)::smallint, (v ->> 'is_available')::boolean
  from jsonb_array_elements(wanted) with ordinality as listed(v, seq);
end;
$$;
revoke execute on function public.save_product_variants(uuid, jsonb) from public, anon, service_role;
grant execute on function public.save_product_variants(uuid, jsonb) to authenticated;
