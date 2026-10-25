'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { formatDateLong, formatTimeRange } from '@/lib/utils/dates';
import type { ActionResult } from '@/types/action-result';
import type { WeatherOption } from '@/types/booking-hub';

export type RescheduleBookingAction = (
  input: unknown,
) => Promise<ActionResult<{ visitDate: string }>>;

export interface WeatherRescheduleProps {
  bookingCode: string;
  legs: { rwName: string; options: WeatherOption[] }[];
  action: RescheduleBookingAction;
  // Labels come from the server component that renders this island.
  labels: {
    pickDay: string;
    pickSession: string[];
    noOptions: string;
    move: string;
    moved: string;
  };
}

// The days every leg has a session on, since a combo's legs take one day (internal.reschedule_for_weather).
function sharedDays(legs: WeatherRescheduleProps['legs']): string[] {
  const [first, ...rest] = legs;
  if (!first) return [];
  const days = new Set(first.options.map((option) => option.sessionDate));
  return [...days]
    .filter((day) => rest.every((leg) => leg.options.some((option) => option.sessionDate === day)))
    .sort();
}

const CHOICE =
  'flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border-strong bg-card px-4 py-2.5 text-body-sm transition-colors duration-150 ease-out-soft has-checked:border-primary has-checked:bg-primary-tint has-checked:ring-1 has-checked:ring-primary';

function SessionChoices(props: {
  leg: WeatherRescheduleProps['legs'][number];
  day: string;
  legIndex: number;
  label: string;
  chosen: string | undefined;
  onChoose: (sessionId: string) => void;
}) {
  const sessions = props.leg.options.filter((option) => option.sessionDate === props.day);
  return (
    <fieldset className="space-y-2.5">
      <legend className="text-label-sm font-semibold">{props.label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {sessions.map((session) => (
          <label key={session.sessionId} className={CHOICE}>
            <input
              type="radio"
              name={`weather-leg-${String(props.legIndex)}`}
              value={session.sessionId}
              checked={props.chosen === session.sessionId}
              onChange={() => {
                props.onChoose(session.sessionId);
              }}
              className="size-4 accent-primary"
            />
            <span>
              {session.label ? `${session.label} · ` : ''}
              <span className="tabular-nums">
                {formatTimeRange(session.startTime, session.endTime)}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function DayChoices(props: {
  days: string[];
  day: string | undefined;
  label: string;
  onChoose: (day: string) => void;
}) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="text-label-sm font-semibold">{props.label}</legend>
      <div className="flex flex-wrap gap-2">
        {props.days.map((each) => (
          <label key={each} className={CHOICE}>
            <input
              type="radio"
              name="weather-day"
              value={each}
              checked={props.day === each}
              onChange={() => {
                props.onChoose(each);
              }}
              className="size-4 accent-primary"
            />
            {formatDateLong(each)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Outcome({ message }: { message: { tone: 'error' | 'done'; text: string } }) {
  return (
    <p
      role={message.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-xl p-3 text-body-sm',
        message.tone === 'error'
          ? 'bg-danger-soft text-danger-soft-foreground'
          : 'bg-success-soft text-success-soft-foreground',
      )}
    >
      {message.text}
    </p>
  );
}

function useMove(props: WeatherRescheduleProps, sessionIds: (string | undefined)[]) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: 'error' | 'done'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const move = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await props.action({ bookingCode: props.bookingCode, sessionIds });
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error.message });
        return;
      }
      setMessage({ tone: 'done', text: props.labels.moved });
      router.refresh();
    });
  };
  return { message, isPending, move };
}

// docs/PRD.md FR-BOOK-24 (A17): after a weather notice, a new day and one session per leg; the database checks the
// window, the count and the seats, and moves seats and tickets in one transaction.
export function WeatherReschedule(props: WeatherRescheduleProps) {
  const { legs, labels } = props;
  const days = sharedDays(legs);
  const [day, setDay] = useState<string | undefined>(undefined);
  const [chosen, setChosen] = useState<Record<number, string>>({});
  const sessionIds = legs.map((_, index) => chosen[index]);
  const { message, isPending, move } = useMove(props, sessionIds);
  const pickDay = (each: string) => {
    setDay(each);
    setChosen({});
  };
  if (days.length === 0) return <p className="text-body-sm text-ink-2">{labels.noOptions}</p>;
  return (
    <div className="space-y-4">
      <DayChoices days={days} day={day} label={labels.pickDay} onChoose={pickDay} />
      {day &&
        legs.map((leg, index) => (
          <SessionChoices
            key={leg.rwName}
            leg={leg}
            day={day}
            legIndex={index}
            label={labels.pickSession[index] ?? leg.rwName}
            chosen={chosen[index]}
            onChoose={(sessionId) => {
              setChosen((before) => ({ ...before, [index]: sessionId }));
            }}
          />
        ))}
      {message && <Outcome message={message} />}
      <Button disabled={!day || !sessionIds.every(Boolean)} loading={isPending} onClick={move}>
        {labels.move}
      </Button>
    </div>
  );
}
