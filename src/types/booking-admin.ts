import type { BOOKING_EVENT_ACTORS } from '@/config/bookings';
import type { EnumValue } from '@/db/enums';

// What /dashboard/bookings shows of a booking (Task P4.3.02; docs/Security.md STAFF-02, AZ-12, DATA-04): the masked
// contact of v_bookings_staff, the amounts only where shows_amounts allows them, and no participant name.

// The booking's own amounts, or null where the view withholds them (a combo's total from an RW admin).
export interface BookingAmounts {
  total: number;
  paid: number;
}

export interface BookingListRow {
  id: string;
  bookingCode: string;
  status: EnumValue<'booking_status'>;
  institutionName: string | null;
  picFirstName: string | null;
  bookerType: EnumValue<'booker_type'> | null;
  packageName: string | null;
  rwIds: number[];
  paxCount: number;
  visitDate: string;
  visitDateEnd: string;
  paymentStatus: EnumValue<'payment_status'> | null;
  needsReview: boolean;
  amounts: BookingAmounts | null;
  createdAt: string;
}

export interface BookingLegSummary {
  rwId: number;
  sessionDate: string;
  startTime: string;
  label: string | null;
  pax: number;
  status: EnumValue<'booking_leg_status'>;
}

export interface BookingPaymentSummary {
  attemptNo: number;
  method: EnumValue<'payment_method'> | null;
  status: EnumValue<'payment_status'>;
  orderId: string;
  settlementTime: string | null;
}

export interface BookingTicketSummary {
  ticketCode: string;
  rwId: number;
  status: EnumValue<'ticket_status'>;
  validOn: string;
  pax: number;
  checkedInPax: number | null;
  unpaidPax: number | null;
  checkedInAt: string | null;
}

export interface BookingInvoiceSummary {
  invoiceNumber: string;
  status: EnumValue<'invoice_status'>;
  receiptNumber: string | null;
  creditNoteNumber: string | null;
  issuedAt: string;
}

export interface BookingDetail extends BookingListRow {
  phoneMasked: string | null;
  emailMasked: string | null;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  isAnonymised: boolean;
  channel: EnumValue<'booking_channel'> | null;
  notes: string | null;
  adminNotes: string | null;
  reviewReason: string | null;
  cancelReason: string | null;
  expiresAt: string | null;
  legs: BookingLegSummary[];
  payments: BookingPaymentSummary[];
  tickets: BookingTicketSummary[];
  invoices: BookingInvoiceSummary[];
}

// An add-on line the staff member's RLS shows them: their own RW's lines, every line for the superadmin.
export interface BookingAddonLine {
  id: string;
  rwId: number;
  productName: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  fulfillmentStatus: EnumValue<'addon_fulfillment_status'>;
}

export type BookingEventActor = (typeof BOOKING_EVENT_ACTORS)[number];

export interface BookingTimelineEvent {
  id: string;
  fromStatus: EnumValue<'booking_status'> | null;
  toStatus: EnumValue<'booking_status'> | null;
  actorType: BookingEventActor;
  reason: string | null;
  occurredAt: string;
}

// What rpc_reveal_booking_contact returns, shown for this page view only.
export interface RevealedContact {
  picName: string;
  picPhone: string | null;
  picEmail: string | null;
}

// A participant as rpc_get_participants returns them, for this page view only.
export interface ParticipantEntry {
  seqNo: number;
  fullName: string;
  groupLabel: string | null;
  roleLabel: string | null;
}
