'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { OccupancyChip } from '@/components/admin/calendar/occupancy-chip';
import { SessionForm, type SessionAction } from '@/components/admin/calendar/session-form';
import { RemoveButton } from '@/components/admin/cms/remove-button';
import { ResponsiveSheet } from '@/components/admin/shell/responsive-sheet';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy/id';
import { formatDateLong, formatTimeRange } from '@/lib/utils/dates';
import type { ActionResult } from '@/types/action-result';
import type { VisitSessionAdmin } from '@/types/session';

const text = copy.sessions;

export interface SessionActions {
  create: SessionAction;
  update: SessionAction;
  remove: (input: unknown) => Promise<ActionResult<null>>;
}

export interface SessionEditorProps {
  // The day being edited, or null while the sheet is closed.
  date: string | null;
  sessions: readonly VisitSessionAdmin[];
  actions: SessionActions;
  onClose: () => void;
}

function SessionSummary({ session }: { session: VisitSessionAdmin }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="space-y-1">
        <p className="text-body font-medium">
          {session.label}{' '}
          <span className="text-body-sm font-normal text-muted-foreground tabular-nums">
            {formatTimeRange(session.startTime, session.endTime)}
          </span>
        </p>
        <OccupancyChip reservedPax={session.reservedPax} capacity={session.capacity} />
        {session.checkedInPax > 0 ? (
          <p className="text-caption text-muted-foreground">
            {text.checkedIn(session.checkedInPax)}
          </p>
        ) : null}
      </div>
      <StatusBadge kind="session_status" value={session.status} />
    </div>
  );
}

interface SessionCardProps {
  session: VisitSessionAdmin;
  actions: SessionActions;
  onSaved: () => void;
}

function SessionCard({ session, actions, onSaved }: SessionCardProps) {
  return (
    <section
      aria-label={session.label}
      className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-card"
    >
      <SessionSummary session={session} />
      <SessionForm
        sessionDate={session.sessionDate}
        session={session}
        action={actions.update}
        onSaved={onSaved}
      />
      {session.reservedPax === 0 ? (
        <RemoveButton
          id={session.id}
          noun={text.title}
          name={session.label}
          action={actions.remove}
        />
      ) : (
        // `Batalkan hold` voids an unpaid hold through cancel_booking, which lands with the booking lane (P4.3.08).
        <p className="text-caption text-muted-foreground">{text.editor.cancelHoldHint}</p>
      )}
    </section>
  );
}

interface AddSessionProps {
  date: string;
  action: SessionAction;
  onSaved: () => void;
}

// `Tambah sesi`: a button until pressed, then the blank form for the day.
function AddSession({ date, action, onSaved }: AddSessionProps) {
  const [isAdding, setIsAdding] = useState(false);
  if (!isAdding) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => {
          setIsAdding(true);
        }}
      >
        <Plus aria-hidden />
        {text.editor.add}
      </Button>
    );
  }
  return (
    <section
      aria-label={text.editor.addTitle}
      className="space-y-4 rounded-xl border border-dashed border-border p-4"
    >
      <h3 className="text-h4">{text.editor.addTitle}</h3>
      <SessionForm
        sessionDate={date}
        session={null}
        action={action}
        onSaved={() => {
          setIsAdding(false);
          onSaved();
        }}
      />
    </section>
  );
}

// docs/StyleGuide.md §6.8: the sessions of one day, each with its own form, and `Tambah sesi` at the end. A save
// refreshes the page's rows; the sheet stays on the same day.
export function SessionEditor({ date, sessions, actions, onClose }: SessionEditorProps) {
  const router = useRouter();
  const refresh = () => {
    router.refresh();
  };
  return (
    <ResponsiveSheet
      open={date !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={date === null ? '' : text.editor.title(formatDateLong(date))}
      description={text.editor.description}
    >
      <div className="space-y-4">
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} actions={actions} onSaved={refresh} />
        ))}
        {sessions.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{text.noSessions}</p>
        ) : null}
        {date !== null ? (
          <AddSession date={date} action={actions.create} onSaved={refresh} />
        ) : null}
      </div>
    </ResponsiveSheet>
  );
}
