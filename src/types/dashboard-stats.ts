import type { EnumValue } from '@/db/enums';
import type { DailyValue, Trend } from '@/lib/utils/kpi';

// The figures of /dashboard (Task P4.2.03). Counts and ledger sums only: no name, contact or booking code.

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

export interface SuperadminOverview {
  revenue: MonthlyFigure;
  paidBookings: { value: number; trend: Trend };
  checkedInVisitors: MonthlyFigure;
  rating: RatingFigure;
  openAlerts: OpenSecurityAlert[];
  openAlertCount: number;
  piiRevealsToday: number;
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
  quota: { reservedPax: number; capacity: number; percent: number | null };
  upcomingBookings: number;
  checkInsToday: number;
  checkIns: DailyValue[];
  todaySessions: TodaySession[];
}
