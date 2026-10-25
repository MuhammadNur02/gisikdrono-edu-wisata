import { formatTimeRange } from '@/lib/utils/dates';
import { joinWithAnd } from '@/lib/utils/lists';

// The visit days and session times the public pages state (DESIGN-SPEC §3.1 contact, §3.3 facts strip, §3.9 session
// block), read from the sessions a visitor can book rather than typed in, so they stay true when a kelurahan admin
// changes the session templates.

// Indexed by Date.getUTCDay(): Sunday first.
const WEEKDAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;
const SUNDAY = 0;
// A week reads from Monday in Indonesia, Sunday last.
const WEEK_ORDER: readonly number[] = [
  ...WEEKDAY_NAMES.map((_, day) => day).filter((day) => day !== SUNDAY),
  SUNDAY,
];
// Three or more days in a row read as a range, `Selasa–Sabtu`; fewer are listed.
const MIN_DAYS_FOR_RANGE = 3;

export interface SessionSlot {
  label: string | null;
  startTime: string;
  endTime: string;
}

export interface SessionSummary {
  // `Selasa–Sabtu`; NULL while nothing is bookable.
  weekdays: string | null;
  // One entry per distinct time of day, earliest first.
  slots: SessionSlot[];
  // The seats of one session when every session has the same; NULL otherwise.
  capacity: number | null;
}

export interface SummarisableSession {
  sessionDate: string;
  startTime: string;
  endTime: string;
  label: string | null;
  capacity: number;
}

function weekdayOf(visitDate: string): number {
  return new Date(`${visitDate}T12:00:00Z`).getUTCDay();
}

function nameOf(day: number): string {
  return WEEKDAY_NAMES[day] ?? '';
}

function isConsecutive(days: readonly number[]): boolean {
  const first = days[0];
  if (first === undefined) return false;
  const start = WEEK_ORDER.findIndex((day) => day === first);
  return days.every((day, index) => WEEK_ORDER[start + index] === day);
}

// `Selasa–Sabtu`, or `Sabtu dan Minggu` for days that do not run on.
export function describeWeekdays(days: ReadonlySet<number>): string | null {
  const ordered = WEEK_ORDER.filter((day) => days.has(day));
  const first = ordered[0];
  const last = ordered.at(-1);
  if (first === undefined || last === undefined) return null;
  if (ordered.length >= MIN_DAYS_FOR_RANGE && isConsecutive(ordered)) {
    return `${nameOf(first)}–${nameOf(last)}`;
  }
  return joinWithAnd(ordered.map(nameOf));
}

function distinctSlots(sessions: readonly SummarisableSession[]): SessionSlot[] {
  const byTime = new Map<string, SessionSlot>();
  for (const session of sessions) {
    const key = `${session.startTime}-${session.endTime}`;
    if (!byTime.has(key)) {
      byTime.set(key, {
        label: session.label,
        startTime: session.startTime,
        endTime: session.endTime,
      });
    }
  }
  return [...byTime.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function sharedCapacity(sessions: readonly SummarisableSession[]): number | null {
  const capacities = new Set(sessions.map((session) => session.capacity));
  const [only] = capacities;
  return capacities.size === 1 && only !== undefined ? only : null;
}

export function summarizeSessions(sessions: readonly SummarisableSession[]): SessionSummary {
  return {
    weekdays: describeWeekdays(new Set(sessions.map((session) => weekdayOf(session.sessionDate)))),
    slots: distinctSlots(sessions),
    capacity: sharedCapacity(sessions),
  };
}

// `08.30–10.30 dan 13.30–15.30 WIB`: every slot's hours, the zone written once.
export function describeSlotHours(slots: readonly SessionSlot[]): string | null {
  if (slots.length === 0) return null;
  const ranges = slots.map((slot) =>
    formatTimeRange(slot.startTime, slot.endTime).replace(' WIB', ''),
  );
  return `${joinWithAnd(ranges)} WIB`;
}
