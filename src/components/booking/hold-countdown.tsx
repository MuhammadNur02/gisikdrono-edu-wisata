'use client';

import { Timer } from 'lucide-react';

import { useNow } from '@/hooks/use-now';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';

const text = copy.booking.payment.countdown;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
// DESIGN-SPEC §4 Reservasi, countdown: under an hour left the pill turns from the warning tone to the danger tone.
const DANGER_SECONDS = SECONDS_PER_HOUR;
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

// The CountdownExpiry of docs/StyleGuide.md §5.6 (Task P3.7.03, A7), the timer pill of DESIGN-SPEC §3.12: it counts
// down to the deadline the server wrote once (BOOK-14) and decides nothing; the server refuses a late payment page
// itself. The digits change in place (tabular figures, no sliding), while a screen reader hears the minutes left once
// a minute through a polite live region, not every second.
export function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const now = useNow(MS_PER_SECOND);
  const secondsLeft = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / MS_PER_SECOND));
  const isOver = secondsLeft === 0;
  return (
    <p
      className={cn(
        'inline-flex min-h-10 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-full px-4 py-1.5 text-label-sm font-semibold transition-colors duration-300',
        secondsLeft < DANGER_SECONDS
          ? 'bg-danger-soft text-danger-soft-foreground'
          : 'bg-warning-soft text-warning-soft-foreground',
      )}
    >
      <Timer aria-hidden className="size-4.5 shrink-0" />
      <span>{text.label}</span>
      <span aria-hidden className="font-bold tabular-nums" suppressHydrationWarning>
        {isOver ? text.over : clockOf(secondsLeft)}
      </span>
      <span className="sr-only" aria-live="polite" suppressHydrationWarning>
        {isOver ? text.over : text.spoken(Math.ceil(secondsLeft / SECONDS_PER_MINUTE))}
      </span>
    </p>
  );
}
