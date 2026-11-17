import type { EnumValue } from '@/db/enums';
import type { DailyValue, Trend } from '@/lib/utils/kpi';

// The figures of /dashboard (Task P4.2.03). Counts and ledger sums only: no name, contact or booking code. A null
// figure could not be read whole (collectAllRows) and shows as "Belum tersedia", never as a partial number.

// A figure of this month with its trend against the same days of last month, and its last 30 days.
export interface MonthlyFigure {
  value: number;
  trend: Trend;
  series: DailyValue[];
}

export interface RatingFigure {
  // null when no review is published yet: no rating, never a zero one.
  average: number | null;
  count: number;
}

export interface SuperadminOverview {
  revenue: MonthlyFigure | null;
  paidBookings: { value: number; trend: Trend } | null;
  checkedInVisitors: MonthlyFigure | null;
  rating: RatingFigure | null;
  piiRevealsToday: number | null;
}

export interface TodaySession {
  id: string;
  rwId: number;
  label: string | null;
  startTime: string;
  endTime: string;
  capacity: number;
  reservedPax: number;
  checkedInPax: number;
  status: EnumValue<'session_status'>;
}

export interface RwOverview {
  quota: { reservedPax: number; capacity: number; percent: number | null } | null;
  upcomingBookings: number | null;
  checkInsToday: number | null;
  checkIns: DailyValue[] | null;
}

// One RW's day in the next seven (Dasbor Gelap's occupancy grid): seats sold, holds awaiting payment included, over the
// capacity of its open sessions. percent is null on a day without a session; isFull when every session is full.
export interface OccupancyCell {
  day: string;
  percent: number | null;
  isFull: boolean;
}

export interface OccupancyRow {
  rwId: number;
  cells: OccupancyCell[];
}

// What waits on a staff member, most urgent first: bookings held for review, open security alerts, reviews to
// moderate. detail names the newest one where that helps (a booking code, an alert's title).
export type NeedsActionKind = 'booking_review' | 'security_alerts' | 'pending_reviews';

export interface NeedsActionItem {
  kind: NeedsActionKind;
  count: number;
  detail: string | null;
}

export interface OverviewToday {
  sessions: TodaySession[] | null;
  occupancy: OccupancyRow[] | null;
  actions: NeedsActionItem[] | null;
}
