'use client';

import { useNow } from '@/hooks/use-now';
import { cn } from '@/lib/utils/cn';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
// DESIGN-SPEC §4 Reservasi, countdown: under an hour left the block turns from the warning tone to the danger tone.
const DANGER_SECONDS = SECONDS_PER_HOUR;
const CLOCK_DIGITS = 2;
const MINUTES_PER_HOUR = 60;

export interface HubCountdownProps {
  expiresAt: string;
  // The deadline written out in Jakarta time ("Minggu, 25 Oktober 2026, 09.12 WIB"), from the server.
  deadlineText: string;
  // Labels come from the server component that renders this island, so it ships no copy file.
  labels: {
    deadline: string;
    releases: string;
    hours: string;
    minutes: string;
    seconds: string;
    over: string;
    spokenPrefix: string;
    spokenHours: string;
    spokenMinutes: string;
  };
}

function twoDigits(value: number): string {
  return String(value).padStart(CLOCK_DIGITS, '0');
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex flex-col items-center">
      <span className="text-h1 font-display leading-none font-extrabold tabular-nums">
        {twoDigits(value)}
      </span>
      <span className="text-caption">{label}</span>
    </span>
  );
}

// "Sisa waktu pembayaran 23 jam 41 menit", once a minute.
function spokenOf(secondsLeft: number, labels: HubCountdownProps['labels']): string {
  const minutes = Math.ceil(secondsLeft / SECONDS_PER_MINUTE);
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  return hours > 0
    ? `${labels.spokenPrefix} ${String(hours)} ${labels.spokenHours} ${String(rest)} ${labels.spokenMinutes}`
    : `${labels.spokenPrefix} ${String(minutes)} ${labels.spokenMinutes}`;
}

// DESIGN-SPEC §3.11 countdown: hours, minutes and seconds to the deadline the server wrote once (BOOK-14), in place,
// tabular, never sliding; a polite live region reads the minutes once a minute. It decides nothing: the server
// releases the seats and refuses a late payment page itself.
export function HubCountdown({ expiresAt, deadlineText, labels }: HubCountdownProps) {
  const now = useNow(MS_PER_SECOND);
  const secondsLeft = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / MS_PER_SECOND));
  const isUrgent = secondsLeft < DANGER_SECONDS;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl p-5 transition-colors duration-300 md:p-6',
        isUrgent
          ? 'bg-danger-soft text-danger-soft-foreground'
          : 'bg-warning-soft text-warning-soft-foreground',
      )}
    >
      {secondsLeft === 0 ? (
        <p className="text-h4 font-bold">{labels.over}</p>
      ) : (
        <p aria-hidden className="flex items-start gap-4" suppressHydrationWarning>
          <Unit value={Math.floor(secondsLeft / SECONDS_PER_HOUR)} label={labels.hours} />
          <Unit
            value={Math.floor((secondsLeft % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)}
            label={labels.minutes}
          />
          <Unit value={secondsLeft % SECONDS_PER_MINUTE} label={labels.seconds} />
        </p>
      )}
      <p className="sr-only" aria-live="polite" suppressHydrationWarning>
        {secondsLeft === 0 ? labels.over : spokenOf(secondsLeft, labels)}
      </p>
      <div className="min-w-0 space-y-0.5 border-current/20 md:border-l md:pl-6">
        <p className="text-label-sm font-semibold">{labels.deadline}</p>
        <p className="text-body font-semibold text-foreground">{deadlineText}</p>
        <p className="text-body-sm">{labels.releases}</p>
      </div>
    </div>
  );
}
