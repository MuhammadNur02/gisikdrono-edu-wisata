-- products_heading (20261021130000) is the wording of a public heading, nothing private, so the audit log keeps its
-- values like those of the other columns an RW page shows (independent review of Task P2.10.02, L3). The body is
-- 20261021120000's with that one column added; create or replace keeps the owner and the revoked grants.
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
