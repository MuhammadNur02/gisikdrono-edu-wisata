import 'server-only';

import { z } from 'zod';

import { DB_ENUMS } from '@/db/enums';
import type { Database } from '@/db/types';
import type {
  BookingAmounts,
  BookingDetail,
  BookingInvoiceSummary,
  BookingLegSummary,
  BookingListRow,
  BookingPaymentSummary,
  BookingTicketSummary,
} from '@/types/booking-admin';

// The rows of v_bookings_staff and v_booking_admin as /dashboard/bookings shows them (Task P4.3.02). A view types
// every column nullable, so each row is parsed here: one that lacks what a booking always has is dropped instead of
// shown half empty, and the JSON columns are read through their own shapes (0005_policies_grants.sql).

type StaffRow = Database['public']['Views']['v_bookings_staff']['Row'];
type AdminRow = Database['public']['Views']['v_booking_admin']['Row'];

// The columns the list reads (LIST_COLUMNS in booking-admin-service.ts).
export type BookingListColumns = Pick<
  StaffRow,
  | 'id'
  | 'booking_code'
  | 'status'
  | 'institution_name'
  | 'pic_first_name'
  | 'booker_type'
  | 'package_name'
  | 'rw_ids'
  | 'pax_count'
  | 'visit_date'
  | 'visit_date_end'
  | 'payment_status'
  | 'needs_review'
  | 'shows_amounts'
  | 'total_amount'
  | 'amount_paid'
  | 'created_at'
>;

const legSchema = z.object({
  rw_id: z.int(),
  session_date: z.string(),
  start_time: z.string(),
  label: z.string().nullable(),
  pax: z.int(),
  status: z.enum(DB_ENUMS.booking_leg_status),
});

const paymentSchema = z.object({
  attempt_no: z.int(),
  method: z.enum(DB_ENUMS.payment_method).nullable(),
  status: z.enum(DB_ENUMS.payment_status),
  order_id: z.string(),
  settlement_time: z.string().nullable(),
});

const ticketSchema = z.object({
  ticket_code: z.string(),
  rw_id: z.int(),
  status: z.enum(DB_ENUMS.ticket_status),
  valid_on: z.string(),
  pax: z.int(),
  checked_in_pax: z.int().nullable(),
  unpaid_pax: z.int().nullable(),
  checked_in_at: z.string().nullable(),
});

const invoiceSchema = z.object({
  invoice_number: z.string(),
  status: z.enum(DB_ENUMS.invoice_status),
  receipt_number: z.string().nullable(),
  credit_note_number: z.string().nullable(),
  issued_at: z.string(),
});

function listOf<T>(schema: z.ZodType<T>, value: unknown): T[] {
  return z.array(schema).nullable().parse(value) ?? [];
}

// STAFF-02: the booking's own amounts, only where the view shows them.
function amountsOf(row: BookingListColumns): BookingAmounts | null {
  if (!row.shows_amounts || row.total_amount === null) return null;
  return { total: row.total_amount, paid: row.amount_paid ?? 0 };
}

export function toBookingListRow(row: BookingListColumns): BookingListRow | null {
  const { id, booking_code: code, status, visit_date: visitDate, created_at: createdAt } = row;
  if (id === null || code === null || status === null || visitDate === null || createdAt === null) {
    return null;
  }
  return {
    id,
    bookingCode: code,
    status,
    institutionName: row.institution_name,
    picFirstName: row.pic_first_name,
    bookerType: row.booker_type,
    packageName: row.package_name,
    rwIds: row.rw_ids ?? [],
    paxCount: row.pax_count ?? 0,
    visitDate,
    visitDateEnd: row.visit_date_end ?? visitDate,
    paymentStatus: row.payment_status,
    needsReview: row.needs_review ?? false,
    amounts: amountsOf(row),
    createdAt,
  };
}

function legsOf(value: unknown): BookingLegSummary[] {
  return listOf(legSchema, value).map((leg) => ({
    rwId: leg.rw_id,
    sessionDate: leg.session_date,
    startTime: leg.start_time,
    label: leg.label,
    pax: leg.pax,
    status: leg.status,
  }));
}

function paymentsOf(value: unknown): BookingPaymentSummary[] {
  return listOf(paymentSchema, value).map((payment) => ({
    attemptNo: payment.attempt_no,
    method: payment.method,
    status: payment.status,
    orderId: payment.order_id,
    settlementTime: payment.settlement_time,
  }));
}

function ticketsOf(value: unknown): BookingTicketSummary[] {
  return listOf(ticketSchema, value).map((ticket) => ({
    ticketCode: ticket.ticket_code,
    rwId: ticket.rw_id,
    status: ticket.status,
    validOn: ticket.valid_on,
    pax: ticket.pax,
    checkedInPax: ticket.checked_in_pax,
    unpaidPax: ticket.unpaid_pax,
    checkedInAt: ticket.checked_in_at,
  }));
}

function invoicesOf(value: unknown): BookingInvoiceSummary[] {
  return listOf(invoiceSchema, value).map((invoice) => ({
    invoiceNumber: invoice.invoice_number,
    status: invoice.status,
    receiptNumber: invoice.receipt_number,
    creditNoteNumber: invoice.credit_note_number,
    issuedAt: invoice.issued_at,
  }));
}

export function toBookingDetail(row: AdminRow): BookingDetail | null {
  const base = toBookingListRow(row);
  if (base === null) return null;
  return {
    ...base,
    phoneMasked: row.phone_masked,
    emailMasked: row.email_masked,
    isPhoneVerified: row.is_phone_verified ?? false,
    isEmailVerified: row.is_email_verified ?? false,
    isAnonymised: row.is_anonymised ?? false,
    channel: row.channel,
    notes: row.notes,
    adminNotes: row.admin_notes,
    reviewReason: row.review_reason,
    cancelReason: row.cancel_reason,
    expiresAt: row.expires_at,
    legs: legsOf(row.legs),
    payments: paymentsOf(row.payments),
    tickets: ticketsOf(row.tickets),
    invoices: invoicesOf(row.invoices),
  };
}
