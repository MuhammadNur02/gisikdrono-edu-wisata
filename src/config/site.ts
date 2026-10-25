import type { EnumValue } from '@/db/enums';
import { PUBLIC_SITE_URL, PUBLIC_WHATSAPP_CONTACT_NUMBER } from '@/lib/public-literals';

// Client components read this (the WhatsApp button on every public page), so it takes the inlined literals,
// not publicEnv, which would ship zod with every page (Task P5.6.01).
export const siteConfig = {
  name: 'Edu Wisata Gisikdrono',
  // The kelurahan runs the platform; the name is what JSON-LD and the footer credit (docs/PRD.md §1).
  ownerName: 'Kelurahan Gisikdrono',
  url: PUBLIC_SITE_URL,
  whatsappContactNumber: PUBLIC_WHATSAPP_CONTACT_NUMBER,
  // The office's locality, as written in site_settings `kelurahan.address` (0008_seed). The street address
  // and the other contact details come from site_settings once the public queries exist (Task P2.3.02).
  locality: {
    district: 'Kecamatan Semarang Barat',
    city: 'Kota Semarang',
    province: 'Jawa Tengah',
    countryCode: 'ID',
  },
} as const;

// The home hero's one statement (redesign of 2026-10-24, after dusunbambu.id's "Experience of / Outdoor Dining
// Resort"): a short lead and the place itself, so the photo stays clean and the h1 names the kampung.
export const HOME_HERO_STATEMENT = {
  lead: 'Pengalaman belajar di',
  title: 'Kampung Gisikdrono',
} as const;

// Every visit date, session time and "today" is Semarang time, whatever the visitor's device says.
export const APP_TZ = 'Asia/Jakarta';

// The version of the /privasi notice a booking records as consent_version (docs/Security.md §7.6, PDP-01; decision
// of 2026-10-22 on P3.5, Q3). It changes whenever the text of /privasi changes.
export const PRIVACY_NOTICE_VERSION = '2026-10-18';

// The booking wizard's steps in order, each bound to ?step= (docs/StyleGuide.md §5.14, docs/PRD.md FR-BOOK-01).
export const BOOKING_STEPS = ['jadwal', 'data', 'tambahan', 'ringkasan'] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

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
  // Decision of 2026-10-25 on the weather, rule 4; sent by email only until Meta approves it (docs/notifications.md).
  weather_disruption: 'gsk_weather_disruption_v1',
} as const satisfies Record<EnumValue<'notification_template'>, string>;
