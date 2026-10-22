'use client';

import { AlertTriangle, Check } from 'lucide-react';

import { Progress } from '@/components/ui/progress';
import { BOOKING_STEPS, type BookingStep } from '@/config/site';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';

const text = copy.booking.wizard;
const FULL_PERCENT = 100;

export interface BookingStepperProps {
  current: BookingStep;
  // The furthest step the visitor may open: every step before it passed its check.
  reachable: BookingStep;
  // Steps visited before whose check fails now, such as a session that filled meanwhile.
  invalid: readonly BookingStep[];
  onOpen: (step: BookingStep) => void;
}

type StepState = 'completed' | 'current' | 'upcoming' | 'error';

function stateOf(step: BookingStep, props: BookingStepperProps): StepState {
  const index = BOOKING_STEPS.indexOf(step);
  const currentIndex = BOOKING_STEPS.indexOf(props.current);
  if (step === props.current) return 'current';
  if (props.invalid.includes(step) && index < currentIndex) return 'error';
  return index < currentIndex ? 'completed' : 'upcoming';
}

const STATE_LABEL: Record<StepState, string> = {
  completed: text.stepDone,
  current: text.stepCurrent,
  upcoming: '',
  error: text.stepNeedsFix,
};

function StepMarker({ number, state }: { number: number; state: StepState }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full text-body-sm font-semibold tabular-nums',
        state === 'completed' && 'bg-primary text-primary-foreground',
        state === 'current' && 'bg-background text-primary ring-2 ring-primary',
        state === 'upcoming' && 'bg-muted text-muted-foreground',
        state === 'error' && 'bg-danger-soft text-danger-soft-foreground ring-2 ring-destructive',
      )}
    >
      {state === 'completed' && <Check className="size-4" />}
      {state === 'error' && <AlertTriangle className="size-4" />}
      {(state === 'current' || state === 'upcoming') && number}
    </span>
  );
}

function StepItem({ step, props }: { step: BookingStep; props: BookingStepperProps }) {
  const state = stateOf(step, props);
  const number = BOOKING_STEPS.indexOf(step) + 1;
  const isReachable = BOOKING_STEPS.indexOf(step) <= BOOKING_STEPS.indexOf(props.reachable);
  const label = (
    <>
      <StepMarker number={number} state={state} />
      <span className="text-body-sm font-medium">{text.steps[step]}</span>
      {STATE_LABEL[state] && <span className="sr-only">({STATE_LABEL[state]})</span>}
    </>
  );
  return (
    <li
      className="flex flex-1 items-center gap-3"
      aria-current={state === 'current' ? 'step' : undefined}
    >
      {isReachable && state !== 'current' ? (
        <button
          type="button"
          className="flex min-h-11 items-center gap-3 rounded-lg text-left hover:text-primary-text"
          onClick={() => {
            props.onOpen(step);
          }}
        >
          {label}
        </button>
      ) : (
        <span
          className={cn(
            'flex min-h-11 items-center gap-3',
            state === 'upcoming' && 'text-muted-foreground',
          )}
        >
          {label}
        </span>
      )}
    </li>
  );
}

// docs/StyleGuide.md §5.14: numbered steps from md up; below md, "Langkah 2/4 · Data Rombongan" over a progress bar.
// The visitor may open any step before the furthest one that passed, never one after it.
export function BookingStepper(props: BookingStepperProps) {
  const number = BOOKING_STEPS.indexOf(props.current) + 1;
  return (
    <nav aria-label={text.stepsLabel}>
      <div className="space-y-2 md:hidden">
        <p className="text-body-sm font-medium">
          {text.stepOf(number, BOOKING_STEPS.length, text.steps[props.current])}
        </p>
        <Progress value={(number / BOOKING_STEPS.length) * FULL_PERCENT} aria-hidden />
      </div>
      <ol className="hidden gap-4 md:flex">
        {BOOKING_STEPS.map((step) => (
          <StepItem key={step} step={step} props={props} />
        ))}
      </ol>
    </nav>
  );
}
