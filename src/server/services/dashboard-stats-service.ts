import 'server-only';

import type { RwId } from '@/config/rw';
import { createLogger } from '@/lib/logger';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { todayInJakarta } from '@/lib/utils/dates';
import {
  averageOf,
  dayAfter,
  fillDailySeries,
  jakartaDayOf,
  lastDays,
  monthRanges,
  quotaUsagePercent,
  startOfJakartaDay,
  sumOf,
  sumWithin,
  trendBetween,
  visitDateAfter,
  type DailyValue,
  type DateRange,
} from '@/lib/utils/kpi';
import { collectAllRows, rowPageOf } from '@/lib/utils/paged-rows';
import { readProductsSoldThisMonth } from '@/server/services/visit-stats-service';
import type {
  MonthlyFigure,
  OpenSecurityAlerts,
  RatingFigure,
  RwOverview,
  SuperadminOverview,
  TodaySession,
} from '@/types/dashboard-stats';

// The overview KPIs (Task P4.2.03, docs/StyleGuide.md §6.3), read through the session client so RLS and the AAL2
// policies decide every row (DATA-04); no service role. Money comes from the ledger view only (REC-07). Plain counts
// are head requests; a figure summed from rows reads every page against the exact count (collectAllRows, since
// PostgREST stops at max_rows). A figure that cannot be complete, has no count or fails to load is null and shows as
// "Belum tersedia"; the other figures still show (re-review of PR #45). Products sold comes from P4.2.01's visit_stats
// (visit-stats-service.ts), which sums in Postgres beyond an RW admin's windows.

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const CHART_DAYS = 30;
const UPCOMING_DAYS = 30;
const ALERT_STRIP_LIMIT = 5;
// A booking that was paid, whatever happened at the gate since.
const PAID_BOOKING_STATUSES = ['paid', 'checked_in', 'completed', 'no_show'] as const;

interface Period {
  ranges: { current: DateRange; previous: DateRange };
  days: string[];
  // The earliest day either the chart or the previous period needs.
  since: string;
}

function periodOf(now: Date): Period {
  const ranges = monthRanges(now);
  const days = lastDays(CHART_DAYS, now);
  const firstDay = days[0] ?? ranges.current.from;
  return { ranges, days, since: firstDay < ranges.previous.from ? firstDay : ranges.previous.from };
}

// A KPI that failed to load becomes null, logged by name only, so one bad read never takes the overview down.
function figureOf<T>(result: PromiseSettledResult<T | null>, kpi: string): T | null {
  if (result.status === 'fulfilled') return result.value;
  const reason: unknown = result.reason;
  createLogger(crypto.randomUUID()).error('internal_error', {
    kpi,
    errorName: reason instanceof Error ? reason.name : typeof reason,
  });
  return null;
}

function monthlyFigure(rows: readonly DailyValue[] | null, period: Period): MonthlyFigure | null {
  if (rows === null) return null;
  const value = sumWithin(rows, period.ranges.current);
  return {
    value,
    trend: trendBetween(value, sumWithin(rows, period.ranges.previous)),
    series: fillDailySeries(period.days, rows),
  };
}

async function readRevenue(supabase: ServerClient, rw: RwId | null, period: Period) {
  const result = await collectAllRows(async (from, to) => {
    let query = supabase
      .from('v_revenue_recap_daily')
      .select('day, net_amount', { count: 'exact' })
      .gte('day', period.since);
    if (rw !== null) query = query.eq('rw_id', rw);
    return rowPageOf(
      await query.order('day').order('rw_id').order('beneficiary_key').range(from, to),
    );
  });
  if (!result.complete) return null;
  const rows = result.rows.flatMap((row) =>
    row.day ? [{ day: row.day, value: row.net_amount ?? 0 }] : [],
  );
  return monthlyFigure(rows, period);
}

