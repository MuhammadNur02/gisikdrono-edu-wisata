import 'server-only';

import type { RwId } from '@/config/rw';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { todayInJakarta } from '@/lib/utils/dates';
import { quotaUsagePercent, sumOf, visitDateAfter } from '@/lib/utils/kpi';
import { collectAllRows, rowPageOf } from '@/lib/utils/paged-rows';
import { figureOf } from '@/server/services/kpi-figures';
import type {
  NeedsActionItem,
  OccupancyCell,
  OccupancyRow,
  OverviewToday,
  TodaySession,
} from '@/types/dashboard-stats';

// The overview's day panels (Dasbor Gelap, 2026-11-15): today's sessions, the next seven days' occupancy and what
// needs a staff member. Read through the session client, so RLS and the AAL2 policies decide (DATA-04): an RW officer
// sees their own RW's sessions and bookings only, and the alerts and reviews are the superadmin's.

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const OCCUPANCY_DAYS = 7;
const SESSION_COLUMNS =
  'id, rw_id, label, start_time, end_time, capacity, reserved_pax, checked_in_pax, status';

export async function listTodaySessions(
  supabase: ServerClient,
  rw: RwId | null,
  today: string,
): Promise<TodaySession[] | null> {
  const result = await collectAllRows(async (from, to) => {
    let query = supabase
      .from('visit_sessions')
      .select(SESSION_COLUMNS, { count: 'exact' })
      .eq('session_date', today)
      .neq('status', 'cancelled');
    if (rw !== null) query = query.eq('rw_id', rw);
    return rowPageOf(await query.order('start_time').order('id').range(from, to));
  });
  if (!result.complete) return null;
  return result.rows.map((row) => ({
    id: row.id,
    rwId: row.rw_id,
    label: row.label,
    startTime: row.start_time,
    endTime: row.end_time,
    capacity: row.capacity,
    reservedPax: row.reserved_pax,
    checkedInPax: row.checked_in_pax,
    status: row.status,
  }));
}

interface SessionSeats {
  rw_id: number;
  session_date: string;
  capacity: number;
  reserved_pax: number;
}

function cellOf(day: string, sessions: readonly SessionSeats[]): OccupancyCell {
  const reserved = sumOf(sessions, (session) => session.reserved_pax);
  const capacity = sumOf(sessions, (session) => session.capacity);
  return {
    day,
    percent: sessions.length === 0 ? null : quotaUsagePercent(reserved, capacity),
    isFull: sessions.length > 0 && sessions.every((s) => s.reserved_pax >= s.capacity),
  };
}

// One row per RW that has a session in the window, the days in order; RLS leaves an officer their own RW.
export function occupancyRowsOf(
  rows: readonly SessionSeats[],
  days: readonly string[],
): OccupancyRow[] {
  const rwIds = [...new Set(rows.map((row) => row.rw_id))].sort((a, b) => a - b);
  return rwIds.map((rwId) => ({
    rwId,
    cells: days.map((day) =>
      cellOf(
        day,
        rows.filter((row) => row.rw_id === rwId && row.session_date === day),
      ),
    ),
  }));
}

async function readOccupancy(supabase: ServerClient, rw: RwId | null, today: string) {
  const days = Array.from({ length: OCCUPANCY_DAYS }, (_, index) => visitDateAfter(today, index));
  const lastDay = days.at(-1) ?? today;
  const result = await collectAllRows(async (from, to) => {
    let query = supabase
      .from('visit_sessions')
      .select('rw_id, session_date, capacity, reserved_pax', { count: 'exact' })
      .gte('session_date', today)
      .lte('session_date', lastDay)
      .eq('status', 'open');
    if (rw !== null) query = query.eq('rw_id', rw);
    return rowPageOf(await query.order('session_date').order('id').range(from, to));
  });
  return result.complete ? occupancyRowsOf(result.rows, days) : null;
}

async function bookingReviews(supabase: ServerClient, rw: RwId | null): Promise<NeedsActionItem> {
  let query = supabase
    .from('v_bookings_staff')
    .select('booking_code', { count: 'exact' })
    .eq('needs_review', true);
  if (rw !== null) query = query.contains('rw_ids', [rw]);
  const { data, count, error } = await query.order('created_at', { ascending: false }).limit(1);
  if (error) throw error;
  return { kind: 'booking_review', count: count ?? 0, detail: data[0]?.booking_code ?? null };
}

async function openAlerts(supabase: ServerClient): Promise<NeedsActionItem> {
  const { data, count, error } = await supabase
    .from('security_alerts')
    .select('title', { count: 'exact' })
    .is('acknowledged_at', null)
    .order('last_seen_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return { kind: 'security_alerts', count: count ?? 0, detail: data[0]?.title ?? null };
}

async function pendingReviews(supabase: ServerClient): Promise<NeedsActionItem> {
  const { count, error } = await supabase
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) throw error;
  return { kind: 'pending_reviews', count: count ?? 0, detail: null };
}

// The items with something waiting, most urgent first. The alerts and reviews are the superadmin's (RLS reads them
// for nobody else), so an RW officer's list is their bookings under review.
async function readNeedsAction(supabase: ServerClient, rw: RwId | null, isSuperadmin: boolean) {
  const reads = [bookingReviews(supabase, rw)];
  if (isSuperadmin) reads.push(openAlerts(supabase), pendingReviews(supabase));
  const items = await Promise.all(reads);
  return items.filter((item) => item.count > 0);
}

export async function loadOverviewToday(
  rw: RwId | null,
  isSuperadmin: boolean,
  now: Date = new Date(),
): Promise<OverviewToday> {
  const supabase = await createSupabaseServerClient();
  const today = todayInJakarta(now);
  const [sessions, occupancy, actions] = await Promise.allSettled([
    listTodaySessions(supabase, rw, today),
    readOccupancy(supabase, rw, today),
    readNeedsAction(supabase, rw, isSuperadmin),
  ]);
  return {
    sessions: figureOf(sessions, 'today_sessions'),
    occupancy: figureOf(occupancy, 'occupancy'),
    actions: figureOf(actions, 'needs_action'),
  };
}
