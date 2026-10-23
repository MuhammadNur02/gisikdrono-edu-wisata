'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { SessionCalendar } from '@/components/admin/calendar/session-calendar';
import { SessionEditor, type SessionActions } from '@/components/admin/calendar/session-editor';
import { Button } from '@/components/ui/button';
import { MONTH_PARAM, SESSIONS_PATH } from '@/config/sessions';
import { copy } from '@/lib/copy/id';
import { monthLabel, shiftMonth } from '@/lib/utils/sessions';
import type { VisitSessionAdmin } from '@/types/session';

const text = copy.sessions;

export interface SessionsBoardProps {
  month: string;
  today: string;
  sessions: readonly VisitSessionAdmin[];
  actions: SessionActions;
}

function monthHref(month: string): string {
  return `${SESSIONS_PATH}?${new URLSearchParams({ [MONTH_PARAM]: month }).toString()}`;
}

function MonthNav({ month, today }: { month: string; today: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-h3 capitalize">{monthLabel(month)}</h2>
      <div className="flex items-center gap-1">
        <Button asChild variant="outline" size="sm">
          <Link href={monthHref(today.slice(0, 'YYYY-MM'.length))}>{text.today}</Link>
        </Button>
        <Button asChild variant="outline" size="icon" aria-label={text.previousMonth}>
          <Link href={monthHref(shiftMonth(month, -1))}>
            <ChevronLeft aria-hidden />
          </Link>
        </Button>
        <Button asChild variant="outline" size="icon" aria-label={text.nextMonth}>
          <Link href={monthHref(shiftMonth(month, 1))}>
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// The one client island of /dashboard/sessions: which day is open in the editor. The month lives in the URL, so
// the rows come from the server for every month.
export function SessionsBoard({ month, today, sessions, actions }: SessionsBoardProps) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <MonthNav month={month} today={today} />
      <SessionCalendar month={month} sessions={sessions} today={today} onSelectDay={setOpenDate} />
      <SessionEditor
        date={openDate}
        sessions={sessions.filter((session) => session.sessionDate === openDate)}
        actions={actions}
        onClose={() => {
          setOpenDate(null);
        }}
      />
    </div>
  );
}
