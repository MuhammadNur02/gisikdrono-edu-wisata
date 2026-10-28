// The site_settings keys /dashboard/settings edits (Task P4.9.01, docs/PRD.md §8.6, CLAUDE.md §10.2). The form's field
// names are camelCase, since react-hook-form would read the dots of `checkin.grace_before_minutes` as nesting; each
// maps to its key here, the one place the two spellings meet.
export const EDITABLE_SETTING_KEYS = {
  whatsappEnabled: 'whatsapp_enabled',
  emailEnabled: 'email_enabled',
  maintenanceMode: 'maintenance_mode',
  rateLimitProfile: 'rate_limit_profile',
  graceBeforeMinutes: 'checkin.grace_before_minutes',
  graceAfterMinutes: 'checkin.grace_after_minutes',
  holdMinutesIndividual: 'booking.hold_minutes_individual',
  holdHoursInstitution: 'booking.hold_hours_institution',
  quotationValidDays: 'booking.quotation_valid_days',
  minLeadHours: 'booking.min_lead_hours',
  maxAdvanceDays: 'booking.max_advance_days',
  maxPax: 'booking.max_pax',
  minPricePerPax: 'pricing.min_price_per_pax',
  piiRetentionMonths: 'pii_retention_months',
  expectedPayoutAccountMasked: 'finance.expected_payout_account_masked',
  contactWhatsappNumber: 'contact.whatsapp_number',
  contactEmail: 'contact.email',
  kelurahanAddress: 'kelurahan.address',
  signatoryName: 'kelurahan.signatory_name',
  signatoryTitle: 'kelurahan.signatory_title',
  certificateTemplateVersion: 'certificate.template_version',
  seoDefaultDescription: 'seo.default_description',
  dpoName: 'privacy.dpo_name',
  dpoEmail: 'privacy.dpo_email',
} as const;

export type EditableSettingName = keyof typeof EDITABLE_SETTING_KEYS;

// Shown, never switched, from the form until the guest pages of Task P3.12 exist: the migration of P3.12.01 opens
// booking again (20261023090000_booking_closed_until_guest_pages.sql).
export const BOOKING_ENABLED_KEY = 'booking_enabled';

export const RATE_LIMIT_PROFILES = ['normal', 'strict'] as const;

// The ranges the form accepts. The database reads these numbers inside its functions (holds, the price floor, the
// nightly session job, retention), so a value that would switch a rule off or stall it is refused here.
export const SETTING_LIMITS = {
  graceMinutesMax: 720,
  holdMinutesMin: 15,
  holdMinutesMax: 1440,
  holdHoursMin: 1,
  // A hold may be extended to 14 days at most (extend_booking_hold), so it never starts longer. An officer's booking of
  // one RW is the exception these numbers do not set: it is held until 23:59 WIB of its visit day (docs/PRD.md §13.1
  // A23 and its addendum; docs/Security.md §4.2).
  holdHoursMax: 336,
  quotationDaysMin: 1,
  quotationDaysMax: 90,
  leadHoursMax: 720,
  advanceDaysMin: 1,
  advanceDaysMax: 730,
  maxPaxMin: 1,
  maxPaxMax: 5000,
  // Integer rupiah (CLAUDE.md §7.1).
  minPricePerPaxMin: 1,
  minPricePerPaxMax: 10_000_000,
  retentionMonthsMin: 1,
  retentionMonthsMax: 120,
  templateVersionMin: 1,
  templateVersionMax: 99,
  shortText: 120,
  address: 300,
  seoDescription: 160,
  payoutAccount: 40,
  email: 254,
} as const;
