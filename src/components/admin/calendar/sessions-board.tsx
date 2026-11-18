'use client';

import { useState } from 'react';

import { CalendarNav } from '@/components/admin/calendar/calendar-nav';
import { SessionCalendar } from '@/components/admin/calendar/session-calendar';
import { SessionEditor, type SessionActions } from '@/components/admin/calendar/session-editor';
import { QuotaLegend, WeekCalendar } from '@/components/admin/calendar/week-calendar';
import type { SessionCalendarView, VisitSessionAdmin } from '@/types/session';

export interface SessionsBoardProps {
  view: SessionCalendarView;
  today: string;
  sessions: readonly VisitSessionAdmin[];
  actions: SessionActions;
}

// The one client island of /dashboard/sessions: which day is open in the editor. The week or month lives in the URL,
// so the rows come from the server for every one.
export function SessionsBoard({ view, today, sessions, actions }: SessionsBoardProps) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <CalendarNav view={view} today={today} />
      {view.kind === 'week' ? (
        <WeekCalendar
          weekStart={view.weekStart}
          sessions={sessions}
          today={today}
          onSelectDay={setOpenDate}
        />
      ) : (
        <SessionCalendar
          month={view.month}
          sessions={sessions}
          today={today}
          onSelectDay={setOpenDate}
        />
      )}
      <QuotaLegend />
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
