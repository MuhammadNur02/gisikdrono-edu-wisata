'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { formatDateLong, formatTimeRange } from '@/lib/utils/dates';
import type { ActionResult } from '@/types/action-result';
import type { WeatherOption } from '@/types/booking-hub';

export type RescheduleBookingAction = (
  input: unknown,
) => Promise<ActionResult<{ visitDate: string }>>;

export interface WeatherRescheduleProps {
  bookingCode: string;
  // Where the one leg the notice stopped may go (decision of 2026-10-25 on the weather, rule 3).
  options: WeatherOption[];
  action: RescheduleBookingAction;
  // Labels come from the server component that renders this island, so it ships no copy file.
  labels: { pickDay: string; pickSession: string; noOptions: string; move: string; moved: string };
}

const CHOICE =
  'flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border-strong bg-card px-4 py-2.5 text-body-sm transition-colors duration-150 ease-out-soft has-checked:border-primary has-checked:bg-primary-tint has-checked:ring-1 has-checked:ring-primary';

function daysOf(options: WeatherOption[]): string[] {
  return [...new Set(options.map((option) => option.sessionDate))].sort();
}

function Choice(props: {
  name: string;
  value: string;
  isChecked: boolean;
  onChoose: () => void;
  children: ReactNode;
}) {
  return (
    <label className={CHOICE}>
      <input
        type="radio"
        name={props.name}
        value={props.value}
        checked={props.isChecked}
        onChange={props.onChoose}
        className="size-4 accent-primary"
      />
      {props.children}
    </label>
  );
}

function SessionChoices(props: {
  options: WeatherOption[];
  label: string;
  chosen: string | undefined;
  onChoose: (sessionId: string) => void;
}) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="text-label-sm font-semibold">{props.label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {props.options.map((option) => (
          <Choice
            key={option.sessionId}
            name="weather-session"
            value={option.sessionId}
            isChecked={props.chosen === option.sessionId}
            onChoose={() => {
              props.onChoose(option.sessionId);
            }}
          >
            <span>
              {option.label ? `${option.label} · ` : ''}
              <span className="tabular-nums">
                {formatTimeRange(option.startTime, option.endTime)}
              </span>
            </span>
          </Choice>
        ))}
      </div>
    </fieldset>
  );
}

function DayChoices(props: {
  days: string[];
  label: string;
  chosen: string | undefined;
  onChoose: (day: string) => void;
}) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="text-label-sm font-semibold">{props.label}</legend>
      <div className="flex flex-wrap gap-2">
        {props.days.map((each) => (
          <Choice
            key={each}
            name="weather-day"
            value={each}
            isChecked={props.chosen === each}
            onChoose={() => {
              props.onChoose(each);
            }}
          >
            {formatDateLong(each)}
          </Choice>
        ))}
      </div>
    </fieldset>
  );
}

function Outcome({ message }: { message: { tone: 'error' | 'done'; text: string } }) {
  if (message.tone === 'error') return <FormAlert tone="danger">{message.text}</FormAlert>;
  return (
    <p
      role="status"
      className="rounded-xl bg-success-soft p-3 text-body-sm text-success-soft-foreground"
    >
      {message.text}
    </p>
  );
}

function useMove(props: WeatherRescheduleProps) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: 'error' | 'done'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const move = (sessionId: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await props.action({ bookingCode: props.bookingCode, sessionId });
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

// docs/PRD.md FR-BOOK-24 (A17): a new day, then a session on it, for the stopped leg; the database checks the window,
// the moves left and the seats, and moves the leg's seats and ticket in one transaction.
export function WeatherReschedule(props: WeatherRescheduleProps) {
  const { options, labels } = props;
  const [day, setDay] = useState<string | undefined>(undefined);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const { message, isPending, move } = useMove(props);
  if (options.length === 0) return <p className="text-body-sm text-ink-2">{labels.noOptions}</p>;
  return (
    <div className="space-y-4">
      <DayChoices
        days={daysOf(options)}
        label={labels.pickDay}
        chosen={day}
        onChoose={(each) => {
          setDay(each);
          setSessionId(undefined);
        }}
      />
      {day && (
        <SessionChoices
          options={options.filter((option) => option.sessionDate === day)}
          label={labels.pickSession}
          chosen={sessionId}
          onChoose={setSessionId}
        />
      )}
      {message && <Outcome message={message} />}
      <Button
        disabled={!sessionId}
        loading={isPending}
        onClick={() => {
          if (sessionId) move(sessionId);
        }}
      >
        {labels.move}
      </Button>
    </div>
  );
}
