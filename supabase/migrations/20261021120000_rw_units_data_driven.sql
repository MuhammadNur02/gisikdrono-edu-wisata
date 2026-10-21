-- RWs as data (decision of 2026-10-21, Task P2.10.01). The public site, its menu and its accent colours are to be
-- read from rw_units instead of from the fixed list in src/config/rw.ts, so the superadmin can add an RW without a
-- developer. This migration gives rw_units what those pages need and the rules that keep a new row safe; which RWs
-- exist and what they offer changes only in a later migration (RW 13 and RW 08's new programme, Task P2.10.03).

-- The colour of an RW is a key into the fixed palette of docs/StyleGuide.md §2.7, never a colour value: the CSS
-- tokens are built into the site, so a colour the build does not know could not be shown at all. leaf, terracotta
-- and mulberry are taken; teal and violet are spare palettes, already checked for contrast and colour blindness, so
-- a new RW gets a colour of its own without a release.
create type public.rw_accent as enum ('leaf', 'terracotta', 'mulberry', 'teal', 'violet');
-- The icon in a photo slot of the RW while its photo is missing (docs/StyleGuide.md §1.3 G1), from a fixed list for
-- the same reason: src/config maps each key to a lucide icon. landmark and users are spares.
create type public.rw_icon as enum ('recycle', 'drama', 'heart_handshake', 'landmark', 'users');

-- short_name is the programme name the pages colour inside the full name ('Ecowastreme' in 'RW 05 Ecowastreme').
-- schedule_enabled gives the RW the performance schedule: the /jadwal page and the dashboard's schedule module.
alter table public.rw_units
  add column short_name text,
  add column accent_key public.rw_accent,
  add column icon_key public.rw_icon,
  add column schedule_enabled boolean not null default false;

-- RW 05 and RW 08 get exactly what src/config/rw.ts gives them today, so nothing on the site changes yet.
update public.rw_units set short_name = regexp_replace(name, '^RW [0-9]{2} ', '');
update public.rw_units set accent_key = 'leaf', icon_key = 'recycle' where id = 5;
update public.rw_units set accent_key = 'terracotta', icon_key = 'drama', schedule_enabled = true where id = 8;

-- Every place that names an RW uses its number as two digits: code RW05, the ticket code suffix -05 and the media
-- folder rw-05 (internal.media_owner, whose lpad would cut 100 down to '10'). The page lives at /<slug>, next to
-- /produk and /galeri, so a slug starts with the RW's own rw-NN-: no RW can take another page's address, and the
-- address always says which RW it is. A new RW starts offline; set_rw_unit_status below takes it online.
alter table public.rw_units
  alter column short_name set not null,
  alter column accent_key set not null,
  alter column icon_key set not null,
  alter column is_active set default false,
  add constraint rw_units_id_two_digits check (id between 1 and 99),
  add constraint rw_units_code_matches_id check (code = 'RW' || lpad(id::text, 2, '0')),
  add constraint rw_units_slug_matches_id check (slug ~ ('^rw-' || lpad(id::text, 2, '0') || '(-[a-z0-9]+)+$')),
  add constraint rw_units_short_name_trimmed check (short_name ~ '^\S(.*\S)?$'),
  add constraint rw_units_name_matches_short_name check (name = 'RW ' || lpad(id::text, 2, '0') || ' ' || short_name);

-- Everyone who reads an RW reads its look. The superadmin chooses it when adding an RW, but never its status: that
-- goes through set_rw_unit_status. The RW's admin may rename the programme, as they may rename the RW (name and
-- short_name change together). Accent, icon and the schedule stay with the superadmin, through a migration until
-- the RW settings page exists (Task P4.9.03).
grant select (short_name, accent_key, icon_key, schedule_enabled) on public.rw_units to anon, authenticated;
grant insert (short_name, accent_key, icon_key, schedule_enabled) on public.rw_units to authenticated;
revoke insert (is_active) on public.rw_units from authenticated;
grant update (short_name) on public.rw_units to authenticated;

-- Adding an RW changes how the kelurahan is organised, so it needs a code from the last five minutes like the
-- other superadmin writes of docs/Security.md §5.3 (AUTH-11).
create policy rw_units_fresh_totp_insert on public.rw_units as restrictive for insert to authenticated
  with check ((select public.fresh_totp()));

-- The new columns hold nothing private, so the audit log keeps their values, not only their names. The body is
-- 0004's with four more rw_units columns; create or replace keeps the owner and the revoked grants.
create or replace function internal.audit_columns(p_table text) returns text[]
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
    when 'rw_units' then array['id', 'code', 'slug', 'name', 'short_name', 'theme_label', 'tagline', 'hero_image_path',
      'treasury_bank_name', 'map_lat', 'map_lng', 'accent_key', 'icon_key', 'schedule_enabled', 'is_active',
      'sort_order', 'created_at']
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

-- Taking an RW online or offline is the superadmin's, with a fresh code. An RW goes online only once it has its
-- default revenue-share rules for packages and add-ons, so no booking of it can ever settle without a rule that
-- pays its treasury (docs/PRD.md §11.2: there is no global fallback). Going offline hides the RW's page and stops
-- new sessions (0007 generates them for active RWs only); bookings already made are not touched.
create function public.set_rw_unit_status(p_rw_id smallint, p_is_active boolean) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  today date := public.today_jkt();
begin
  if not public.is_superadmin() then
    raise exception 'only the superadmin takes an RW online or offline' using errcode = '42501';
  end if;
  if not internal.has_fresh_totp() then
    raise exception 'confirm with a fresh authenticator code first' using errcode = '42501';
  end if;
  if p_is_active is null then
    raise exception 'say whether the RW goes online or offline' using errcode = '22023';
  end if;
  perform 1 from public.rw_units u where u.id = p_rw_id for update;
  if not found then
    raise exception 'no RW %', p_rw_id using errcode = 'P0002';
  end if;

  if p_is_active and exists (
    select 1 from unnest(array['package_default', 'addon_default']::public.revenue_rule_scope[]) as needed(scope)
    where not exists (
      select 1 from public.revenue_share_rules r
      where r.scope = needed.scope and r.rw_id = p_rw_id and r.is_active
        and r.effective_from <= today and (r.effective_to is null or r.effective_to >= today))
  ) then
    raise exception 'RW % needs its default revenue-share rules for packages and add-ons first', p_rw_id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  update public.rw_units set is_active = p_is_active where id = p_rw_id;
  perform internal.log_audit(case when p_is_active then 'rw_unit.activated' else 'rw_unit.deactivated' end,
    'rw_units', p_rw_id::text, '{}');
end;
$$;
revoke execute on function public.set_rw_unit_status(smallint, boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_rw_unit_status(smallint, boolean) to authenticated;
