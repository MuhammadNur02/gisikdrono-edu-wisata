import { RW_IDS } from '@/config/rw';

// The bounds of what the booking wizard sends (Task P3.1.01). Where a column of docs/PRD.md §8.4.4 has a CHECK,
// the number here is the same one, so the visitor hears about it at the form rather than as a database error.
export const BOOKING_LIMITS = {
  // One session per RW the package visits: a combo visits both, on the same date.
  sessions: RW_IDS.length,
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

// booking_participants.role_label CHECK.
export const PARTICIPANT_ROLES = ['student', 'teacher', 'chaperone', 'participant'] as const;
