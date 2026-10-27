'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import { BOOKINGS_DASHBOARD_PATH, bookingDetailPath } from '@/config/bookings';
import { STAFF_STEP_UP_MAX_AGE_SECONDS } from '@/config/staff';
import { staffCopy } from '@/lib/copy/staff';
import { walkInCopy } from '@/lib/copy/walk-in';
import { fail, mapError, ok, raisedHintOf } from '@/lib/errors';
import { isCashReceivable } from '@/lib/utils/walk-in-cash';
import { bookingTargetSchema } from '@/lib/validations/booking-admin';
import { recordCashSchema } from '@/lib/validations/walk-in';
import {
  requireFreshTotp,
  requireRole,
  requireRwAccess,
  type GuardResult,
} from '@/server/auth/guards';
import { getBookingDetail } from '@/server/services/booking-admin-service';
import { kickNotificationWorker } from '@/server/services/notification-service';
import { recordWalkInCash, sendWalkInPayLink } from '@/server/services/walk-in-service';
import type { ActionResult } from '@/types/action-result';
import type { BookingDetail } from '@/types/booking-admin';

// The cash at the counter and the pay link of an officer's booking (Task P4.3.10; docs/PRD.md §13.1 A9, A23), in the
// order of CLAUDE.md §5.2. The booking is read under the officer's own RLS first and each of its RWs checked with
// requireRwAccess (review of PR #91, L9); for the cash it must also be able to take cash now before Midtrans is called
// (delta review, L-1). mark_booking_paid_manually and send_admin_booking_link check all of it again.

type BookingAccess = { ok: true; booking: BookingDetail } | ReturnType<typeof fail>;

// The booking as the officer's RLS shows it, and each of its RWs the officer's.
async function requireBookingAccess(bookingId: string): Promise<BookingAccess> {
  const booking = await getBookingDetail(bookingId);
  if (!booking || booking.rwIds.length === 0) return fail('NOT_FOUND');
  for (const rwId of booking.rwIds) {
    const access = await requireRwAccess(rwId);
    if (!access.ok) return access;
  }
  return { ok: true, booking };
}

// A9: an RW admin at AAL2, for a booking of their own one RW that takes cash now, with a code from the last five
// minutes. A booking under review, paid, lapsed or past 23:59 WIB of its visit day stops here, before Midtrans.
async function requireCashTaker(bookingId: string): Promise<GuardResult> {
  const role = await requireRole('admin_rw');
  if (!role.ok) return role;
  if (!role.ctx.isAal2) return fail('FORBIDDEN');
  const access = await requireBookingAccess(bookingId);
  if (!access.ok) return access;
  if (access.booking.rwIds.length !== 1) return fail('FORBIDDEN');
  if (!isCashReceivable(access.booking, true, new Date())) {
    return fail('STATE_INVALID', undefined, walkInCopy.errors.cashRefused);
  }
  const fresh = await requireFreshTotp(STAFF_STEP_UP_MAX_AGE_SECONDS);
  return fresh.ok ? fresh : fail('FORBIDDEN', undefined, staffCopy.notFresh);
}

const CASH_HINT_MESSAGES: Readonly<Record<string, string>> = {
  ATTENDANCE_REQUIRED: walkInCopy.errors.attendanceRequired,
  QR_KEY_UNKNOWN: walkInCopy.errors.qrKeyUnknown,
};

async function cashFailure(error: unknown) {
  const hintMessage = CASH_HINT_MESSAGES[raisedHintOf(error) ?? ''];
  if (hintMessage !== undefined) return fail('STATE_INVALID', undefined, hintMessage);
  const failure = await mapError(error);
  return failure.error.code === 'STATE_INVALID'
    ? fail('STATE_INVALID', undefined, walkInCopy.errors.cashRefused)
    : failure;
}

export async function recordWalkInCashAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = recordCashSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);

  const guard = await requireCashTaker(parsed.data.bookingId);
  if (!guard.ok) return guard;

  try {
    await recordWalkInCash(guard.ctx, parsed.data);
    after(kickNotificationWorker);
    revalidatePath(bookingDetailPath(parsed.data.bookingId));
    revalidatePath(BOOKINGS_DASHBOARD_PATH);
    return ok(null);
  } catch (error) {
    return cashFailure(error);
  }
}

// Review of PR #91, M2: the officer leaves the cash step without taking the cash, so the PIC gets the pay link.
export async function sendWalkInPayLinkAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = bookingTargetSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);

  const role = await requireRole('superadmin', 'admin_rw');
  if (!role.ok) return role;
  if (!role.ctx.isAal2) return fail('FORBIDDEN');
  const access = await requireBookingAccess(parsed.data.bookingId);
  if (!access.ok) return access;

  try {
    await sendWalkInPayLink(parsed.data.bookingId);
    after(kickNotificationWorker);
    revalidatePath(bookingDetailPath(parsed.data.bookingId));
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