async function readCheckIns(supabase: ServerClient, rw: RwId | null, since: string) {
  const result = await collectAllRows(async (from, to) => {
    let query = supabase
      .from('tickets_qr')
      .select('checked_in_at, checked_in_pax', { count: 'exact' })
      .gte('checked_in_at', startOfJakartaDay(since));
    if (rw !== null) query = query.eq('rw_id', rw);
    return rowPageOf(await query.order('id').range(from, to));
  });
  if (!result.complete) return null;
  return result.rows.flatMap((row) =>
    row.checked_in_at
      ? [{ day: jakartaDayOf(row.checked_in_at), value: row.checked_in_pax ?? 0 }]
      : [],
  );
}

// Bookings paid on the days of the range (Semarang days, both ends included); null without a count.
async function countPaidBookings(supabase: ServerClient, rw: RwId | null, range: DateRange) {
  let query = supabase
    .from('v_bookings_staff')
    .select('id', { count: 'exact', head: true })
    .in('status', PAID_BOOKING_STATUSES)
    .gte('paid_at', startOfJakartaDay(range.from))
    .lt('paid_at', startOfJakartaDay(dayAfter(range.to)));
  if (rw !== null) query = query.contains('rw_ids', [rw]);
  const { count, error } = await query;
  if (error) throw error;
  return count;
}

async function readPaidBookings(supabase: ServerClient, rw: RwId | null, period: Period) {
  const [value, previousValue] = await Promise.all([
    countPaidBookings(supabase, rw, period.ranges.current),
    countPaidBookings(supabase, rw, period.ranges.previous),
  ]);
  if (value === null || previousValue === null) return null;
  return { value, trend: trendBetween(value, previousValue) };
}

async function readRating(supabase: ServerClient, rw: RwId | null): Promise<RatingFigure | null> {
  const result = await collectAllRows(async (from, to) => {
    let query = supabase
      .from('reviews')
      .select('rating', { count: 'exact' })
      .eq('status', 'published');
    if (rw !== null) query = query.contains('rw_ids', [rw]);
    return rowPageOf(await query.order('id').range(from, to));
  });
  if (!result.complete) return null;
  const ratings = result.rows.map((row) => row.rating);
  return { average: averageOf(ratings), count: ratings.length };
}

async function listOpenAlerts(supabase: ServerClient): Promise<OpenSecurityAlerts | null> {
  const { data, error, count } = await supabase
    .from('security_alerts')
    .select('id, title, severity, occurrences, last_seen_at', { count: 'exact' })
    .is('acknowledged_at', null)
    .order('last_seen_at', { ascending: false })
    .limit(ALERT_STRIP_LIMIT);
  if (error) throw error;
  if (count === null) return null;
  const alerts = data.map((row) => ({
    id: row.id,
    title: row.title,
    severity: row.severity,
    occurrences: row.occurrences,
    lastSeenAt: row.last_seen_at,
  }));
  return { alerts, total: count };
}

// docs/Security.md DATA-04: every reveal of a contact is a security_events row; the overview counts today's.
async function countPiiRevealsToday(supabase: ServerClient, today: string) {
  const { count, error } = await supabase
    .from('security_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', 'pii_revealed')
    .gte('occurred_at', startOfJakartaDay(today));
  if (error) throw error;
  return count;
}

export async function loadSuperadminOverview(
  rw: RwId | null,
  now: Date = new Date(),
): Promise<SuperadminOverview> {
  const supabase = await createSupabaseServerClient();
  const period = periodOf(now);
  const [revenue, paidBookings, checkIns, rating, openAlerts, piiRevealsToday] =
    await Promise.allSettled([
      readRevenue(supabase, rw, period),
      readPaidBookings(supabase, rw, period),
      readCheckIns(supabase, rw, period.since),
      readRating(supabase, rw),
      listOpenAlerts(supabase),
      countPiiRevealsToday(supabase, todayInJakarta(now)),
    ]);
  return {
    revenue: figureOf(revenue, 'revenue'),
    paidBookings: figureOf(paidBookings, 'paid_bookings'),
    checkedInVisitors: monthlyFigure(figureOf(checkIns, 'checked_in_visitors'), period),
    rating: figureOf(rating, 'rating'),
    openAlerts: figureOf(openAlerts, 'open_alerts'),
    piiRevealsToday: figureOf(piiRevealsToday, 'pii_reveals_today'),
  };
}

