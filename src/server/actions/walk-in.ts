'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

import { BOOKINGS_DASHBOARD_PATH, bookingDetailPath } from '@/config/bookings';
import { STAFF_STEP_UP_MAX_AGE_SECONDS } from '@/config/staff';
import { staffCopy } from '@/lib/copy/staff';
import { walkInCopy } from '@/lib/copy/walk-in';
import { fail, mapError, ok } from '@/lib/errors';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import { TAGS } from '@/lib/queries/tags';
import { createAdminBookingSchema } from '@/lib/validations/booking';
import {
  recordCashSchema,
  walkInPackageSchema,
  walkInQuoteSchema,
} from '@/lib/validations/walk-in';
import {
  requireFreshTotp,
  requireRole,
  requireRwAccess,
  type GuardResult,
} from '@/server/auth/guards';
import type { BookingWizard } from '@/server/services/booking-wizard-service';
import {
  createWalkInBooking,
  listWalkInSessions,
  loadWalkInPackage,
  quoteWalkIn,
  recordWalkInCash,
} from '@/server/services/walk-in-service';
import type { ActionResult } from '@/types/action-result';
import type { QuotePreviewAnswer } from '@/types/booking';
import type { BookableLeg } from '@/types/session';
import type { WalkInBooking } from '@/types/walk-in';

// The officer's booking at the counter (Task P4.3.10; docs/PRD.md §13.1 A9, A13), in the order of CLAUDE.md §5.2. Every
// step is an officer's at AAL2; the package's RWs are the officer's own (requireRwAccess), as create_admin_booking and
// mark_booking_paid_manually check again. The cash also needs an authenticator code from the last five minutes.

async function requireOfficer(): Promise<GuardResult> {
  const guard = await requireRole('superadmin', 'admin_rw');
  if (!guard.ok) return guard;
  return guard.ctx.isAal2 ? guard : fail('FORBIDDEN');
}

type PackageRead =
  { ok: true; wizard: BookingWizard; canTakeCash: boolean } | ReturnType<typeof fail>;

// The package when the officer may book it, each of its RWs checked by requireRwAccess.
async function openPackage(packageId: string): Promise<PackageRead> {
  const guard = await requireOfficer();
  if (!guard.ok) return guard;
  const wizard = await loadWalkInPackage(guard.ctx, packageId);
  if (!wizard) return fail('NOT_FOUND');
  for (const rw of wizard.package.rws) {
    const access = await requireRwAccess(rw.id);
    if (!access.ok) return access;
  }
  return { ok: true, wizard, canTakeCash: guard.ctx.role === 'admin_rw' };
}

export async function listWalkInSessionsAction(
  input: unknown,
): Promise<ActionResult<BookableLeg[]>> {
  const parsed = walkInPackageSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  try {
    const read = await openPackage(parsed.data.packageId);
    if (!read.ok) return read;
    return ok(await listWalkInSessions(read.wizard));
  } catch (error) {
    return mapError(error);
  }
}

// The price of the group, computed here from the catalogue (PAY-03), with the fingerprint the booking sends back.
export async function previewWalkInQuoteAction(
  input: unknown,
): Promise<ActionResult<QuotePreviewAnswer>> {
  const parsed = walkInQuoteSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  try {
    const read = await openPackage(parsed.data.packageId);
    if (!read.ok) return read;
    const preview = quoteWalkIn(read.wizard, parsed.data.pax);
    if (!preview.ok) return ok({ kind: 'problem', problem: 'pax_out_of_range' });
    return ok({ kind: 'quote', quote: preview.quote, quoteHash: preview.quoteHash });
  } catch (error) {
    return mapError(error);
  }
}

const monthOf = (visitDate: string) => visitDate.slice(0, 'YYYY-MM'.length);

async function walkInFailure(error: unknown) {
  const failure = await mapError(error);
  if (failure.error.code === 'STATE_INVALID') {
    return fail('STATE_INVALID', undefined, walkInCopy.errors.stateInvalid);
  }
  if (failure.error.code === 'PRICE_MISMATCH') {
    return fail('PRICE_MISMATCH', undefined, walkInCopy.errors.priceChanged);
  }
  return failure;
}

export async function createAdminBookingAction(
  input: unknown,
): Promise<ActionResult<WalkInBooking>> {
  try {
    const settings = await getPublicSiteSettings();
    const parsed = createAdminBookingSchema(settings.maxPax).safeParse(input);
    if (!parsed.success) return await mapError(parsed.error);
    const read = await openPackage(parsed.data.packageId);
    if (!read.ok) return read;
    if (parsed.data.isCashOnTheSpot && !read.canTakeCash) return fail('FORBIDDEN');
    const quote = quoteWalkIn(read.wizard, parsed.data.pax);
    if (!quote.ok) return fail('VALIDATION', undefined, walkInCopy.quoteProblem);

    const booking = await createWalkInBooking(parsed.data);
    const months = new Set([monthOf(booking.visitDate), monthOf(booking.visitDateEnd)]);
    for (const rw of read.wizard.package.rws) {
      for (const month of months) revalidateTag(TAGS.sessions(rw.id, month));
    }
    revalidatePath(BOOKINGS_DASHBOARD_PATH);
    return ok({
      bookingId: booking.bookingId,
      bookingCode: booking.bookingCode,
      totalAmount: quote.quote.total,
      isCashOnTheSpot: parsed.data.isCashOnTheSpot,
    });
  } catch (error) {
    return walkInFailure(error);
  }
}

export async function recordWalkInCashAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = recordCashSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireFreshTotp(STAFF_STEP_UP_MAX_AGE_SECONDS);
  if (!guard.ok) return fail('FORBIDDEN', undefined, staffCopy.notFresh);

  try {
    await recordWalkInCash(parsed.data);
    revalidatePath(bookingDetailPath(parsed.data.bookingId));
    revalidatePath(BOOKINGS_DASHBOARD_PATH);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
