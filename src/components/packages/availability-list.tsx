'use client';

import { ChevronLeft, ChevronRight, CircleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  AvailabilityDays,
  SessionOptions,
  type SessionRow,
} from '@/components/packages/availability-days';
import { Skeleton } from '@/components/ui/skeleton';
import type { RwId } from '@/config/rw';
import { availabilityCopy as text } from '@/lib/copy/catalogue-ui';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { groupSessionsByDay } from '@/lib/utils/availability';
import { upcomingVisitDates } from '@/lib/utils/dates';
import type { RwBadge } from '@/types/rw-unit';

// docs/PRD.md FR-PUB-12, FR-BOOK-02 (DESIGN-SPEC §3.5): the next 14 days of open sessions, read in the browser from the
// public view and read again every 15 seconds, so the seats left are never stale. Booking re-checks everything on
// the server.
const PREVIEW_DAYS = 14;
const REFRESH_MS = 15_000;
const DAYS_PER_PAGE = 5;
const SKELETON_CELLS = 5;

type LoadState =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; sessions: SessionRow[] };

async function loadSessions(rwIds: readonly RwId[]): Promise<SessionRow[]> {
  const { from, to } = upcomingVisitDates(PREVIEW_DAYS);
  const { data, error } = await createSupabaseBrowserClient()
    .from('v_session_availability')
    .select('id, rw_id, label, session_date, start_time, end_time, remaining, capacity')
    .in('rw_id', [...rwIds])
    .gte('session_date', from)
    .lte('session_date', to)
    .order('session_date')
    .order('start_time');
  if (error) throw new Error(error.code);
  // Every column of a view is nullable to PostgREST; a row missing one is skipped.
  return data.flatMap((row) =>
    row.id && row.rw_id !== null && row.session_date && row.start_time && row.end_time
      ? [
          {
            id: row.id,
            rwId: row.rw_id,
            label: row.label,
            sessionDate: row.session_date,
            startTime: row.start_time,
            endTime: row.end_time,
            remaining: row.remaining ?? 0,
            capacity: row.capacity,
          },
        ]
      : [],
  );
}

// The first load, then a quiet refresh every 15 s; a failed refresh keeps the seats already shown.
function useSessions(rwIds: readonly RwId[]): [LoadState, () => void] {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const key = rwIds.join(',');
  const load = useCallback(() => {
    loadSessions(key.split(',').map(Number)).then(
      (sessions) => {
        setState({ status: 'ready', sessions });
      },
      () => {
        setState((previous) => (previous.status === 'ready' ? previous : { status: 'failed' }));
      },
    );
  }, [key]);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [load]);
  return [state, load];
}

function LoadingCells() {
  return (
    <div aria-busy="true" className="grid grid-cols-5 gap-2">
      {Array.from({ length: SKELETON_CELLS }, (_, index) => (
        <Skeleton key={index} className="h-18 rounded-md" />
      ))}
    </div>
  );
}

// The inline error of DESIGN-SPEC §3.14: the danger tint, the icon and an underlined `Coba lagi`.
function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="flex items-center gap-2.5 rounded-md bg-danger-soft px-3.5 py-3 text-body-sm text-danger-soft-foreground">
      <CircleAlert aria-hidden className="size-4.5 shrink-0" />
      {text.failed}{' '}
      <button
        type="button"
        onClick={onRetry}
        className="font-semibold underline underline-offset-3"
      >
        {text.retry}
      </button>
    </p>
  );
}

interface PagerProps {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}

function Pager({ page, pageCount, onPage }: PagerProps) {
  const buttonClass =
    'inline-flex size-8 items-center justify-center rounded-full border border-border-strong bg-card transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 max-md:size-11';
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        aria-label={text.previous}
        disabled={page === 0}
        onClick={() => {
          onPage(page - 1);
        }}
        className={buttonClass}
      >
        <ChevronLeft aria-hidden className="size-4" />
      </button>
      <button
        type="button"
        aria-label={text.next}
        disabled={page >= pageCount - 1}
        onClick={() => {
          onPage(page + 1);
        }}
        className={buttonClass}
      >
        <ChevronRight aria-hidden className="size-4" />
      </button>
    </div>
  );
}

function Header({ pager }: { pager: PagerProps | null }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <h2 id="ketersediaan-judul" className="text-body font-semibold">
          {text.title}
        </h2>
        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-success motion-safe:animate-pulse"
          />
          {text.live}
        </p>
      </div>
      {pager ? <Pager {...pager} /> : null}
    </div>
  );
}

function ReadySessions({ sessions, rws }: { sessions: SessionRow[]; rws: readonly RwBadge[] }) {
  const days = groupSessionsByDay(sessions);
  const [page, setPage] = useState(0);
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const pageCount = Math.ceil(days.length / DAYS_PER_PAGE);
  const shownDays = days.slice(page * DAYS_PER_PAGE, (page + 1) * DAYS_PER_PAGE);
  const chosen =
    days.find((day) => day.date === chosenDate) ??
    shownDays.find((day) => day.remaining > 0) ??
    shownDays[0];
  if (!chosen)
    return (
      <>
        <Header pager={null} />
        <p className="text-body-sm text-muted-foreground">{text.none}</p>
      </>
    );
  return (
    <>
      <Header pager={pageCount > 1 ? { page, pageCount, onPage: setPage } : null} />
      <AvailabilityDays days={shownDays} chosenDate={chosen.date} onChoose={setChosenDate} />
      <SessionOptions day={chosen} rws={rws} />
    </>
  );
}

export interface AvailabilityListProps {
  rws: readonly RwBadge[];
}

export function AvailabilityList({ rws }: AvailabilityListProps) {
  const [state, reload] = useSessions(rws.map((rw) => rw.id));
  if (state.status === 'ready') return <ReadySessions sessions={state.sessions} rws={rws} />;
  return (
    <>
      <Header pager={null} />
      {state.status === 'loading' ? <LoadingCells /> : <LoadFailed onRetry={reload} />}
    </>
  );
}
