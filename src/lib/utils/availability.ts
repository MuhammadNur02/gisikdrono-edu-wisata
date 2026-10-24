import type { RwId } from '@/config/rw';

// The package page's availability (DESIGN-SPEC §3.5): sessions from v_session_availability grouped by visit day, and
// how full a day or a session is. Pure, so the island only draws.

export interface AvailabilitySession {
  id: string;
  rwId: RwId;
  // `Sesi Pagi`; NULL when the session has no name.
  label: string | null;
  // 'YYYY-MM-DD', a Semarang date.
  sessionDate: string;
  startTime: string;
  endTime: string;
  remaining: number;
  capacity: number | null;
}

export interface AvailabilityDay<Session extends AvailabilitySession = AvailabilitySession> {
  date: string;
  sessions: Session[];
  // Seats left across the day's sessions.
  remaining: number;
  // Seats in all, or NULL when a session has no capacity recorded.
  capacity: number | null;
}

export type SeatTone = 'open' | 'few' | 'full';

// DESIGN-SPEC §2.4: a session or a day is "few" from a quarter of its seats down (`Sisa 12 kursi` in warning).
const FEW_SEATS_SHARE = 0.25;

export function seatTone(remaining: number, capacity: number | null): SeatTone {
  if (remaining <= 0) return 'full';
  if (capacity !== null && capacity > 0 && remaining / capacity <= FEW_SEATS_SHARE) return 'few';
  return 'open';
}

function sumCapacity(sessions: readonly AvailabilitySession[]): number | null {
  let total = 0;
  for (const session of sessions) {
    if (session.capacity === null) return null;
    total += session.capacity;
  }
  return total;
}

// The days in date order, each with its sessions in the order they came (by start time from the query).
export function groupSessionsByDay<Session extends AvailabilitySession>(
  sessions: readonly Session[],
): AvailabilityDay<Session>[] {
  const byDate = new Map<string, Session[]>();
  for (const session of sessions) {
    byDate.set(session.sessionDate, [...(byDate.get(session.sessionDate) ?? []), session]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, daySessions]) => ({
      date,
      sessions: daySessions,
      remaining: daySessions.reduce((sum, session) => sum + Math.max(0, session.remaining), 0),
      capacity: sumCapacity(daySessions),
    }));
}
