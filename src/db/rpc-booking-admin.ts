import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';

// The booking detail's staff RPCs (Task P4.3.02; 20261103130100_revoke_ticket.sql, 20261103130200_addon_notes_rpc.sql),
// called on the staff member's own session client so their AAL2, scope and window checks see who asks.

export function revokeTicket(
  client: DatabaseClient,
  revoke: { ticketId: string; reason: string },
): Promise<void> {
  return resultOf(
    client.rpc('revoke_ticket', { p_ticket_id: revoke.ticketId, p_reason: revoke.reason }),
  );
}

// The notes of the caller's own RW's add-on lines, by line id; each call is an audited read.
export async function rpcGetAddonNotes(
  client: DatabaseClient,
  bookingId: string,
): Promise<Map<string, string>> {
  const rows = await resultOf(client.rpc('rpc_get_addon_notes', { p_booking_id: bookingId }));
  return new Map(rows.map((row) => [row.addon_id, row.notes]));
}

// Task P4.3.10: an officer's booking at the counter (20261104200100_admin_bookings.sql). The actor is the session's
// own auth.uid(); the reply is internal.create_booking's.
export interface AdminBookingToCreate {
  packageId: string;
  sessionIds: string[];
  pax: number;
  booker: {
    bookerType: string;
    institutionName: string | null;
    picName: string;
    picPhone: string;
    picEmail: string;
    notes: string | null;
    isPhoneConfirmed: boolean;
    isCashOnTheSpot: boolean;
  };
  idempotencyKey: string;
  consentVersion: string;
  quoteHash: string;
}

const adminBookingReplySchema = z.object({
  result: z.enum(['created', 'existing']),
  booking_id: z.uuid(),
  booking_code: z.string(),
  status: z.string(),
  expires_at: z.string().nullable(),
  visit_date: z.iso.date(),
  visit_date_end: z.iso.date(),
  total_amount: z.int().positive(),
});

export interface AdminBookingReply {
  isNew: boolean;
  bookingId: string;
  bookingCode: string;
  expiresAt: string | null;
  visitDate: string;
  visitDateEnd: string;
  totalAmount: number;
}

export async function createAdminBooking(
  client: DatabaseClient,
  booking: AdminBookingToCreate,
): Promise<AdminBookingReply> {
  const { booker } = booking;
  const reply = adminBookingReplySchema.parse(
    await resultOf(
      client.rpc('create_admin_booking', {
        p_package_id: booking.packageId,
        p_session_ids: booking.sessionIds,
        p_pax: booking.pax,
        p_booker: {
          booker_type: booker.bookerType,
          institution_name: booker.institutionName,
          pic_name: booker.picName,
          pic_phone: booker.picPhone,
          pic_email: booker.picEmail,
          notes: booker.notes,
          admin: {
            phone_confirmed: booker.isPhoneConfirmed,
            cash_on_the_spot: booker.isCashOnTheSpot,
          },
        },
        p_idempotency_key: booking.idempotencyKey,
        p_consent_version: booking.consentVersion,
        p_quote_hash: booking.quoteHash,
      }),
    ),
  );
  return {
    isNew: reply.result === 'created',
    bookingId: reply.booking_id,
    bookingCode: reply.booking_code,
    expiresAt: reply.expires_at,
    visitDate: reply.visit_date,
    visitDateEnd: reply.visit_date_end,
    totalAmount: reply.total_amount,
  };
}

const cashReplySchema = z.object({ result: z.string(), order_id: z.string() });

// Cash for an officer's booking (A9): the whole total, once; the server's QR key id signs the tickets it issues.
export async function markBookingPaidInCash(
  client: DatabaseClient,
  cash: { bookingId: string; amount: number; reference: string | null; keyId: string },
): Promise<{ isApplied: boolean; orderId: string }> {
  const reply = cashReplySchema.parse(
    await resultOf(
      client.rpc('mark_booking_paid_manually', {
        p_booking_id: cash.bookingId,
        p_method: 'cash',
        p_amount: cash.amount,
        p_key_id: cash.keyId,
        ...(cash.reference === null ? {} : { p_reference: cash.reference }),
      }),
    ),
  );
  return { isApplied: reply.result === 'applied', orderId: reply.order_id };
}

// The PIC's pay link, when the officer leaves the cash step without taking the cash (review of PR #91, M2).
export function sendAdminBookingLink(client: DatabaseClient, bookingId: string): Promise<void> {
  return resultOf(client.rpc('send_admin_booking_link', { p_booking_id: bookingId }));
}
