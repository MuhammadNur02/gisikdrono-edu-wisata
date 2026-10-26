import 'server-only';

import type { RwId } from '@/config/rw';
import { rpcRevenueRecapDays, rpcVisitStats, type VisitStatsBucket } from '@/db/rpc-stats';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { monthRanges, sumOf, visitDateAfter, type DailyValue } from '@/lib/utils/kpi';

// The overview's figures over a period, from the stats RPCs of P4.2.01 alone (Task P4.2.03, CLAUDE.md §10,
// docs/PRD.md §8.7.1): visit_stats counts bookings, people and add-ons by the day they visit, and revenue_recap reads
// the ledger by the day it was written. Both sum in Postgres as security definer aggregates, so an RW admin's figures
// are whole past the bookings RLS window and no row leaves the database.

const UPCOMING_DAYS = 30;

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// The visit days of a period, with what was booked, admitted and sold on each.
export async function readVisitDays(
  rw: RwId | null,
  from: string,
  to: string,
  client?: ServerClient,
): Promise<VisitStatsBucket[]> {
  const supabase = client ?? (await createSupabaseServerClient());
  return rpcVisitStats(supabase, { from, to, rwId: rw, granularity: 'day' });
}

// One figure of each visit day, for monthlyFigure and the charts.
export function dailyValuesOf(
  days: readonly VisitStatsBucket[],
  pick: (day: VisitStatsBucket) => number,
): DailyValue[] {
  return days.map((day) => ({ day: day.bucket, value: pick(day) }));
}

// The ledger's net amount of each day of the period, every beneficiary of the scope summed.
export async function readRevenueDays(
  rw: RwId | null,
  from: string,
  to: string,
  client?: ServerClient,
): Promise<DailyValue[]> {
  const supabase = client ?? (await createSupabaseServerClient());
  const rows = await rpcRevenueRecapDays(supabase, { from, to, rwId: rw });
  const byDay = new Map<string, number>();
  for (const row of rows) byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.net_amount);
  return [...byDay].map(([day, value]) => ({ day, value }));
}

// "Reservasi mendatang": the paid bookings that visit the RW from today to 30 days ahead.
export async function countUpcomingVisits(rw: RwId, today: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const buckets = await rpcVisitStats(supabase, {
    from: today,
    to: visitDateAfter(today, UPCOMING_DAYS),
    rwId: rw,
    granularity: 'month',
  });
  return sumOf(buckets, (bucket) => bucket.bookings);
}

// "Produk terjual": the add-on units of the RW's paid visits this month by visit day, cancelled lines left out.
export async function readProductsSoldThisMonth(rw: RwId, now: Date = new Date()): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { current } = monthRanges(now);
  const buckets = await rpcVisitStats(supabase, {
    from: current.from,
    to: current.to,
    rwId: rw,
    granularity: 'month',
  });
  return sumOf(buckets, (bucket) => bucket.products_sold);
}
