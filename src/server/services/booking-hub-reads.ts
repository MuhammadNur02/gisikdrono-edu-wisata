import 'server-only';

import { z } from 'zod';

import type { DatabaseClient } from '@/db/rpc-result';
import { sessionStartsAt, toVisitDate } from '@/lib/utils/dates';
import { paymentPageOf } from '@/server/services/payment-reads';
import type { HubEvent, StatusHubView, WeatherOption, WeatherState } from '@/types/booking-hub';

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

// ===== Weather (docs/PRD.md §13.1 A17) =====

const WEATHER_SETTING_KEYS = [
  'booking.weather_window_hours',
  'booking.weather_reschedule_max',
] as const;
const HOUR_MS = 3_600_000;
// How far ahead the hub offers a new day: the booking window's own limit is checked again by the database.
const WEATHER_OPTION_DAYS = 60;
const HOURS_PER_DAY = 24;
const DAY_MS = HOURS_PER_DAY * HOUR_MS;

async function weatherRulesOf(adminClient: DatabaseClient) {
  const { data, error } = await adminClient
    .from('site_settings')
    .select('key, value')
    .in('key', WEATHER_SETTING_KEYS);
  if (error) throw error;
  const numberOf = (key: string) => {
    const value = data.find((row) => row.key === key)?.value;
    return typeof value === 'number' ? value : 0;
  };
  return {
    windowHours: numberOf('booking.weather_window_hours'),
    maxMoves: numberOf('booking.weather_reschedule_max'),
  };
}

async function legsOf(adminClient: DatabaseClient, bookingId: string) {
  const { data, error } = await adminClient
    .from('booking_legs')
    .select('leg_order, rw_id, pax_count, visit_session_id, rw_units(name)')
    .eq('booking_id', bookingId)
    .order('leg_order');
  if (error) throw error;
  return data;
}

async function latestNoticeOf(adminClient: DatabaseClient, sessionIds: string[]) {
  const { data, error } = await adminClient
    .from('weather_notices')
    .select('declared_at, reason')
    .in('visit_session_id', sessionIds)
    .order('declared_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function weatherMovesOf(adminClient: DatabaseClient, bookingId: string): Promise<number> {
  const { count, error } = await adminClient
    .from('booking_events')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', bookingId)
    .eq('reason', 'weather_reschedule');
  if (error) throw error;
  return count ?? 0;
}

// The open sessions of one RW a leg of p_pax may move to: ahead, not the one it leaves, with room for the group.
async function sessionOptionsOf(
  adminClient: DatabaseClient,
  leg: { rw_id: number; pax_count: number; visit_session_id: string },
  now: Date,
): Promise<WeatherOption[]> {
  const today = toVisitDate(now);
  const last = toVisitDate(new Date(now.getTime() + WEATHER_OPTION_DAYS * DAY_MS));
  const { data, error } = await adminClient
    .from('v_session_availability')
    .select('id, session_date, start_time, end_time, label, remaining')
    .eq('rw_id', leg.rw_id)
    .gte('session_date', today)
    .lte('session_date', last)
    .gte('remaining', leg.pax_count)
    .neq('id', leg.visit_session_id)
    .order('session_date')
    .order('start_time');
  if (error) throw error;
  return data
    .flatMap((row) =>
      row.id && row.session_date && row.start_time && row.end_time && row.remaining !== null
        ? [
            {
              sessionId: row.id,
              sessionDate: row.session_date,
              startTime: row.start_time,
              endTime: row.end_time,
              label: row.label,
              remaining: row.remaining,
            },
          ]
        : [],
    )
    .filter((option) => sessionStartsAt(option.sessionDate, option.startTime) > now);
}

// A booking's weather state, or null when no notice is open for it: when the window closes, the moves left and, for
// each leg, the sessions it may move to.
export async function weatherStateOf(
  adminClient: DatabaseClient,
  bookingId: string,
  now: Date = new Date(),
): Promise<WeatherState | null> {
  const legs = await legsOf(adminClient, bookingId);
  const notice = await latestNoticeOf(
    adminClient,
    legs.map((leg) => leg.visit_session_id),
  );
  if (!notice) return null;
  const rules = await weatherRulesOf(adminClient);
  const openUntil = new Date(Date.parse(notice.declared_at) + rules.windowHours * HOUR_MS);
  if (openUntil <= now) return null;
  const moves = await weatherMovesOf(adminClient, bookingId);
  return {
    openUntil: openUntil.toISOString(),
    reason: notice.reason,
    movesLeft: Math.max(rules.maxMoves - moves, 0),
    legs: await Promise.all(
      legs.map(async (leg) => ({
        rwName: leg.rw_units.name,
        options: await sessionOptionsOf(adminClient, leg, now),
      })),
    ),
  };
}
