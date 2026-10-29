'use server';

import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { after } from 'next/server';
import type { z } from 'zod';

import { TURNSTILE_ACTIONS } from '@/config/auth';
import { INSTITUTION_BOOKER_TYPES, PHONE_PROOF_FRESH_SECONDS } from '@/config/booking';
import { GUEST_BOOKING_PATH, PHONE_PROOF_TTL_SECONDS } from '@/config/guest';
import type { EnumValue } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { fail, mapError, ok } from '@/lib/errors';
import type { PhoneProof } from '@/lib/links/phone-proof';
import { TAGS } from '@/lib/queries/tags';
import { verifyTurnstile } from '@/lib/turnstile';
import { clientIpFrom, rateLimitIpBucket } from '@/lib/utils/client-ip';
import {
  bookingRequestSchema,
  createBookingSchema,
  packageRequestSchema,
  quotePreviewSchema,
  type BookingMode,
  type CreateBookingValues,
  type ShownContact,
} from '@/lib/validations/booking';
import {
  readPhoneProofCookie,
  forgetPhoneProof,
  rememberGuestLink,
} from '@/server/auth/guest-cookies';
import type { BookingOutcome } from '@/server/services/booking-request';
import {
  createHold,
  createQuotedBooking,
  withinGuestLimits,
} from '@/server/services/booking-service';
import {
  listBookableSessions,
  loadBookingWizard,
  quoteWizardBooking,
  type BookingWizard,
  type QuotePreview,
} from '@/server/services/booking-wizard-service';
import { kickNotificationWorker } from '@/server/services/notification-service';
import type { ActionResult } from '@/types/action-result';
import type { BookingSubmitAnswer, QuotePreviewAnswer } from '@/types/booking';
import type { BookableLeg } from '@/types/session';

// The booking wizard's actions (Task P3.5.01, P3.5.03, P3.5.04; docs/PRD.md FR-BOOK-01…05). The two reads answer
// what the database already says, behind a per-IP limit, and write nothing. createBookingAction books through
// booking-service.ts in the order of CLAUDE.md §5.2, with the PIC's contact from the gsk_phone cookie only.

const text = copy.booking.wizard;
const MS_PER_SECOND = 1000;

type WizardRead = { ok: true; wizard: BookingWizard } | ReturnType<typeof fail>;

async function openWizard(packageSlug: string): Promise<WizardRead> {
  const wizard = await loadBookingWizard(packageSlug);
  if (!wizard) return fail('NOT_FOUND');
  if (!wizard.isOpen) {
    return fail('STATE_INVALID', undefined, wizard.isPrelaunch ? text.prelaunch : text.closed);
  }
  return { ok: true, wizard };
}

async function isWithinIpLimit(
  name: 'session_availability:ip' | 'quote_preview:ip' | 'booking_create:ip' | 'quotation:create',
) {
  const clientIp = clientIpFrom(await headers());
  return withinGuestLimits([{ name, subject: rateLimitIpBucket(clientIp) }]);
}

// docs/PRD.md FR-BOOK-02: the seats left, read again every 15 s while the visitor chooses.
export async function listBookableSessionsAction(
  input: unknown,
): Promise<ActionResult<BookableLeg[]>> {
  const parsed = packageRequestSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  try {
    if (!(await isWithinIpLimit('session_availability:ip'))) return fail('RATE_LIMITED');
    const read = await openWizard(parsed.data.packageSlug);
    if (!read.ok) return read;
    return ok(await listBookableSessions(read.wizard));
  } catch (error) {
    return mapError(error);
  }
}

function problemAnswer(preview: Exclude<QuotePreview, { ok: true }>): QuotePreviewAnswer {
  return preview.problem === 'pax_out_of_range'
    ? { kind: 'problem', problem: preview.problem }
    : { kind: 'problem', problem: preview.problem, productId: preview.productId };
}

