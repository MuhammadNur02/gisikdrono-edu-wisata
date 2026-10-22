// The most RWs one package visits, a combo included (Task P3.9.04): every leg is another RW, and a combo pays each of
// them an equal part of the RWs' share. internal.create_booking holds a booking's sessions to the package's own legs,
// one session per leg (Task P3.4.01).
export const MAX_PACKAGE_LEGS = 4;

// The bounds of what the booking wizard sends (Task P3.1.01). Where a column of docs/PRD.md §8.4.4 has a CHECK,
// the number here is the same one, so the visitor hears about it at the form rather than as a database error.
export const BOOKING_LIMITS = {
  // One session per RW the package visits, a combo's on the same date. The RWs are data (decision of 2026-10-21), so
  // this only bounds what a form may send; the server holds the sessions against the package's own legs.
  sessions: MAX_PACKAGE_LEGS,
  picName: 120,
  // docs/Security.md §4.4: a quotation prints at most 80 characters of it.
  institutionName: 80,
  notes: 1000,
  addonLines: 20,
  // No UMKM product is ordered by the thousand; each product's own minimum and maximum still apply in the quote.
  addonQuantity: 1000,
  addonNotes: 200,
  participants: 300,
  participantName: { min: 2, max: 120 },
  groupLabel: 60,
  consentVersion: 32,
} as const;

// The bookers whose treasurer pays through its own approvals: they get the 24-hour hold (internal.hold_deadline) and
// may ask for a quotation instead of paying at once (decision of 2026-10-22, Q5; docs/PRD.md FR-BOOK-05).
export const INSTITUTION_BOOKER_TYPES = ['school', 'university', 'government', 'company'] as const;

// docs/PRD.md FR-BOOK-02: the wizard reads the seats left again this often, through the server.
export const SESSION_REFRESH_MS = 15_000;

// internal.create_booking takes a code verified at most ten minutes ago. The wizard asks for a new one after eight,
// so the summary keeps two minutes in hand (decision of 2026-10-22 on P3.5, Q2).
export const PHONE_PROOF_FRESH_SECONDS = 8 * 60;

// booking_participants.role_label CHECK.
export const PARTICIPANT_ROLES = ['student', 'teacher', 'chaperone', 'participant'] as const;
