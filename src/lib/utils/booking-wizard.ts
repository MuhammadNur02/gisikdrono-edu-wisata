import { addDays } from 'date-fns';
import { z } from 'zod';

import { DRAFT_TTL_MS, MAX_PACKAGE_LEGS } from '@/config/booking';
import { BOOKING_STEPS, type BookingStep } from '@/config/site';
import { DB_ENUMS, type EnumValue } from '@/db/enums';
import { calendarDateToVisitDate, visitDateToCalendarDate } from '@/lib/utils/dates';
import {
  addonsStepSchema,
  bookerStepSchema,
  scheduleStepSchema,
  type CreateBookingInput,
  type ShownContact,
} from '@/lib/validations/booking';
import type { WizardPackage } from '@/types/booking';
import type { ParticipantRow } from '@/types/forms';
import type { ProvenContact } from '@/types/guest';
import type { AvailableSession, BookableLeg } from '@/types/session';

// The booking wizard's draft and the rules read from it (docs/PRD.md FR-BOOK-01, FR-BOOK-02; docs/StyleGuide.md
// §5.14). The draft holds identifiers, quantities and what the visitor typed: never a price, which only the server's
// quote gives, and never the OTP code.

export interface BookingDraft {
  visitDate: string | null;
  // One session per leg of the package, in leg order; '' for a leg not chosen yet.
  sessionIds: string[];
  pax: number;
  // Chosen by the visitor: the type decides the hold and whether a quotation may be asked for.
  bookerType: EnumValue<'booker_type'> | null;
  institutionName: string;
  picName: string;
  picEmail: string;
  notes: string;
  participants: ParticipantRow[];
  guardianConsent: boolean;
  addons: { productId: string; qty: number }[];
  contact: ProvenContact | null;
  // Drawn once per draft, so the same form sent twice makes one booking (BOOK-06).
  idempotencyKey: string;
  // When the draft was last written, in milliseconds; it lives DRAFT_TTL_MS from then.
  savedAt: number;
}

export function emptyDraft(wizardPackage: WizardPackage): BookingDraft {
  return {
    visitDate: null,
    sessionIds: wizardPackage.rws.map(() => ''),
    pax: wizardPackage.minPax,
    bookerType: null,
    institutionName: '',
    picName: '',
    picEmail: '',
    notes: '',
    participants: [],
    guardianConsent: false,
    addons: [],
    contact: null,
    idempotencyKey: '',
    savedAt: 0,
  };
}

// Bounds for reading a stored draft back, wider than anything the steps accept, so an odd draft is dropped before a
// form ever sees it.
const DRAFT_LIMITS = { text: 2000, id: 64, rows: 1000, addonLines: 50 } as const;
const text = z.string().max(DRAFT_LIMITS.text);
const id = z.string().max(DRAFT_LIMITS.id);

// sessionStorage can hold anything: a draft of an older wizard, or one edited by hand. Whatever does not fit is
// dropped and the wizard starts again.
const draftSchema = z
  .object({
    visitDate: z.iso.date().nullable(),
    sessionIds: z.array(id).max(MAX_PACKAGE_LEGS),
    pax: z.int().nonnegative(),
    bookerType: z.enum(DB_ENUMS.booker_type).nullable(),
    institutionName: text,
    picName: text,
    picEmail: text,
    notes: text,
    participants: z
      .array(z.object({ fullName: text, groupLabel: text }).strict())
      .max(DRAFT_LIMITS.rows),
    guardianConsent: z.boolean(),
    addons: z
      .array(z.object({ productId: id, qty: z.int() }).strict())
      .max(DRAFT_LIMITS.addonLines),
    contact: z
      .object({
        channel: z.enum(['whatsapp', 'email']),
        phone: text,
        email: text.nullable(),
        verifiedAt: z.number(),
      })
      .strict()
      .nullable(),
    idempotencyKey: id,
    savedAt: z.number().nonnegative(),
  })
  .strict();

// The stored draft when it can still be used, else null: it is for another package shape, older than DRAFT_TTL_MS, or
// not a draft at all. The hook removes such a draft at once, since it holds the PIC's details (review of PR #27, L5).
export function parseDraft(
  stored: string,
  wizardPackage: WizardPackage,
  nowMs: number,
): BookingDraft | null {
  try {
    const parsed = draftSchema.safeParse(JSON.parse(stored));
    if (!parsed.success) return null;
    const fitsPackage = parsed.data.sessionIds.length === wizardPackage.rws.length;
    const isFresh = nowMs - parsed.data.savedAt <= DRAFT_TTL_MS;
    return fitsPackage && isFresh ? parsed.data : null;
  } catch {
    return null;
  }
}

