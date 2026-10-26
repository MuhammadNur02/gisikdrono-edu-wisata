import type { EnumValue } from '@/db/enums';
import type { PaymentPageView } from '@/types/payment';

// The status hub /reservasi/[bookingCode] (docs/PRD.md FR-BOOK-11, Task P3.12.01). Props for components, so dates
// travel as ISO strings and visit dates as 'YYYY-MM-DD'. The PIC appears masked; no contact, no participant name.

export type BookingStatus = EnumValue<'booking_status'>;

export interface HubEvent {
  toStatus: BookingStatus;
  reason: string | null;
  occurredAt: string;
}

export interface HubDocument {
  id: string;
  number: string;
}

export interface StatusHubView {
  // The booking as it is paid for: code, status, package, pax, total, the hold's deadline, the sessions and the last
  // payment attempt, the same read /bayar makes.
  booking: PaymentPageView;
  bookerType: EnumValue<'booker_type'>;
  institutionName: string | null;
  // "Sri W.": the first name and the initial of the last; null once the retention run has cleared the name.
  picShortName: string | null;
  addons: { name: string; qty: number }[];
  createdAt: string;
  paidAt: string | null;
  // The first leg's visit date, which the H-n of the visit terms count to (docs/PRD.md §13.1 A16).
  visitDate: string;
  events: HubEvent[];
  quotation: (HubDocument & { validUntil: string; status: EnumValue<'quotation_status'> }) | null;
  // The invoice and, once paid, its receipt, which share one row.
  invoice:
    (HubDocument & { receiptNumber: string | null; status: EnumValue<'invoice_status'> }) | null;
  ticketCount: number;
  // The latest refund a cancellation requested, and how far it got (docs/PRD.md §13.1 A16).
  refund: {
    amount: number;
    status: EnumValue<'refund_request_status'>;
    method: EnumValue<'payment_method'>;
  } | null;
  // The visit terms in force, from site_settings, for the hub to show (go-live check #27).
  terms: {
    refundSchedule: { minDays: number; pct: number }[];
    weatherMax: number;
    weatherHours: number;
  };
}

// A session a leg may move to after a weather notice (docs/PRD.md §13.1 A17).
export interface WeatherOption {
  sessionId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  label: string | null;
  remaining: number;
}

// One leg a weather notice stopped (decision of 2026-10-25 on the weather): when its window closes, the moves left and
// where it may go. A combo's other leg keeps its day.
export interface WeatherLeg {
  rwName: string;
  openUntil: string;
  movesLeft: number;
  options: WeatherOption[];
}

export interface WeatherState {
  // When the first open window closes; the weather refund is there until then.
  openUntil: string;
  reason: string | null;
  legs: WeatherLeg[];
}
