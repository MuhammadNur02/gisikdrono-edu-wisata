// /dashboard/sessions (Task P4.3.04). Where the table has a CHECK the cap is the same number (0003_tables.sql).

export const SESSIONS_PATH = '/dashboard/sessions';
export const MONTH_PARAM = 'month';

export const SESSION_LIMITS = {
  label: 60,
  notes: 500,
  // session_templates.capacity between 1 and 2000; visit_sessions.capacity >= 0.
  templateCapacityMin: 1,
  sessionCapacityMin: 0,
  capacityMax: 2000,
  // generate_visit_sessions refuses more than a year ahead.
  generateMaxDays: 366,
} as const;

// Sunday is 0, as session_templates.weekday and JavaScript count it.
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

// The derived occupancy chip (docs/StyleGuide.md §6.5): from this share of the capacity a session reads as nearly
// full, at the whole capacity as full.
export const OCCUPANCY_WARNING_RATIO = 0.8;
// The calendar draws at most this many quota bars per day; the rest is the `n sesi` count.
export const CALENDAR_BARS_PER_DAY = 3;