export function readDraft(
  stored: string | null,
  wizardPackage: WizardPackage,
  nowMs: number,
): BookingDraft {
  return (
    (stored === null ? null : parseDraft(stored, wizardPackage, nowMs)) ?? emptyDraft(wizardPackage)
  );
}

// A participant row left empty is no participant; one with a name too short is still refused.
export function namedRows(rows: readonly ParticipantRow[]): ParticipantRow[] {
  return rows.filter((row) => row.fullName.trim() !== '' || row.groupLabel.trim() !== '');
}

export function scheduleValues(draft: BookingDraft) {
  return { visitDate: draft.visitDate, visitSessionIds: draft.sessionIds, pax: draft.pax };
}

export function bookerValues(draft: BookingDraft) {
  return {
    bookerType: draft.bookerType,
    institutionName: draft.institutionName,
    picName: draft.picName,
    picEmail: draft.picEmail,
    notes: draft.notes,
    participants: draft.participants,
    guardianConsent: draft.guardianConsent,
  };
}

function isStepComplete(step: BookingStep, draft: BookingDraft, wizardPackage: WizardPackage) {
  if (step === 'jadwal') {
    const isWithinPackage = draft.pax >= wizardPackage.minPax && draft.pax <= wizardPackage.maxPax;
    return (
      isWithinPackage &&
      scheduleStepSchema(wizardPackage.maxPax).safeParse(scheduleValues(draft)).success
    );
  }
  if (step === 'data') {
    return (
      draft.contact !== null && bookerStepSchema(draft.pax).safeParse(bookerValues(draft)).success
    );
  }
  if (step === 'tambahan') return addonsStepSchema.safeParse({ addons: draft.addons }).success;
  return false;
}

// StyleGuide §5.14: the visitor may go back at any time, but not skip ahead past a step whose check fails, by the
// stepper or by the address. The last step is where the booking is sent, so it is never "complete".
export function firstIncompleteStep(
  draft: BookingDraft,
  wizardPackage: WizardPackage,
): BookingStep {
  return BOOKING_STEPS.find((step) => !isStepComplete(step, draft, wizardPackage)) ?? 'ringkasan';
}

export function stepIndex(step: BookingStep): number {
  return BOOKING_STEPS.indexOf(step);
}

export function isBookingStep(value: unknown): value is BookingStep {
  return typeof value === 'string' && (BOOKING_STEPS as readonly string[]).includes(value);
}

// The sessions of one leg on a day that still have room for the group.
export function sessionsOn(leg: BookableLeg, visitDate: string): AvailableSession[] {
  return leg.sessions.filter((session) => session.sessionDate === visitDate);
}

const fitsGroup = (pax: number) => (session: AvailableSession) => session.remaining >= pax;

// docs/PRD.md FR-BOOK-02 and Task P3.5.01: a day is bookable when every RW the package visits has a session on it
// with room for the group, since a combo's legs take the same date.
export function bookableDates(legs: readonly BookableLeg[], pax: number): string[] {
  const [firstLeg, ...otherLegs] = legs;
  if (!firstLeg) return [];
  const daysOf = (leg: BookableLeg) =>
    new Set(leg.sessions.filter(fitsGroup(pax)).map((session) => session.sessionDate));
  const otherDays = otherLegs.map(daysOf);
  return [...daysOf(firstLeg)].filter((day) => otherDays.every((days) => days.has(day))).sort();
}

const BUSY_SHARE = 0.8;

// docs/StyleGuide.md §5.6 DatePicker: a day whose sessions are at least 80 % reserved shows an amber dot.
export function busyDates(legs: readonly BookableLeg[]): string[] {
  const seatsByDay = new Map<string, { capacity: number; remaining: number }>();
  for (const session of legs.flatMap((leg) => leg.sessions)) {
    const seats = seatsByDay.get(session.sessionDate) ?? { capacity: 0, remaining: 0 };
    seatsByDay.set(session.sessionDate, {
      capacity: seats.capacity + session.capacity,
      remaining: seats.remaining + session.remaining,
    });
  }
  return [...seatsByDay]
    .filter(([, seats]) => seats.capacity > 0 && 1 - seats.remaining / seats.capacity >= BUSY_SHARE)
    .map(([day]) => day)
    .sort();
}