// Task P3.5.03: the price of what the visitor chose, computed here from the catalogue (PAY-03). A choice the catalogue
// does not allow is an answer for the wizard to put into words, not an error.
export async function previewQuoteAction(
  input: unknown,
): Promise<ActionResult<QuotePreviewAnswer>> {
  const parsed = quotePreviewSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  try {
    if (!(await isWithinIpLimit('quote_preview:ip'))) return fail('RATE_LIMITED');
    const read = await openWizard(parsed.data.packageSlug);
    if (!read.ok) return read;
    const preview = quoteWizardBooking(read.wizard, parsed.data);
    if (!preview.ok) return ok(problemAnswer(preview));
    return ok({ kind: 'quote', quote: preview.quote, quoteHash: preview.quoteHash });
  } catch (error) {
    return mapError(error);
  }
}

interface CheckedBooking {
  mode: BookingMode;
  wizard: BookingWizard;
  values: CreateBookingValues;
  shownContact: ShownContact;
}

const isInstitution = (bookerType: EnumValue<'booker_type'>) =>
  (INSTITUTION_BOOKER_TYPES as readonly string[]).includes(bookerType);

// Step 1: the request, then the booking against its package's own booking.max_pax. "Minta Surat Penawaran" is for
// institutions only (docs/PRD.md FR-BOOK-05; decision of 2026-10-22, Q5).
type BookingRequestValues = z.output<typeof bookingRequestSchema>;

async function checkBooking(
  request: BookingRequestValues,
  mode: BookingMode,
): Promise<{ ok: true; booking: CheckedBooking } | ReturnType<typeof fail>> {
  const read = await openWizard(request.packageSlug);
  if (!read.ok) return read;
  const parsed = createBookingSchema(read.wizard.rules.maxPax).safeParse(request.booking);
  if (!parsed.success) return mapError(parsed.error);
  if (parsed.data.packageId !== read.wizard.package.id) return fail('VALIDATION');
  if (mode === 'quote' && !isInstitution(parsed.data.bookerType)) {
    return fail('VALIDATION', undefined, text.quoteForInstitutions);
  }
  return {
    ok: true,
    booking: { mode, wizard: read.wizard, values: parsed.data, shownContact: request.shownContact },
  };
}

// internal.create_booking takes a code at most ten minutes old; past eight the wizard asks for a new one, so the
// database never refuses a booking the visitor has filled in for a stale code (decision on P3.5, Q2).
function isFresh(proof: PhoneProof | null): proof is PhoneProof {
  if (proof === null) return false;
  const verifiedAt = proof.expiresAt - PHONE_PROOF_TTL_SECONDS;
  return Date.now() / MS_PER_SECOND - verifiedAt <= PHONE_PROOF_FRESH_SECONDS;
}

// Review of PR #27, M1: gsk_phone is one cookie for every tab of this browser, so the code another tab entered since
// may prove a contact other than the one this summary shows. The booking then waits for a code of the shown contact.
function provesShownContact(proof: PhoneProof, shown: ShownContact): boolean {
  if (shown === null || shown.channel !== proof.channel || shown.phone !== proof.phone)
    return false;
  return proof.channel === 'whatsapp' || shown.email === proof.email?.toLowerCase();
}

function nextUrlOf(outcome: Extract<BookingOutcome, { kind: 'created' }>): string {
  const bookingPage = `${GUEST_BOOKING_PATH}/${outcome.bookingCode}`;
  return outcome.status === 'pending_payment' ? `${bookingPage}/bayar` : bookingPage;
}

const monthOf = (visitDate: string) => visitDate.slice(0, 'YYYY-MM'.length);

// Steps 4 and 5 for a new booking: the sessions of the months it visits, as the database booked them (review of PR
// #27, L3), the manage link in this browser, and the spent code forgotten. The visitor's own browser goes on to the
// pay page or the booking's status page (decision on P3.5, Q1).
async function settleCreated(
  booking: CheckedBooking,
  outcome: Extract<BookingOutcome, { kind: 'created' }>,
): Promise<BookingSubmitAnswer> {
  const months = new Set([monthOf(outcome.visitDate), monthOf(outcome.visitDateEnd)]);
  for (const rw of booking.wizard.package.rws) {
    for (const month of months) revalidateTag(TAGS.sessions(rw.id, month));
  }
  await rememberGuestLink(outcome.bookingCode, outcome.manageToken);
  await forgetPhoneProof();
  after(kickNotificationWorker);
  return { kind: 'created', bookingCode: outcome.bookingCode, nextUrl: nextUrlOf(outcome) };
}

