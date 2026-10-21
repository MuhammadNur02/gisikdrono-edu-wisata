import type { EnumValue } from '@/db/enums';
import { publicEnv } from '@/lib/public-env';

export const siteConfig = {
  name: 'Edu Wisata Gisikdrono',
  // The kelurahan runs the platform; the name is what JSON-LD and the footer credit (docs/PRD.md §1).
  ownerName: 'Kelurahan Gisikdrono',
  url: publicEnv.NEXT_PUBLIC_SITE_URL,
  whatsappContactNumber: publicEnv.NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER,
  // The office's locality, as written in site_settings `kelurahan.address` (0008_seed). The street address
  // and the other contact details come from site_settings once the public queries exist (Task P2.3.02).
  locality: {
    district: 'Kecamatan Semarang Barat',
    city: 'Kota Semarang',
    province: 'Jawa Tengah',
    countryCode: 'ID',
  },
} as const;

// Every visit date, session time and "today" is Semarang time, whatever the visitor's device says.
export const APP_TZ = 'Asia/Jakarta';

// Meta template names per notification_template (CLAUDE.md Appendix A.4, docs/Task.md Appendix B).
// admin_booking_needs_review has no template of its own: it reuses the paid-booking template with other text.
export const WHATSAPP_TEMPLATE_NAMES = {
  phone_otp: 'gsk_otp_v1',
  booking_created: 'gsk_booking_created_v1',
  quotation_ready: 'gsk_quotation_ready_v1',
  payment_reminder: 'gsk_payment_reminder_v1',
  payment_received_ticket: 'gsk_ticket_issued_v1',
  booking_expired: 'gsk_booking_expired_v1',
  booking_cancelled: 'gsk_booking_cancelled_v1',
  visit_reminder_d1: 'gsk_visit_reminder_d1_v1',
  checked_in_thanks: 'gsk_checked_in_thanks_v1',
  certificate_ready: 'gsk_certificate_ready_v1',
  review_invite: 'gsk_review_invite_v1',
  refund_processed: 'gsk_refund_processed_v1',
  admin_new_paid_booking: 'gsk_admin_new_paid_booking_v1',
  admin_booking_needs_review: 'gsk_admin_new_paid_booking_v1',
  security_alert: 'gsk_security_alert_v1',
  // Decision of 2026-10-21 (Task P3.3.03): the link a visitor asks for again at /reservasi/cari.
  booking_link: 'gsk_booking_link_v1',
} as const satisfies Record<EnumValue<'notification_template'>, string>;