// What a day cell of the wizard's calendar says (DESIGN-SPEC §2.4 Calendar day cell): the seats the group can still
// take that day (the fewest of any RW the package visits) and its state. closed: an RW has no session that day;
// full: no session of some RW has room for the group; busy: at least 80 % reserved; open otherwise.
export type DayState = 'open' | 'busy' | 'full' | 'closed';

export interface DayAvailability {
  seats: number;
  state: DayState;
}

function dayStateOf(day: { isClosed: boolean; isBookable: boolean; isBusy: boolean }): DayState {
  if (day.isClosed) return 'closed';
  if (!day.isBookable) return 'full';
  return day.isBusy ? 'busy' : 'open';
}

export function dayAvailability(
  legs: readonly BookableLeg[],
  pax: number,
): Map<string, DayAvailability> {
  const busy = new Set(busyDates(legs));
  const bookable = new Set(bookableDates(legs, pax));
  const days = new Set(legs.flatMap((leg) => leg.sessions.map((session) => session.sessionDate)));
  const result = new Map<string, DayAvailability>();
  for (const day of days) {
    const seatsPerLeg = legs.map((leg) =>
      sessionsOn(leg, day).reduce((seats, session) => seats + session.remaining, 0),
    );
    const isClosed = legs.some((leg) => sessionsOn(leg, day).length === 0);
    const seats = Math.min(...seatsPerLeg);
    const state = dayStateOf({ isClosed, isBookable: bookable.has(day), isBusy: busy.has(day) });
    result.set(day, { seats: isClosed ? 0 : seats, state });
  }
  return result;
}

// Every day from first to last that is not bookable, for the date picker to disable.
export function unbookableDatesBetween(
  first: string,
  last: string,
  bookable: readonly string[],
): string[] {
  const open = new Set(bookable);
  const days: string[] = [];
  for (
    let day = visitDateToCalendarDate(first);
    calendarDateToVisitDate(day) <= last;
    day = addDays(day, 1)
  ) {
    const visitDate = calendarDateToVisitDate(day);
    if (!open.has(visitDate)) days.push(visitDate);
  }
  return days;
}

// Review of PR #27, M1: the contact the summary shows as verified, which createBookingAction holds against the cookie.
export function shownContactOf(draft: BookingDraft): ShownContact {
  if (draft.contact === null) return null;
  const { channel, phone, email } = draft.contact;
  return { channel, phone, email };
}

// What createBookingAction is sent from the summary (Task P3.5.04): the draft's identifiers, quantities and words,
// that the privacy notice was ticked, and the hash of the quote they saw. An individual names no institution, and while
// WhatsApp is limited the PIC's address is the one the code proved, which the server takes from the proof in any case.
export function bookingToSend(
  draft: BookingDraft,
  wizardPackage: WizardPackage,
  summary: { privacyAccepted: true; turnstileToken: string },
  quoteHash: string,
): Omit<CreateBookingInput, 'bookerType' | 'visitDate'> & {
  bookerType: BookingDraft['bookerType'];
  visitDate: BookingDraft['visitDate'];
} {
  return {
    packageId: wizardPackage.id,
    visitSessionIds: draft.sessionIds,
    visitDate: draft.visitDate,
    pax: draft.pax,
    bookerType: draft.bookerType,
    institutionName: draft.bookerType === 'individual' ? null : draft.institutionName,
    picName: draft.picName,
    picEmail:
      draft.contact?.channel === 'email' && draft.contact.email !== null
        ? draft.contact.email
        : draft.picEmail,
    notes: draft.notes,
    addons: draft.addons.map((line) => ({ productId: line.productId, qty: line.qty, notes: null })),
    participants: draft.participants.map((row) => ({
      fullName: row.fullName,
      groupLabel: row.groupLabel.trim() === '' ? null : row.groupLabel,
      roleLabel: null,
    })),
    guardianConsent: draft.guardianConsent,
    privacyAccepted: summary.privacyAccepted,
    idempotencyKey: draft.idempotencyKey,
    quoteHash,
    turnstileToken: summary.turnstileToken,
  };
}
