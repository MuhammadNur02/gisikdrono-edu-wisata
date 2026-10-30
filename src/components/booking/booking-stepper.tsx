'use client';

import { AlertTriangle, Check } from 'lucide-react';

import type { BookingStep } from '@/config/site';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';

const text = copy.booking.wizard;

export interface BookingStepperProps {
  // The package's steps in order: four, or three when it offers no add-on (wizardStepsOf).
  steps: readonly BookingStep[];
  current: BookingStep;
  // The furthest step the visitor may open: every step before it passed its check.
  reachable: BookingStep;
  // Steps visited before whose check fails now, such as a session that filled meanwhile.
  invalid: readonly BookingStep[];
  onOpen: (step: BookingStep) => void;
}

type StepState = 'completed' | 'current' | 'upcoming' | 'error';

function stateOf(step: BookingStep, props: BookingStepperProps): StepState {
  const index = props.steps.indexOf(step);
  const currentIndex = props.steps.indexOf(props.current);
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

const MARKER_CLASS: Record<StepState, string> = {
  completed: 'bg-success text-success-foreground',
  current: 'bg-primary text-primary-foreground',
  upcoming: 'border-control border-border-strong bg-card text-muted-foreground',
  error: 'bg-danger-soft text-danger-soft-foreground ring-2 ring-destructive',
};

const LABEL_CLASS: Record<StepState, string> = {
  completed: 'text-ink-2',
  current: 'font-semibold text-foreground',
  upcoming: 'text-muted-foreground',
  error: 'text-ink-2',
};

// DESIGN-SPEC §2.10: a 32 px circle, green with a check once done, brick with its number while current, an outlined
// paper circle ahead. The number and the check cross-fade (§4 Wizard, Progress).
function StepMarker({ number, state }: { number: number; state: StepState }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full text-label-sm font-semibold tabular-nums transition-colors duration-200 ease-out-soft',
        MARKER_CLASS[state],
      )}
    >
      {state === 'completed' && (
        <Check className="size-4 motion-safe:animate-in motion-safe:fade-in" />
      )}
      {state === 'error' && <AlertTriangle className="size-4" />}
      {(state === 'current' || state === 'upcoming') && number}
    </span>
  );
}

// The 2 px line after a step fills from the left in green once that step is done.
function StepLine({ isDone }: { isDone: boolean }) {
  return (
    <span
      aria-hidden
      className="relative mx-4 h-0.5 min-w-6 flex-1 overflow-hidden rounded-full bg-border-strong"
    >
      <span
        className={cn(
          'absolute inset-0 origin-left bg-success transition-transform duration-300 ease-out-soft',
          isDone ? 'scale-x-100' : 'scale-x-0',
        )}
      />
    </span>
  );
}

function StepItem({ step, props }: { step: BookingStep; props: BookingStepperProps }) {
  const state = stateOf(step, props);
  const index = props.steps.indexOf(step);
  const isReachable = index <= props.steps.indexOf(props.reachable);
  const isLast = index === props.steps.length - 1;
  const label = (
    <>
      <StepMarker number={index + 1} state={state} />
      <span className={cn('text-label', LABEL_CLASS[state])}>{text.steps[step]}</span>
      {STATE_LABEL[state] && <span className="sr-only">({STATE_LABEL[state]})</span>}
    </>
  );
  return (
    <li
      className={cn('flex items-center', !isLast && 'flex-1')}
      aria-current={state === 'current' ? 'step' : undefined}
    >
      {isReachable && state !== 'current' ? (
        <button
          type="button"
          className="-mx-1.5 flex min-h-11 items-center gap-2.5 rounded-md px-1.5 text-left transition-colors duration-200 hover:bg-muted"
          onClick={() => {
            props.onOpen(step);
          }}
        >
          {label}
        </button>
      ) : (
        <span className="flex min-h-11 items-center gap-2.5">{label}</span>
      )}
      {!isLast && <StepLine isDone={state === 'completed'} />}
    </li>
  );
}

const BAR_CLASS: Record<StepState, string> = {
  completed: 'bg-success',
  current: 'bg-primary',
  upcoming: 'bg-border-strong',
  error: 'bg-destructive',
};

// One 4 px bar per step under the compact count.
const BAR_COLUMNS: Record<number, string> = { 3: 'grid-cols-3', 4: 'grid-cols-4' };

// DESIGN-SPEC §2.10 mobile: "Langkah 1 dari 4" in brick, the step's name on the right, a 4 px bar per step below.
function CompactProgress(props: BookingStepperProps) {
  const number = props.steps.indexOf(props.current) + 1;
  return (
    <div className="space-y-2.5 md:hidden">
      <p className="flex items-baseline justify-between gap-4 text-label-sm font-semibold">
        <span className="text-primary-ink">{text.stepOf(number, props.steps.length)}</span>
        <span className="text-ink-2">{text.steps[props.current]}</span>
      </p>
      <span
        aria-hidden
        className={cn('grid gap-1.5', BAR_COLUMNS[props.steps.length] ?? 'grid-cols-4')}
      >
        {props.steps.map((step) => (
          <span
            key={step}
            className={cn(
              'h-1 rounded-full transition-colors duration-300 ease-out-soft',
              BAR_CLASS[stateOf(step, props)],
            )}
          />
        ))}
      </span>
    </div>
  );
}

// DESIGN-SPEC §2.10 Wizard Progress: the steps joined by lines from md; below md, the compact count over a bar each.
// The visitor may open any step before the furthest one that passed, never one after it.
export function BookingStepper(props: BookingStepperProps) {
  return (
    <nav aria-label={text.stepsLabel}>
      <CompactProgress {...props} />
      <ol className="hidden max-w-180 items-center md:flex">
        {props.steps.map((step) => (
          <StepItem key={step} step={step} props={props} />
        ))}
      </ol>
    </nav>
  );
}
