import { Check, X } from 'lucide-react';

import { bookingHubCopy } from '@/lib/copy/booking-hub';
import { cn } from '@/lib/utils/cn';
import { formatDateLong, formatDateTimeShort, formatTimeRange } from '@/lib/utils/dates';
import type { BookingStatus, StatusHubView } from '@/types/booking-hub';

const text = bookingHubCopy.timeline;

type StepState = 'done' | 'current' | 'next' | 'stopped';

interface TimelineStep {
  title: string;
  hint: string | null;
  state: StepState;
}

const PAID_OR_LATER: ReadonlySet<BookingStatus> = new Set([
  'paid',
  'checked_in',
  'completed',
  'no_show',
]);
const VISITED: ReadonlySet<BookingStatus> = new Set(['checked_in', 'completed']);
const STOPPED: Partial<Record<BookingStatus, string>> = {
  cancelled: text.cancelled,
  expired: text.expired,
  refunded: text.refunded,
  no_show: text.noShow,
};

function eventTime(view: StatusHubView, status: BookingStatus): string | null {
  const event = view.events.findLast((each) => each.toStatus === status);
  return event ? formatDateTimeShort(event.occurredAt) : null;
}

function visitHint(view: StatusHubView): string {
  const [first] = view.booking.sessions;
  const session = first ? ` · ${formatTimeRange(first.startTime, first.endTime)}` : '';
  return `${formatDateLong(view.visitDate)}${session}`;
}

function stateOf(isDone: boolean, isCurrent: boolean): StepState {
  if (isDone) return 'done';
  return isCurrent ? 'current' : 'next';
}

// The road a booking takes (DESIGN-SPEC §3.11 "Perjalanan reservasi"): what happened, with when, what is happening
// now, and what comes next; a booking that stopped (cancelled, expired, refunded, no show) ends at that step.
function stepsOf(view: StatusHubView): TimelineStep[] {
  const status = view.booking.status;
  const isPaid = PAID_OR_LATER.has(status) || view.paidAt !== null;
  const steps: TimelineStep[] = [
    { title: text.created, hint: formatDateTimeShort(view.createdAt), state: 'done' },
  ];
  if (view.quotation) {
    steps.push({ title: text.quoted, hint: null, state: status === 'quoted' ? 'current' : 'done' });
  }
  if (status !== 'quoted') {
    const deadline = view.booking.expiresAt;
    steps.push({
      title: text.pending,
      hint: deadline && !isPaid ? text.pendingUntil(formatDateTimeShort(deadline)) : null,
      state: stateOf(isPaid, status === 'pending_payment'),
    });
  }
  steps.push({
    title: text.paid,
    hint: view.paidAt ? formatDateTimeShort(view.paidAt) : text.paidHint,
    state: stateOf(isPaid, false),
  });
  const stopped = STOPPED[status];
  if (stopped) {
    return [
      ...steps.filter((step) => step.state === 'done'),
      { title: stopped, hint: eventTime(view, status), state: 'stopped' },
    ];
  }
  steps.push(
    {
      title: text.visit,
      hint: visitHint(view),
      state: stateOf(VISITED.has(status), status === 'paid'),
    },
    {
      title: text.certificate,
      hint: text.certificateHint,
      state: stateOf(status === 'completed', status === 'checked_in'),
    },
  );
  return steps;
}

const MARKER: Record<StepState, string> = {
  done: 'bg-success text-success-foreground',
  current: 'bg-warning-soft ring-2 ring-warning',
  next: 'border-control border-border-strong bg-card',
  stopped: 'bg-danger-soft text-danger-soft-foreground',
};

function Marker({ state }: { state: StepState }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full',
        MARKER[state],
      )}
    >
      {state === 'done' && <Check className="size-3.5" />}
      {state === 'current' && <span className="size-2 rounded-full bg-warning" />}
      {state === 'stopped' && <X className="size-3.5" />}
    </span>
  );
}

const STATE_WORD: Partial<Record<StepState, string>> = { done: text.done, current: text.current };

// DESIGN-SPEC §2.6 Timeline: 24 px dots on a 2 px rail; done green with a check, current amber with a dot, next an
// outlined paper circle. Not animated (§4 Reservasi, Timeline).
export function BookingTimeline({ view }: { view: StatusHubView }) {
  const steps = stepsOf(view);
  return (
    <section
      aria-labelledby="hub-timeline"
      className="space-y-6 rounded-2xl border border-border bg-card p-5 md:p-7"
    >
      <h2 id="hub-timeline" className="text-h4 font-bold">
        {text.title}
      </h2>
      <ol className="space-y-0">
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0">
            {index < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  'absolute top-6 bottom-0 left-2.75 w-0.5',
                  step.state === 'done' ? 'bg-success' : 'bg-border-strong',
                )}
              />
            )}
            <Marker state={step.state} />
            <div className="min-w-0 space-y-0.5">
              <p
                className={cn(
                  'text-label leading-snug',
                  step.state === 'next' ? 'text-ink-2' : 'font-semibold text-foreground',
                )}
              >
                {step.title}
                {STATE_WORD[step.state] && (
                  <span className="sr-only"> ({STATE_WORD[step.state]})</span>
                )}
              </p>
              {step.hint && <p className="text-caption text-muted-foreground">{step.hint}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
