import 'server-only';

import { z } from 'zod';

import type { DatabaseClient } from '@/db/rpc-result';
import { paymentPageOf } from '@/server/services/payment-reads';
import type { HubEvent, StatusHubView } from '@/types/booking-hub';

// The reads behind the status hub (Task P3.12.01), on the service-role client booking-service.ts hands in, keyed by
// the booking id a verified guest link gave (CLAUDE.md §6.1). Nothing here writes, and nothing here reads a contact:
// the PIC is shown by first name and initial only (docs/Security.md §7.6).

const NAME_SEPARATOR = /\s+/;

// "Sri Wahyuni" → "Sri W."; a single name stays as it is.
export function shortNameOf(fullName: string | null): string | null {
  const parts = (fullName ?? '').trim().split(NAME_SEPARATOR).filter(Boolean);
  const [first, ...rest] = parts;
  if (first === undefined) return null;
  const last = rest.at(-1);
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

async function bookingFactsOf(adminClient: DatabaseClient, bookingId: string) {
  const { data, error } = await adminClient
    .from('bookings')
    .select(
      'booker_type, institution_name, pic_name, pii_purged_at, created_at, paid_at, visit_date',
    )
    .eq('id', bookingId)
    .single();
  if (error) throw error;
  return data;
}

async function addonsOf(adminClient: DatabaseClient, bookingId: string) {
  const { data, error } = await adminClient
    .from('booking_addons')
    .select('product_name_snapshot, qty')
    .eq('booking_id', bookingId)
    .order('created_at')
    .order('id');
  if (error) throw error;
  return data.map((addon) => ({ name: addon.product_name_snapshot, qty: addon.qty }));
}

async function eventsOf(adminClient: DatabaseClient, bookingId: string): Promise<HubEvent[]> {
  const { data, error } = await adminClient
    .from('booking_events')
    .select('to_status, reason, occurred_at')
    .eq('booking_id', bookingId)
    .order('occurred_at')
    .order('id');
  if (error) throw error;
  return data.map((event) => ({
    toStatus: event.to_status,
    reason: event.reason,
    occurredAt: event.occurred_at,
  }));
}

async function quotationOf(adminClient: DatabaseClient, bookingId: string) {
  const { data, error } = await adminClient
    .from('quotations')
    .select('id, quotation_number, valid_until, status')
    .eq('booking_id', bookingId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (
    data && {
      id: data.id,
      number: data.quotation_number,
      validUntil: data.valid_until,
      status: data.status,
    }
  );
}

async function invoiceOf(adminClient: DatabaseClient, bookingId: string) {
  const { data, error } = await adminClient
    .from('invoices')
    .select('id, invoice_number, receipt_number, status')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (error) throw error;
  return (
    data && {
      id: data.id,
      number: data.invoice_number,
      receiptNumber: data.receipt_number,
      status: data.status,
    }
  );
}

async function refundOf(adminClient: DatabaseClient, bookingId: string) {
  const { data, error } = await adminClient
    .from('refund_requests')
    .select('amount, status, method')
    .eq('booking_id', bookingId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const TERMS_KEYS = [
  'booking.cancel_refund_schedule',
  'booking.weather_reschedule_max',
  'booking.weather_window_hours',
] as const;
const FULL_PERCENT = 100;
const scheduleSchema = z.array(
  z.object({ min_days: z.int(), pct: z.int().min(0).max(FULL_PERCENT) }),
);

async function termsOf(adminClient: DatabaseClient): Promise<StatusHubView['terms']> {
  const { data, error } = await adminClient
    .from('site_settings')
    .select('key, value')
    .in('key', TERMS_KEYS);
  if (error) throw error;
  const valueOf = (key: string) => data.find((row) => row.key === key)?.value;
  const schedule = scheduleSchema.safeParse(valueOf('booking.cancel_refund_schedule'));
  const numberOf = (key: string) => {
    const value = valueOf(key);
    return typeof value === 'number' ? value : 0;
  };
  return {
    refundSchedule: schedule.success
      ? schedule.data
          .map((entry) => ({ minDays: entry.min_days, pct: entry.pct }))
          .sort((a, b) => b.minDays - a.minDays)
      : [],
    weatherMax: numberOf('booking.weather_reschedule_max'),
    weatherHours: numberOf('booking.weather_window_hours'),
  };
}

async function ticketCountOf(adminClient: DatabaseClient, bookingId: string): Promise<number> {
  const { count, error } = await adminClient
    .from('tickets_qr')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', bookingId);
  if (error) throw error;
  return count ?? 0;
}

export async function statusHubOf(
  adminClient: DatabaseClient,
  bookingId: string,
): Promise<StatusHubView> {
  const [booking, facts, addons, events, quotation, invoice, ticketCount, refund, terms] =
    await Promise.all([
      paymentPageOf(adminClient, bookingId),
      bookingFactsOf(adminClient, bookingId),
      addonsOf(adminClient, bookingId),
      eventsOf(adminClient, bookingId),
      quotationOf(adminClient, bookingId),
      invoiceOf(adminClient, bookingId),
      ticketCountOf(adminClient, bookingId),
      refundOf(adminClient, bookingId),
      termsOf(adminClient),
    ]);
  return {
    booking,
    bookerType: facts.booker_type,
    institutionName: facts.institution_name,
    picShortName: facts.pii_purged_at === null ? shortNameOf(facts.pic_name) : null,
    addons,
    createdAt: facts.created_at,
    paidAt: facts.paid_at,
    visitDate: facts.visit_date,
    events,
    quotation,
    invoice,
    ticketCount,
    refund,
    terms,
  };
}
