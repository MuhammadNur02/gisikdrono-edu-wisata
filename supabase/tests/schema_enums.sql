-- Structure test for 0002_enums and the migrations that add to it: public holds exactly the 42 enums of
-- docs/PRD.md §8.3, each with exactly its values in the same order.
begin;
select plan(43);

select enums_are(
  'public',
  array['app_role', 'content_status', 'session_status', 'package_category', 'pricing_basis', 'product_category', 'booker_type', 'booking_channel', 'booking_status', 'booking_leg_status', 'addon_fulfillment_status', 'payment_provider', 'payment_method', 'payment_status', 'quotation_status', 'invoice_status', 'ticket_status', 'scan_phase', 'scan_result', 'certificate_kind', 'certificate_status', 'review_status', 'gallery_category', 'media_type', 'article_category', 'booklet_kind', 'activity_point_type', 'schedule_type', 'revenue_rule_scope', 'revenue_beneficiary', 'revenue_entry_type', 'adjustment_type', 'adjustment_status', 'notification_channel', 'notification_status', 'notification_template', 'document_kind', 'otp_purpose', 'export_kind', 'alert_severity', 'rw_accent', 'rw_icon'],
  'public has exactly the enums of PRD §8.3'
);

select enum_has_labels('public', 'app_role', array['superadmin', 'admin_rw', 'none']);
select enum_has_labels('public', 'content_status', array['draft', 'pending_review', 'published', 'archived']);
select enum_has_labels('public', 'session_status', array['open', 'closed', 'cancelled']);
select enum_has_labels('public', 'package_category', array['regular', 'student', 'institutional', 'combo']);
select enum_has_labels('public', 'pricing_basis', array['per_pax', 'flat_group']);
select enum_has_labels('public', 'product_category', array['compost', 'seedling', 'recycled_craft', 'snack', 'souvenir', 'other']);
select enum_has_labels('public', 'booker_type', array['individual', 'school', 'university', 'government', 'company', 'community', 'other']);
select enum_has_labels('public', 'booking_channel', array['web', 'admin']);
select enum_has_labels('public', 'booking_status', array['quoted', 'pending_payment', 'paid', 'checked_in', 'completed', 'no_show', 'expired', 'cancelled', 'refunded']);
select enum_has_labels('public', 'booking_leg_status', array['unreserved', 'reserved', 'checked_in', 'released']);
select enum_has_labels('public', 'addon_fulfillment_status', array['pending', 'prepared', 'handed_over', 'cancelled']);
select enum_has_labels('public', 'payment_provider', array['midtrans', 'manual']);
select enum_has_labels('public', 'payment_method', array['qris', 'virtual_account', 'manual_transfer', 'cash']);
select enum_has_labels('public', 'payment_status', array['initiated', 'pending', 'needs_review', 'settled', 'denied', 'failed', 'cancelled', 'expired', 'refunded', 'partially_refunded', 'disputed', 'duplicate']);
select enum_has_labels('public', 'quotation_status', array['issued', 'accepted', 'expired', 'superseded', 'void']);
select enum_has_labels('public', 'invoice_status', array['issued', 'paid', 'void']);
select enum_has_labels('public', 'ticket_status', array['issued', 'used', 'suspended', 'revoked', 'expired']);
select enum_has_labels('public', 'scan_phase', array['validate', 'check_in']);
select enum_has_labels('public', 'scan_result', array['ok', 'invalid_signature', 'not_found', 'already_used', 'suspended', 'revoked', 'wrong_rw', 'wrong_date', 'outside_window', 'booking_not_paid', 'ticket_expired', 'forbidden']);
select enum_has_labels('public', 'certificate_kind', array['group', 'participant']);
select enum_has_labels('public', 'certificate_status', array['issued', 'revoked']);
select enum_has_labels('public', 'review_status', array['pending', 'published', 'rejected']);
select enum_has_labels('public', 'gallery_category', array['activity', 'umkm', 'visit', 'event']);
select enum_has_labels('public', 'media_type', array['image', 'video']);
select enum_has_labels('public', 'article_category', array['news', 'education', 'announcement']);
select enum_has_labels('public', 'booklet_kind', array['ebooklet', 'visit_proposal', 'price_list']);
select enum_has_labels('public', 'activity_point_type', array['bank_sampah', 'composter', 'maggot', 'urban_farming', 'pkk_craft', 'sanggar', 'culture_house', 'stage', 'dolanan_area', 'umkm_stall', 'meeting_point', 'other']);
select enum_has_labels('public', 'schedule_type', array['dance_performance', 'dolanan_session', 'workshop', 'art_class', 'other']);
select enum_has_labels('public', 'revenue_rule_scope', array['package_default', 'addon_default', 'package', 'product']);
select enum_has_labels('public', 'revenue_beneficiary', array['kelurahan', 'rw_treasury', 'umkm_vendor']);
select enum_has_labels('public', 'revenue_entry_type', array['settlement', 'reversal', 'adjustment']);
select enum_has_labels('public', 'adjustment_type', array['manual_mark_paid', 'manual_refund', 'write_off', 'reclassify_share', 'pax_correction']);
select enum_has_labels('public', 'adjustment_status', array['proposed', 'approved', 'rejected', 'applied']);
select enum_has_labels('public', 'notification_channel', array['whatsapp', 'email']);
select enum_has_labels('public', 'notification_status', array['queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled']);
select enum_has_labels('public', 'notification_template', array['phone_otp', 'booking_created', 'quotation_ready', 'payment_reminder', 'payment_received_ticket', 'booking_expired', 'booking_cancelled', 'visit_reminder_d1', 'checked_in_thanks', 'certificate_ready', 'review_invite', 'refund_processed', 'admin_new_paid_booking', 'admin_booking_needs_review', 'security_alert', 'booking_link']);
select enum_has_labels('public', 'document_kind', array['quotation', 'invoice', 'receipt', 'credit_note', 'certificate']);
select enum_has_labels('public', 'otp_purpose', array['booking_phone', 'dsr_identity']);
select enum_has_labels('public', 'export_kind', array['visits', 'attendance', 'finance', 'audit']);
select enum_has_labels('public', 'alert_severity', array['info', 'medium', 'high', 'critical']);
select enum_has_labels('public', 'rw_accent', array['leaf', 'terracotta', 'mulberry', 'teal', 'violet']);
select enum_has_labels('public', 'rw_icon', array['recycle', 'drama', 'heart_handshake', 'landmark', 'users']);

select * from finish();
rollback;
