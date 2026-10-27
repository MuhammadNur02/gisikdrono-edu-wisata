import 'server-only';

import { addDays } from 'date-fns';

import { PRIVACY_NOTICE_VERSION } from '@/config/site';
import {
  createAdminBooking,
  markBookingPaidInCash,
  sendAdminBookingLink,
  type AdminBookingReply,
} from '@/db/rpc-booking-admin';
import { serverEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { listPackages } from '@/lib/queries/packages';
import { listAvailableSessions } from '@/lib/queries/sessions';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sessionStartsAt, toVisitDate } from '@/lib/utils/dates';
import type { CreateAdminBookingValues } from '@/lib/validations/booking';
import type { RecordCashValues } from '@/lib/validations/walk-in';
import type { StaffContext } from '@/server/auth/guards';
import {
  loadBookingWizard,
  quoteWizardBooking,
  type BookingWizard,
  type QuotePreview,
} from '@/server/services/booking-wizard-service';
import { endOpenOrderBeforeCash } from '@/server/services/payment-service';
import type { AvailableSession, BookableLeg } from '@/types/session';
import type { WalkInPackage } from '@/types/walk-in';

// The officer's booking at the counter (Task P4.3.10). The catalogue and the seats are public data, read as the web's
// wizard reads them; the booking and the cash go through the officer's own session client, whose RPCs check AAL2, the
// RW and, for the cash, the fresh code again.

// An RW admin books their own RW's packages, never a combo with another RW; the superadmin any package.
function mayBook(ctx: StaffContext, rwIds: readonly number[]): boolean {
  if (ctx.role === 'superadmin') return true;
  return ctx.role === 'admin_rw' && rwIds.length > 0 && rwIds.every((rwId) => rwId === ctx.rwId);
}

export async function listWalkInPackages(ctx: StaffContext): Promise<WalkInPackage[]> {
  const packages = await listPackages();
  return packages
    .filter((tourPackage) =>
      mayBook(
        ctx,
        tourPackage.rws.map((rw) => rw.id),
      ),
    )
    .map((tourPackage) => ({
      id: tourPackage.id,
      name: tourPackage.name,
      rws: tourPackage.rws,
      minPax: tourPackage.minPax,
      maxPax: tourPackage.maxPax,
    }));
}

// The package by id, as the wizard reads it, when this officer may book it; null otherwise.
export async function loadWalkInPackage(
  ctx: StaffContext,
  packageId: string,
): Promise<BookingWizard | null> {
  const summary = (await listPackages()).find((tourPackage) => tourPackage.id === packageId);
  if (
    !summary ||
    !mayBook(
      ctx,
      summary.rws.map((rw) => rw.id),
    )
  )
    return null;
  return loadBookingWizard(summary.slug);
}

// The owner's decision of 2026-10-26 (docs/PRD.md §13.1 A22): a session of today until it ends, up to
// booking.max_advance_days ahead, as internal.booking_sessions books them for the admin channel.
export async function listWalkInSessions(
  wizard: BookingWizard,
  now: Date = new Date(),
): Promise<BookableLeg[]> {
  const from = toVisitDate(now);
  const to = toVisitDate(addDays(now, wizard.rules.maxAdvanceDays));
  const { validFrom, validTo } = wizard.package;
  const isSold = (session: AvailableSession) =>
    (validFrom === null || session.sessionDate >= validFrom) &&
    (validTo === null || session.sessionDate <= validTo);
  const isRunning = (session: AvailableSession) =>
    sessionStartsAt(session.sessionDate, session.endTime) > now;
  return Promise.all(
    wizard.package.rws.map(async (rw) => ({
      rw,
      sessions: (await listAvailableSessions({ rwId: rw.id, from, to })).filter(
        (session) => isSold(session) && isRunning(session),
      ),
    })),
  );
}

export function quoteWalkIn(wizard: BookingWizard, pax: number): QuotePreview {
  return quoteWizardBooking(wizard, { pax, addons: [] });
}

export async function createWalkInBooking(
  values: CreateAdminBookingValues,
): Promise<AdminBookingReply> {
  const supabase = await createSupabaseServerClient();
  return createAdminBooking(supabase, {
    packageId: values.packageId,
    sessionIds: values.visitSessionIds,
    pax: values.pax,
    booker: {
      bookerType: values.bookerType,
      institutionName: values.institutionName,
      picName: values.picName,
      picPhone: values.picPhone,
      picEmail: values.picEmail,
      notes: values.notes,
      isPhoneConfirmed: values.isPhoneConfirmed,
      isCashOnTheSpot: values.isCashOnTheSpot,
    },
    idempotencyKey: values.idempotencyKey,
    consentVersion: PRIVACY_NOTICE_VERSION,
    quoteHash: values.quoteHash,
  });
}

// The action found the booking able to take cash; the PIC's open Midtrans order is ended first, with the officer as
// its actor (payment-service.ts), and the RPC still refuses while any payment is open. After the session started the
// same call checks the group in (A23 addendum).
export async function recordWalkInCash(ctx: StaffContext, values: RecordCashValues): Promise<void> {
  await endOpenOrderBeforeCash(values.bookingId, ctx.userId, serverEnv.QR_SIGNING_ACTIVE_KID);
  const supabase = await createSupabaseServerClient();
  const answer = await markBookingPaidInCash(supabase, {
    bookingId: values.bookingId,
    amount: values.amount,
    reference: values.reference === '' ? null : values.reference,
    keyId: serverEnv.QR_SIGNING_ACTIVE_KID,
    attendeeCount: values.attendeeCount,
  });
  // A settlement the ledger or the seats refused waits for the superadmin under review, as a Midtrans one does.
  if (!answer.isApplied) throw new AppError('STATE_INVALID');
}

// The officer leaves the cash step: the PIC gets the pay link (review of PR #91, M2).
export async function sendWalkInPayLink(bookingId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await sendAdminBookingLink(supabase, bookingId);
}
