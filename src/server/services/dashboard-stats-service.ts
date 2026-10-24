import 'server-only';

import type { RwId } from '@/config/rw';
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
  type DailyValue,
  type DateRange,
} from '@/lib/utils/kpi';
import type {
  MonthlyFigure,
  OpenSecurityAlert,
  RatingFigure,
  RwOverview,
  SuperadminOverview,
  TodaySession,
} from '@/types/dashboard-stats';

// The overview KPIs (Task P4.2.03, docs/StyleGuide.md §6.3), read through the session client so RLS and the AAL2
// policies decide every row (DATA-04); no service role. Money comes from the ledger view only (REC-07). An RW admin's
// figures stay inside what RLS shows them: today, the 30 days of check-ins on their own tickets, and the paid visits of
// the coming 30 days, which the bookings window of 0005 covers. Figures over longer periods (products sold) wait for
// the security definer aggregates of P4.2.01.

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const CHART_DAYS = 30;
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

function monthlyFigure(rows: readonly DailyValue[], period: Period): MonthlyFigure {
  const value = sumWithin(rows, period.ranges.current);
  return {
    value,
    trend: trendBetween(value, sumWithin(rows, period.ranges.previous)),
    series: fillDailySeries(period.days, rows),
  };
}

async function readRevenue(supabase: ServerClient, rw: RwId | null, period: Period) {
  let query = supabase
    .from('v_revenue_recap_daily')
    .select('day, net_amount')
    .gte('day', period.since);
  if (rw !== null) query = query.eq('rw_id', rw);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data.flatMap((row) =>
    row.day ? [{ day: row.day, value: row.net_amount ?? 0 }] : [],
  );
  return monthlyFigure(rows, period);
}

async function readCheckIns(supabase: ServerClient, rw: RwId | null, since: string) {
  let query = supabase
    .from('tickets_qr')
    .select('checked_in_at, checked_in_pax')
    .gte('checked_in_at', startOfJakartaDay(since));
  if (rw !== null) query = query.eq('rw_id', rw);
  const { data, error } = await query;
  if (error) throw error;
  return data.flatMap((row) =>
    row.checked_in_at ? [{ day: jakartaDayOf(row.checked_in_at), value: row.checked_in_pax }] : [],
  );
}

// Bookings paid on the days of the range (Semarang days, both ends included).
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
  return count ?? 0;
}

async function readPaidBookings(supabase: ServerClient, rw: RwId | null, period: Period) {
  const [value, previousValue] = await Promise.all([
    countPaidBookings(supabase, rw, period.ranges.current),
    countPaidBookings(supabase, rw, period.ranges.previous),
  ]);
  return { value, trend: trendBetween(value, previousValue) };
}

async function readRating(supabase: ServerClient, rw: RwId | null): Promise<RatingFigure> {
  let query = supabase.from('reviews').select('rating').eq('status', 'published');
  if (rw !== null) query = query.contains('rw_ids', [rw]);
  const { data, error } = await query;
  if (error) throw error;
  const ratings = data.map((row) => row.rating);
  return { average: averageOf(ratings), count: ratings.length };
}

async function listOpenAlerts(supabase: ServerClient) {
  const { data, error, count } = await supabase
    .from('security_alerts')
    .select('id, title, severity, occurrences, last_seen_at', { count: 'exact' })
    .is('acknowledged_at', null)
    .order('last_seen_at', { ascending: false })
    .limit(ALERT_STRIP_LIMIT);
  if (error) throw error;
  const alerts: OpenSecurityAlert[] = data.map((row) => ({
    id: row.id,
    title: row.title,
    severity: row.severity,
    occurrences: row.occurrences,
    lastSeenAt: row.last_seen_at,
  }));
  return { alerts, total: count ?? alerts.length };
}

// docs/Security.md DATA-04: every reveal of a contact is a security_events row; the overview counts today's.
async function countPiiRevealsToday(supabase: ServerClient, today: string) {
  const { count, error } = await supabase
    .from('security_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', 'pii_revealed')
    .gte('occurred_at', startOfJakartaDay(today));
  if (error) throw error;
  return count ?? 0;
}

export async function loadSuperadminOverview(
  rw: RwId | null,
  now: Date = new Date(),
): Promise<SuperadminOverview> {
  const supabase = await createSupabaseServerClient();
  const period = periodOf(now);
  const [revenue, paidBookings, checkIns, rating, alerts, piiRevealsToday] = await Promise.all([
    readRevenue(supabase, rw, period),
    readPaidBookings(supabase, rw, period),
    readCheckIns(supabase, rw, period.since),
    readRating(supabase, rw),
    listOpenAlerts(supabase),
    countPiiRevealsToday(supabase, todayInJakarta(now)),
  ]);
  return {
    revenue,
    paidBookings,
    checkedInVisitors: monthlyFigure(checkIns, period),
    rating,
    openAlerts: alerts.alerts,
    openAlertCount: alerts.total,
    piiRevealsToday,
  };
}

async function listTodaySessions(supabase: ServerClient, rw: RwId, today: string) {
  const { data, error } = await supabase
    .from('visit_sessions')
    .select('id, label, start_time, end_time, capacity, reserved_pax, checked_in_pax, status')
    .eq('rw_id', rw)
    .eq('session_date', today)
    .neq('status', 'cancelled')
    .order('start_time');
  if (error) throw error;
  return data.map((row): TodaySession => ({
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

async function countUpcomingBookings(supabase: ServerClient, rw: RwId, today: string) {
  const { count, error } = await supabase
    .from('v_bookings_staff')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'paid')
    .gte('visit_date', today)
    .contains('rw_ids', [rw]);
  if (error) throw error;
  return count ?? 0;
}

// Today's gate count from v_attendance_today, the figure the overview re-reads every 15 s (Task P4.2.02).
export async function countCheckInsToday(rw: RwId | null): Promise<number> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('v_attendance_today').select('checked_in_pax');
  if (rw !== null) query = query.eq('rw_id', rw);
  const { data, error } = await query;
  if (error) throw error;
  return sumOf(data, (row) => row.checked_in_pax ?? 0);
}

export async function loadRwOverview(rw: RwId, now: Date = new Date()): Promise<RwOverview> {
  const supabase = await createSupabaseServerClient();
  const today = todayInJakarta(now);
  const days = lastDays(CHART_DAYS, now);
  const [todaySessions, upcomingBookings, checkInsToday, checkIns] = await Promise.all([
    listTodaySessions(supabase, rw, today),
    countUpcomingBookings(supabase, rw, today),
    countCheckInsToday(rw),
    readCheckIns(supabase, rw, days[0] ?? today),
  ]);
  const reservedPax = sumOf(todaySessions, (session) => session.reservedPax);
  const capacity = sumOf(todaySessions, (session) => session.capacity);
  return {
    quota: { reservedPax, capacity, percent: quotaUsagePercent(reservedPax, capacity) },
    upcomingBookings,
    checkInsToday,
    checkIns: fillDailySeries(days, checkIns),
    todaySessions,
  };
}
