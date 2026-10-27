'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import { BOOKINGS_DASHBOARD_PATH, bookingDetailPath } from '@/config/bookings';
import type { RefundQuote } from '@/db/rpc-terms';
import { fail, mapError, ok } from '@/lib/errors';
import { bookingTargetSchema } from '@/lib/validations/booking-admin';
import {
  cancelBookingSchema,
  cancelPreviewSchema,
  extendHoldSchema,
  resendMessageSchema,
  resolveReviewSchema,
} from '@/lib/validations/booking-staff';
import { requireRole, requireRwAccess, type GuardResult } from '@/server/auth/guards';
import { getBookingDetail } from '@/server/services/booking-admin-service';
import {
  cancelBookingByStaff,
  extendHold,
  previewStaffCancellation,
  reactivate,
  resendMessage,
  resolveReview,
} from '@/server/services/booking-staff-service';
import { kickNotificationWorker } from '@/server/services/notification-service';
import type { ActionResult } from '@/types/action-result';

// The staff steps of /dashboard/bookings/[id] (Task P4.3.08; docs/PRD.md FR-ADMIN-05, §13.1 A28), in the order of
// CLAUDE.md §5.2. Staff at AAL2 whose RLS shows the booking, each of its RWs theirs (requireRwAccess); a paid
// booking's cancellation and a review are the superadmin's. Every RPC checks the same again, with the fresh TOTP where
// it asks for one.

async function requireBookingStaff(bookingId: string, role?: 'superadmin'): Promise<GuardResult> {
  const guard = role ? await requireRole(role) : await requireRole('superadmin', 'admin_rw');
  if (!guard.ok) return guard;
  if (!guard.ctx.isAal2) return fail('FORBIDDEN');
  const booking = await getBookingDetail(bookingId);
  if (!booking) return fail('NOT_FOUND');
  for (const rwId of booking.rwIds) {
    const access = await requireRwAccess(rwId);
    if (!access.ok) return access;
  }
  return guard;
}

function refreshBooking(bookingId: string): void {
  revalidatePath(bookingDetailPath(bookingId));
  revalidatePath(BOOKINGS_DASHBOARD_PATH);
}

export async function previewCancellationAction(
  input: unknown,
): Promise<ActionResult<RefundQuote>> {
  const parsed = cancelPreviewSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireBookingStaff(parsed.data.bookingId);
  if (!guard.ok) return guard;

  try {
    return ok(await previewStaffCancellation(parsed.data.bookingId, parsed.data.reasonCategory));
  } catch (error) {
    return mapError(error);
  }
}

export async function cancelBookingAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = cancelBookingSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireBookingStaff(parsed.data.bookingId);
  if (!guard.ok) return guard;

  try {
    await cancelBookingByStaff(parsed.data);
    after(kickNotificationWorker);
    refreshBooking(parsed.data.bookingId);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}

export async function extendBookingHoldAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = extendHoldSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireBookingStaff(parsed.data.bookingId);
  if (!guard.ok) return guard;

  try {
    await extendHold(parsed.data);
    refreshBooking(parsed.data.bookingId);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}

export async function reactivateBookingAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = bookingTargetSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireBookingStaff(parsed.data.bookingId);
  if (!guard.ok) return guard;

  try {
    await reactivate(parsed.data.bookingId);
    after(kickNotificationWorker);
    refreshBooking(parsed.data.bookingId);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}

export async function resendMessageAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = resendMessageSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireBookingStaff(parsed.data.bookingId);
  if (!guard.ok) return guard;

  try {
    await resendMessage(parsed.data);
    after(kickNotificationWorker);
    revalidatePath(bookingDetailPath(parsed.data.bookingId));
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}

// A28: the superadmin's, with a fresh code that resolve_booking_review checks itself.
export async function resolveBookingReviewAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = resolveReviewSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireBookingStaff(parsed.data.bookingId, 'superadmin');
  if (!guard.ok) return guard;

  try {
    await resolveReview(parsed.data);
    after(kickNotificationWorker);
    refreshBooking(parsed.data.bookingId);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