const SESSION_COLUMNS =
  'id, label, start_time, end_time, capacity, reserved_pax, checked_in_pax, status';

async function listTodaySessions(supabase: ServerClient, rw: RwId, today: string) {
  const result = await collectAllRows(async (from, to) =>
    rowPageOf(
      await supabase
        .from('visit_sessions')
        .select(SESSION_COLUMNS, { count: 'exact' })
        .eq('rw_id', rw)
        .eq('session_date', today)
        .neq('status', 'cancelled')
        .order('start_time')
        .order('id')
        .range(from, to),
    ),
  );
  if (!result.complete) return null;
  return result.rows.map((row): TodaySession => ({
    id: row.id,
    label: row.label,
    startTime: row.start_time,
    endTime: row.end_time,
    capacity: row.capacity,
    reservedPax: row.reserved_pax,
    checkedInPax: row.checked_in_pax,
    status: row.status,
  }));
}

// Paid visits from today to 30 days ahead in Semarang, stated here rather than left to the RLS window of 0005.
async function countUpcomingBookings(supabase: ServerClient, rw: RwId, today: string) {
  const { count, error } = await supabase
    .from('v_bookings_staff')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'paid')
    .gte('visit_date', today)
    .lte('visit_date', visitDateAfter(today, UPCOMING_DAYS))
    .contains('rw_ids', [rw]);
  if (error) throw error;
  return count;
}

// Today's gate count from v_attendance_today, the figure the overview re-reads every 15 s (Task P4.2.02); null when
// it cannot be read whole.
export async function countCheckInsToday(rw: RwId | null): Promise<number | null> {
  const supabase = await createSupabaseServerClient();
  const result = await collectAllRows(async (from, to) => {
    let query = supabase.from('v_attendance_today').select('checked_in_pax', { count: 'exact' });
    if (rw !== null) query = query.eq('rw_id', rw);
    return rowPageOf(await query.order('ticket_id').range(from, to));
  });
  return result.complete ? sumOf(result.rows, (row) => row.checked_in_pax ?? 0) : null;
}

function quotaOf(sessions: readonly TodaySession[] | null): RwOverview['quota'] {
  if (sessions === null) return null;
  const reservedPax = sumOf(sessions, (session) => session.reservedPax);
  const capacity = sumOf(sessions, (session) => session.capacity);
  return { reservedPax, capacity, percent: quotaUsagePercent(reservedPax, capacity) };
}

export async function loadRwOverview(rw: RwId, now: Date = new Date()): Promise<RwOverview> {
  const supabase = await createSupabaseServerClient();
  const today = todayInJakarta(now);
  const days = lastDays(CHART_DAYS, now);
  const [sessions, upcoming, checkInsToday, checkIns, productsSold] = await Promise.allSettled([
    listTodaySessions(supabase, rw, today),
    countUpcomingBookings(supabase, rw, today),
    countCheckInsToday(rw),
    readCheckIns(supabase, rw, days[0] ?? today),
    readProductsSoldThisMonth(rw, now),
  ]);
  const todaySessions = figureOf(sessions, 'today_sessions');
  const checkInRows = figureOf(checkIns, 'check_ins');
  return {
    quota: quotaOf(todaySessions),
    upcomingBookings: figureOf(upcoming, 'upcoming_bookings'),
    checkInsToday: figureOf(checkInsToday, 'check_ins_today'),
    checkIns: checkInRows === null ? null : fillDailySeries(days, checkInRows),
    todaySessions,
    productsSold: figureOf(productsSold, 'products_sold'),
  };
}
