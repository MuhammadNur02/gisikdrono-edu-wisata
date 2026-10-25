import 'server-only';

import { unstable_cache } from 'next/cache';
import { z } from 'zod';

import type { RwId } from '@/config/rw';
import { PUBLIC_REVALIDATE_SECONDS, rowsOf } from '@/lib/queries/public-read';
import { TAGS } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import { upcomingVisitDates } from '@/lib/utils/dates';
import {
  summarizeSessions,
  type SessionSummary,
  type SummarisableSession,
} from '@/lib/utils/session-summary';

// Four weeks show every weekday a session template runs on, even around a holiday closure.
const SUMMARY_WINDOW_DAYS = 28;
const SUMMARY_COLUMNS = 'session_date, start_time, end_time, label, capacity';

// Every column of a view is nullable to PostgREST, although v_session_availability copies NOT NULL columns.
const summaryRowSchema = z.object({
  session_date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  label: z.string().nullable(),
  capacity: z.number().int(),
});

function toSummarisable(row: unknown): SummarisableSession {
  const session = summaryRowSchema.parse(row);
  return {
    sessionDate: session.session_date,
    startTime: session.start_time,
    endTime: session.end_time,
    label: session.label,
    capacity: session.capacity,
  };
}

type VisitRange = ReturnType<typeof upcomingVisitDates>;

async function readSummary(rwIds: readonly RwId[], range: VisitRange): Promise<SessionSummary> {
  const result = await createSupabaseAnonClient()
    .from('v_session_availability')
    .select(SUMMARY_COLUMNS)
    .in('rw_id', [...rwIds])
    .gte('session_date', range.from)
    .lte('session_date', range.to);
  return summarizeSessions(rowsOf(result, 'v_session_availability').map(toSummarisable));
}

// The session tags of every RW for the one or two months the window spans (YYYY-MM).
function tagsFor(rwIds: readonly RwId[], range: VisitRange): string[] {
  const months = [
    ...new Set([range.from, range.to].map((date) => date.slice(0, 'YYYY-MM'.length))),
  ];
  return rwIds.flatMap((rwId) => months.map((month) => TAGS.sessions(rwId, month)));
}

// The days, times and seats of the sessions the given RWs offer in the coming four weeks (DESIGN-SPEC §3.1, §3.3,
// §3.9), from the view the booking wizard reads, in one query. Cached for an hour under the sessions tags, so a session
// edit shows at once; only the general shape of the timetable is shown, never the seats left.
export async function getSessionSummary(rwIds: readonly RwId[]): Promise<SessionSummary> {
  if (rwIds.length === 0) return summarizeSessions([]);
  const range = upcomingVisitDates(SUMMARY_WINDOW_DAYS);
  const read = unstable_cache(
    () => readSummary(rwIds, range),
    ['session-summary', range.from, ...rwIds.map(String)],
    {
      tags: tagsFor(rwIds, range),
      revalidate: PUBLIC_REVALIDATE_SECONDS,
    },
  );
  return read();
}
