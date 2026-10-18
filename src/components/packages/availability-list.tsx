'use client';

import { useEffect, useState } from 'react';

import { RwTag } from '@/components/layout/rw-tag';
import { Skeleton } from '@/components/ui/skeleton';
import { isRwId, type RwId } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatDateLong, formatTimeRange, upcomingVisitDates } from '@/lib/utils/dates';

// docs/PRD.md FR-PUB-12: the next 14 days of open sessions, read fresh in the browser from the public view, so
// the seats left are never an hour old. Booking itself re-checks everything on the server.
const PREVIEW_DAYS = 14;
const SKELETON_ROWS = 3;

interface SessionRow {
  id: string;
  rwId: RwId;
  sessionDate: string;
  startTime: string;
  endTime: string;
  remaining: number;
}

type LoadState =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; sessions: SessionRow[] };

async function loadSessions(rwIds: readonly RwId[]): Promise<SessionRow[]> {
  const { from, to } = upcomingVisitDates(PREVIEW_DAYS);
  const { data, error } = await createSupabaseBrowserClient()
    .from('v_session_availability')
    .select('id, rw_id, session_date, start_time, end_time, remaining')
    .in('rw_id', [...rwIds])
    .gte('session_date', from)
    .lte('session_date', to)
    .order('session_date')
    .order('start_time');
  if (error) throw new Error(error.code);
  // Every column of a view is nullable to PostgREST; a row missing one is skipped.
  return data.flatMap((row) =>
    row.id &&
    row.rw_id !== null &&
    isRwId(row.rw_id) &&
    row.session_date &&
    row.start_time &&
    row.end_time
      ? [
          {
            id: row.id,
            rwId: row.rw_id,
            sessionDate: row.session_date,
            startTime: row.start_time,
            endTime: row.end_time,
            remaining: row.remaining ?? 0,
          },
        ]
      : [],
  );
}

function useSessions(rwIds: readonly RwId[]): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const key = rwIds.join(',');
  useEffect(() => {
    let isCurrent = true;
    loadSessions(key.split(',').map(Number).filter(isRwId)).then(
      (sessions) => {
        if (isCurrent) setState({ status: 'ready', sessions });
      },
      () => {
        if (isCurrent) setState({ status: 'failed' });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [key]);
  return state;
}

function groupByDate(sessions: SessionRow[]): [string, SessionRow[]][] {
  const days = new Map<string, SessionRow[]>();
  for (const session of sessions)
    days.set(session.sessionDate, [...(days.get(session.sessionDate) ?? []), session]);
  return [...days.entries()];
}

function SessionDays({ sessions, showRw }: { sessions: SessionRow[]; showRw: boolean }) {
  return (
    <ul className="space-y-4">
      {groupByDate(sessions).map(([date, daySessions]) => (
        <li key={date} className="space-y-2">
          <p className="text-body-sm font-medium">{formatDateLong(date)}</p>
          <ul className="space-y-1">
            {daySessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground"
              >
                {showRw ? <RwTag rwId={session.rwId} /> : null}
                <span className="tabular-nums">
                  {formatTimeRange(session.startTime, session.endTime)}
                </span>
                <span>· {copy.catalogue.seatsLeft(session.remaining)}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export interface AvailabilityListProps {
  rwIds: readonly RwId[];
}

export function AvailabilityList({ rwIds }: AvailabilityListProps) {
  const state = useSessions(rwIds);
  if (state.status === 'loading') {
    return (
      <div aria-busy="true" className="space-y-2">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-5 w-full" />
        ))}
      </div>
    );
  }
  if (state.status === 'failed')
    return (
      <p className="text-body-sm text-muted-foreground">{copy.catalogue.availabilityFailed}</p>
    );
  if (state.sessions.length === 0)
    return <p className="text-body-sm text-muted-foreground">{copy.catalogue.availabilityNone}</p>;
  return <SessionDays sessions={state.sessions} showRw={rwIds.length > 1} />;
}
