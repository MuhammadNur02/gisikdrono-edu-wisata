'use client';

import { useNow } from '@/hooks/use-now';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';

const text = copy.booking.payment.countdown;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
// docs/StyleGuide.md §5.6: the countdown turns to the warning tone in its last ten minutes.
const WARNING_MINUTES = 10;
const WARNING_SECONDS = WARNING_MINUTES * SECONDS_PER_MINUTE;
const CLOCK_DIGITS = 2;

function twoDigits(value: number): string {
  return String(value).padStart(CLOCK_DIGITS, '0');
}

// mm:ss, with the hours in front for an institution's day-long hold.
function clockOf(secondsLeft: number): string {
  const hours = Math.floor(secondsLeft / SECONDS_PER_HOUR);
  const minutes = Math.floor((secondsLeft % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = secondsLeft % SECONDS_PER_MINUTE;
  const clock = `${twoDigits(minutes)}:${twoDigits(seconds)}`;
  return hours > 0 ? `${twoDigits(hours)}:${clock}` : clock;
}

// The CountdownExpiry of docs/StyleGuide.md §5.6 (Task P3.7.03, A7): it counts down to the deadline the server wrote
// once (BOOK-14) and decides nothing; the server refuses a late payment page itself. The ticking clock is for the eye,
// while a screen reader hears the minutes left once a minute through a polite live region, not every second.
export function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const now = useNow(MS_PER_SECOND);
  const secondsLeft = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / MS_PER_SECOND));
  const isOver = secondsLeft === 0;
  return (
    <div
      className={cn(
        'space-y-1 rounded-xl border p-4',
        secondsLeft < WARNING_SECONDS ? 'border-warning bg-warning-soft/40' : 'border-border',
      )}
    >
      <p className="text-caption font-medium text-muted-foreground">{text.label}</p>
      <p aria-hidden className="text-h2 tabular-nums" suppressHydrationWarning>
        {isOver ? text.over : clockOf(secondsLeft)}
      </p>
      <p className="sr-only" aria-live="polite" suppressHydrationWarning>
        {isOver ? text.over : text.spoken(Math.ceil(secondsLeft / SECONDS_PER_MINUTE))}
      </p>
    </div>
  );
}