async function submit(booking: CheckedBooking, proof: PhoneProof): Promise<BookingSubmitAnswer> {
  const requestHeaders = await headers();
  const request = {
    values: booking.values,
    proof,
    clientIp: clientIpFrom(requestHeaders),
    userAgent: requestHeaders.get('user-agent') ?? '',
  };
  const outcome = await (booking.mode === 'pay'
    ? createHold(request)
    : createQuotedBooking(request));
  if (outcome.kind !== 'created') return { kind: outcome.kind };
  return settleCreated(booking, outcome);
}

// Something chosen in the wizard changed meanwhile (a session closed, a product left the shelf): the visitor hears
// what to look at, not the status words STATE_INVALID carries elsewhere.
async function submitFailure(error: unknown) {
  const failure = await mapError(error);
  return failure.error.code === 'STATE_INVALID'
    ? fail('STATE_INVALID', undefined, text.unavailableChoice)
    : failure;
}

// Steps 2 to 5 for a checked booking: the IP's attempts, Turnstile, the proof of the contact on screen, then the
// service. pay_to_confirm, resent and reverify are answers, not errors (Task P3.5.04); a duplicate's code is never
// told (BOOK-15).
async function book(booking: CheckedBooking): Promise<ActionResult<BookingSubmitAnswer>> {
  if (!(await isWithinIpLimit('booking_create:ip'))) return fail('RATE_LIMITED');
  const clientIp = clientIpFrom(await headers());
  const isHuman = await verifyTurnstile(
    booking.values.turnstileToken,
    clientIp,
    TURNSTILE_ACTIONS.bookingCreate,
  );
  const captchaFailed = copy.booking.otp.captchaFailed;
  if (!isHuman) return fail('VALIDATION', { turnstileToken: [captchaFailed] }, captchaFailed);
  const proof = await readPhoneProofCookie();
  if (!isFresh(proof) || !provesShownContact(proof, booking.shownContact)) {
    return ok({ kind: 'reverify' });
  }
  // docs/Security.md §4.1 (4): a Surat Penawaran needs the number verified, which an email code does not do, so while
  // WhatsApp codes are degraded the school pays with a hold instead. Refused before anything is booked or spent
  // (re-review of PR #33).
  if (booking.mode === 'quote' && proof.channel === 'email') {
    return fail('STATE_INVALID', undefined, text.quoteNeedsWhatsApp);
  }
  return ok(await submit(booking, proof));
}

// "Konfirmasi & Bayar": a hold.
export async function createBookingAction(
  input: unknown,
): Promise<ActionResult<BookingSubmitAnswer>> {
  const request = bookingRequestSchema.safeParse(input);
  if (!request.success) return mapError(request.error);
  try {
    const checked = await checkBooking(request.data, 'pay');
    if (!checked.ok) return checked;
    return await book(checked.booking);
  } catch (error) {
    return submitFailure(error);
  }
}

// "Minta Surat Penawaran" (Task P3.6.06; docs/PRD.md FR-B2B-01): a quoted booking and its Surat Penawaran, behind
// its own limit of three an hour per IP on top of the booking's, counted before the package is read (review of PR
// #33, finding 5).
export async function requestQuotationAction(
  input: unknown,
): Promise<ActionResult<BookingSubmitAnswer>> {
  const request = bookingRequestSchema.safeParse(input);
  if (!request.success) return mapError(request.error);
  try {
    if (!(await isWithinIpLimit('quotation:create'))) return fail('RATE_LIMITED');
    const checked = await checkBooking(request.data, 'quote');
    if (!checked.ok) return checked;
    return await book(checked.booking);
  } catch (error) {
    return submitFailure(error);
  }
}
