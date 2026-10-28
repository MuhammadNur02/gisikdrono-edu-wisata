'use client';

import { useEffect, useState } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { walkInCopy } from '@/lib/copy/walk-in';
import { formatDateShort, formatTimeRange } from '@/lib/utils/dates';
import type { ActionResult } from '@/types/action-result';
import type { BookableLeg } from '@/types/session';

const text = walkInCopy;

export type WalkInSessionsAction = (input: unknown) => Promise<ActionResult<BookableLeg[]>>;

type LegsState =
  | { status: 'loading' }
  | { status: 'ready'; legs: BookableLeg[] }
  | { status: 'failed'; message: string };

// The open sessions of each RW the package visits, read through the server whenever the package changes.
function useLegs(action: WalkInSessionsAction, packageId: string): LegsState {
  const [state, setState] = useState<LegsState>({ status: 'loading' });
  useEffect(() => {
    let isCurrent = true;
    setState({ status: 'loading' });
    void action({ packageId }).then((result) => {
      if (!isCurrent) return;
      setState(
        result.ok
          ? { status: 'ready', legs: result.data }
          : { status: 'failed', message: result.error.message },
      );
    });
    return () => {
      isCurrent = false;
    };
  }, [action, packageId]);
  return state;
}

function LegSelect(props: {
  leg: BookableLeg;
  value: string;
  onChange: (sessionId: string) => void;
}) {
  const id = `walk-in-session-${String(props.leg.rw.id)}`;
  if (props.leg.sessions.length === 0) return <FormAlert tone="info">{text.noSessions}</FormAlert>;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{text.session(props.leg.rw.label)}</Label>
      <Select value={props.value} onValueChange={props.onChange}>
        <SelectTrigger id={id} className="min-h-11 w-full">
          <SelectValue placeholder={text.sessionPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {props.leg.sessions.map((session) => (
            <SelectItem key={session.id} value={session.id} disabled={session.remaining <= 0}>
              {text.sessionOption(
                formatDateShort(session.sessionDate),
                formatTimeRange(session.startTime, session.endTime),
                session.remaining,
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export interface WalkInSessionsProps {
  packageId: string;
  action: WalkInSessionsAction;
  // One session id per leg, in leg order; '' where none is chosen yet.
  value: readonly string[];
  onChange: (sessionIds: string[]) => void;
  error?: string;
}

export function WalkInSessions({ packageId, action, value, onChange, error }: WalkInSessionsProps) {
  const state = useLegs(action, packageId);
  if (state.status === 'loading') return <p className="text-body-sm text-muted-foreground">…</p>;
  if (state.status === 'failed') return <FormAlert tone="danger">{state.message}</FormAlert>;
  return (
    <div className="space-y-4">
      {state.legs.map((leg, index) => (
        <LegSelect
          key={leg.rw.id}
          leg={leg}
          value={value[index] ?? ''}
          onChange={(sessionId) => {
            const next = state.legs.map((_, legIndex) => value[legIndex] ?? '');
            next[index] = sessionId;
            onChange(next);
          }}
        />
      ))}
      {error ? (
        <p role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
