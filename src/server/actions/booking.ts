'use server';

import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { after } from 'next/server';

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
} from '@/lib/validations/booking';
import {
  readPhoneProofCookie,
  forgetPhoneProof,
  rememberGuestLink,
} from '@/server/auth/guest-cookies';
import {
  createHold,
  createQuotedBooking,
  withinGuestLimits,
  type BookingOutcome,
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
  if (!wizard.isOpen) return fail('STATE_INVALID', undefined, text.closed);
  return { ok: true, wizard };
}

async function isWithinIpLimit(name: 'session_availability:ip' | 'quote_preview:ip') {
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
}

const isInstitution = (bookerType: EnumValue<'booker_type'>) =>
  (INSTITUTION_BOOKER_TYPES as readonly string[]).includes(bookerType);

// Step 1: the request, then the booking against its package's own booking.max_pax. "Minta Surat Penawaran" is for
// institutions only (docs/PRD.md FR-BOOK-05; decision of 2026-10-22, Q5).
async function checkBooking(
  input: unknown,
): Promise<{ ok: true; booking: CheckedBooking } | ReturnType<typeof fail>> {
  const request = bookingRequestSchema.safeParse(input);
  if (!request.success) return mapError(request.error);
  const read = await openWizard(request.data.packageSlug);
  if (!read.ok) return read;
  const parsed = createBookingSchema(read.wizard.rules.maxPax).safeParse(request.data.booking);
  if (!parsed.success) return mapError(parsed.error);
  if (parsed.data.packageId !== read.wizard.package.id) return fail('VALIDATION');
  if (request.data.mode === 'quote' && !isInstitution(parsed.data.bookerType)) {
    return fail('VALIDATION', undefined, text.quoteForInstitutions);
  }
  return {
    ok: true,
    booking: { mode: request.data.mode, wizard: read.wizard, values: parsed.data },
  };
}

// internal.create_booking takes a code at most ten minutes old; past eight the wizard asks for a new one, so the
// database never refuses a booking the visitor has filled in for a stale code (decision on P3.5, Q2).
function isFresh(proof: PhoneProof | null): proof is PhoneProof {
  if (proof === null) return false;
  const verifiedAt = proof.expiresAt - PHONE_PROOF_TTL_SECONDS;
  return Date.now() / MS_PER_SECOND - verifiedAt <= PHONE_PROOF_FRESH_SECONDS;
}

function nextUrlOf(outcome: Extract<BookingOutcome, { kind: 'created' }>): string {
  const bookingPage = `${GUEST_BOOKING_PATH}/${outcome.bookingCode}`;
  return outcome.status === 'pending_payment' ? `${bookingPage}/bayar` : bookingPage;
}

// Steps 4 and 5 for a new booking: its month's sessions, the manage link in this browser, and the spent code
// forgotten. The visitor's own browser goes on to the pay page or the booking's status page (decision on P3.5, Q1).
async function settleCreated(
  booking: CheckedBooking,
  outcome: Extract<BookingOutcome, { kind: 'created' }>,
): Promise<BookingSubmitAnswer> {
  const month = booking.values.visitDate.slice(0, 'YYYY-MM'.length);
  for (const rw of booking.wizard.package.rws) revalidateTag(TAGS.sessions(rw.id, month));
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

// "Konfirmasi & Bayar" (mode pay) and "Minta Surat Penawaran" (mode quote). pay_to_confirm and resent are answers,
// not errors (Task P3.5.04); a duplicate's code is never told (BOOK-15).
export async function createBookingAction(
  input: unknown,
): Promise<ActionResult<BookingSubmitAnswer>> {
  try {
    const checked = await checkBooking(input);
    if (!checked.ok) return checked;
    const clientIp = clientIpFrom(await headers());
    const isHuman = await verifyTurnstile(
      checked.booking.values.turnstileToken,
      clientIp,
      TURNSTILE_ACTIONS.bookingCreate,
    );
    const captchaFailed = copy.booking.otp.captchaFailed;
    if (!isHuman) return fail('VALIDATION', { turnstileToken: [captchaFailed] }, captchaFailed);
    const proof = await readPhoneProofCookie();
    if (!isFresh(proof)) return ok({ kind: 'reverify' });
    return ok(await submit(checked.booking, proof));
  } catch (error) {
    return submitFailure(error);
  }
}
