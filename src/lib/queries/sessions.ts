import 'server-only';

import { z } from 'zod';

import type { RwId } from '@/config/rw';
import { toRwId } from '@/lib/queries/mappers';
import { rowsOf } from '@/lib/queries/public-read';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import type { AvailableSession } from '@/types/session';

// Not cached: the seats left change with every hold, and the wizard must not offer a session that filled
// an hour ago (Task P2.3.02). The view already hides closed sessions and dates before today in Semarang.

const SESSION_COLUMNS = 'id, rw_id, session_date, start_time, end_time, label, capacity, remaining';

// Every column of a view is nullable to PostgREST, although v_session_availability copies NOT NULL columns.
const sessionRowSchema = z.object({
  id: z.string(),
  rw_id: z.number().int(),
  session_date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  label: z.string(),
  capacity: z.number().int(),
  remaining: z.number().int(),
});

function toAvailableSession(row: unknown): AvailableSession {
  const session = sessionRowSchema.parse(row);
  return {
    id: session.id,
    rwId: toRwId(session.rw_id),
    sessionDate: session.session_date,
    startTime: session.start_time,
    endTime: session.end_time,
    label: session.label,
    capacity: session.capacity,
    remaining: session.remaining,
  };
}

export interface SessionRange {
  rwId: RwId;
  // Visit dates as YYYY-MM-DD, both ends included.
  from: string;
  to: string;
}

export async function listAvailableSessions(range: SessionRange): Promise<AvailableSession[]> {
  const result = await createSupabaseAnonClient()
    .from('v_session_availability')
    .select(SESSION_COLUMNS)
    .eq('rw_id', range.rwId)
    .gte('session_date', range.from)
    .lte('session_date', range.to)
    .order('session_date')
    .order('start_time');
  return rowsOf(result, 'v_session_availability').map(toAvailableSession);
}
