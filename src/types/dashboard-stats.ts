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

export interface OpenSecurityAlert {
  id: string;
  title: string;
  severity: EnumValue<'alert_severity'>;
  occurrences: number;
  lastSeenAt: string;
}

// The newest open alerts and how many are open in all.
export interface OpenSecurityAlerts {
  alerts: OpenSecurityAlert[];
  total: number;
}

export interface SuperadminOverview {
  revenue: MonthlyFigure | null;
  paidBookings: { value: number; trend: Trend } | null;
  checkedInVisitors: MonthlyFigure | null;
  rating: RatingFigure | null;
  openAlerts: OpenSecurityAlerts | null;
  piiRevealsToday: number | null;
}

export interface TodaySession {
  id: string;
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
  todaySessions: TodaySession[] | null;
}
