'use server';

import { revalidatePath } from 'next/cache';

import { bookingDetailPath } from '@/config/bookings';
import { fail, mapError, ok } from '@/lib/errors';
import {
  addonFulfillmentSchema,
  adminNotesSchema,
  bookingTargetSchema,
  revealContactSchema,
  revokeTicketSchema,
} from '@/lib/validations/booking-admin';
import { requireRole } from '@/server/auth/guards';
import {
  getBookingParticipants,
  revealBookingContact,
  revokeBookingTicket,
  saveAdminNotes,
  setAddonFulfillment,
} from '@/server/services/booking-admin-service';
import type { ActionResult } from '@/types/action-result';
import type { ParticipantEntry, RevealedContact } from '@/types/booking-admin';

// /dashboard/bookings/[id] (Task P4.3.02, docs/PRD.md FR-ADMIN-05; docs/StyleGuide.md §6.10). Either staff role at
// AAL2; RLS and the personal-data functions decide the booking's scope and window again in the database. The contact
// and the participants are returned to the page that asked and kept nowhere else.

export async function revealBookingContactAction(
  input: unknown,
): Promise<ActionResult<RevealedContact>> {
  const parsed = revealContactSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireRole('superadmin', 'admin_rw');
  if (!guard.ok) return guard;
  if (!guard.ctx.isAal2) return fail('FORBIDDEN');

  try {
    return ok(await revealBookingContact(parsed.data));
  } catch (error) {
    return mapError(error);
  }
}

export async function loadBookingParticipantsAction(
  input: unknown,
): Promise<ActionResult<ParticipantEntry[]>> {
  const parsed = bookingTargetSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireRole('superadmin', 'admin_rw');
  if (!guard.ok) return guard;
  if (!guard.ctx.isAal2) return fail('FORBIDDEN');

  try {
    return ok(await getBookingParticipants(parsed.data.bookingId));
  } catch (error) {
    return mapError(error);
  }
}

export async function saveAdminNotesAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = adminNotesSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireRole('superadmin', 'admin_rw');
  if (!guard.ok) return guard;
  if (!guard.ctx.isAal2) return fail('FORBIDDEN');

  try {
    await saveAdminNotes(parsed.data);
    revalidatePath(bookingDetailPath(parsed.data.bookingId));
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}

export async function setAddonFulfillmentAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = addonFulfillmentSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireRole('superadmin', 'admin_rw');
  if (!guard.ok) return guard;
  if (!guard.ctx.isAal2) return fail('FORBIDDEN');

  try {
    await setAddonFulfillment(parsed.data);
    revalidatePath(bookingDetailPath(parsed.data.bookingId));
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}

// FR-ADMIN-26: the superadmin revokes one ticket with a reason. revoke_ticket checks the role, AAL2 and the ticket's
// state again; the booking keeps its status, and booking_cancelled goes out once every ticket is revoked.
export async function revokeTicketAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = revokeTicketSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireRole('superadmin');
  if (!guard.ok) return guard;
  if (!guard.ctx.isAal2) return fail('FORBIDDEN');

  try {
    await revokeBookingTicket(parsed.data);
    revalidatePath(bookingDetailPath(parsed.data.bookingId));
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
