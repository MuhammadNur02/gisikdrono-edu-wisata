import 'server-only';

import type { RwId } from '@/config/rw';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { todayInJakarta } from '@/lib/utils/dates';
import {
  averageOf,
  fillDailySeries,
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
import { collectAllRows, rowPageOf } from '@/lib/utils/paged-rows';
import { listTodaySessions } from '@/server/services/dashboard-today-service';
import { figureOf } from '@/server/services/kpi-figures';
import {
  countPaidBookings,
  countUpcomingVisits,
  dailyValuesOf,
  readRevenueDays,
  readVisitDays,
} from '@/server/services/visit-stats-service';
import type {
  MonthlyFigure,
  RatingFigure,
  RwOverview,
  SuperadminOverview,
  TodaySession,
} from '@/types/dashboard-stats';

// The overview KPIs (Task P4.2.03, docs/StyleGuide.md §6.3), read through the session client so the AAL2 checks and
// RLS decide (DATA-04); no service role. Every figure over days or a month comes from the stats RPCs of P4.2.01
// (visit-stats-service.ts): revenue from revenue_recap, the ledger (REC-07); paid bookings, check-ins, upcoming visits
// and products sold from visit_stats, by the day of the visit. They sum in Postgres, so an RW admin's figures are whole
// past the bookings RLS window. What is not a period figure (today's sessions and gate count, the rating, the alerts,
// today's reveals) still reads its own table, every page against the exact count where it sums rows. A figure that
// fails to load is null and shows as "Belum tersedia"; the other figures still show (re-review of PR #45).

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const CHART_DAYS = 30;

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

// "Reservasi lunas": the paid bookings that visit in the month so far, against the same days of last month.
async function readPaidBookings(rw: RwId | null, period: Period, supabase: ServerClient) {
  const [value, previous] = await Promise.all([
    countPaidBookings(rw, period.ranges.current, supabase),
    countPaidBookings(rw, period.ranges.previous, supabase),
  ]);
  return { value, trend: trendBetween(value, previous) };
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
  const today = todayInJakarta(now);
  const [revenue, paidBookings, visits, rating, piiRevealsToday] = await Promise.allSettled([
    readRevenueDays(rw, period.since, today, supabase),
    readPaidBookings(rw, period, supabase),
    readVisitDays(rw, period.since, today, supabase),
    readRating(supabase, rw),
    countPiiRevealsToday(supabase, today),
  ]);
  const visitDays = figureOf(visits, 'visit_stats');
  return {
    revenue: monthlyFigure(figureOf(revenue, 'revenue'), period),
    paidBookings: figureOf(paidBookings, 'paid_bookings'),
    checkedInVisitors: monthlyFigure(
      visitDays === null ? null : dailyValuesOf(visitDays, (day) => day.pax_checked_in),
      period,
    ),
    rating: figureOf(rating, 'rating'),
    piiRevealsToday: figureOf(piiRevealsToday, 'pii_reveals_today'),
  };
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
  const [sessions, upcoming, checkInsToday, checkIns] = await Promise.allSettled([
    listTodaySessions(supabase, rw, today),
    countUpcomingVisits(rw, today),
    countCheckInsToday(rw),
    readVisitDays(rw, days[0] ?? today, today, supabase),
  ]);
  const todaySessions = figureOf(sessions, 'today_sessions');
  const visitDays = figureOf(checkIns, 'check_ins');
  const checkInRows =
    visitDays === null ? null : dailyValuesOf(visitDays, (day) => day.pax_checked_in);
  return {
    quota: quotaOf(todaySessions),
    upcomingBookings: figureOf(upcoming, 'upcoming_bookings'),
    checkInsToday: figureOf(checkInsToday, 'check_ins_today'),
    checkIns: checkInRows === null ? null : fillDailySeries(days, checkInRows),
  };
}
