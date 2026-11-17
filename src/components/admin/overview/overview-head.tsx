import { Download } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { EXPORTS_PATH } from '@/config/dashboard';
import { copy } from '@/lib/copy/id';
import { formatClock, formatDateLong, jakartaHour } from '@/lib/utils/dates';

const text = copy.dashboard.overview;

// The hours each greeting starts at, Semarang time.
const MIDDAY_HOUR = 11;
const AFTERNOON_HOUR = 15;
const EVENING_HOUR = 18;
const MORNING_HOUR = 4;

function greetingAt(hour: number): string {
  if (hour >= EVENING_HOUR || hour < MORNING_HOUR) return text.greetings.evening;
  if (hour >= AFTERNOON_HOUR) return text.greetings.afternoon;
  if (hour >= MIDDAY_HOUR) return text.greetings.midday;
  return text.greetings.morning;
}

export interface OverviewHeadProps {
  // When the page was rendered, an ISO instant.
  now: string;
  // How many kinds of work wait (the Perlu tindakan list), or null when it could not be read.
  actionCount: number | null;
  canExport: boolean;
}

// The overview's title (Dasbor Gelap): the date and time, a greeting that says how much waits, and `Ekspor`.
export function OverviewHead({ now, actionCount, canExport }: OverviewHeadProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-caption font-medium text-muted-foreground">
          {text.dateLine(formatDateLong(now), formatClock(now))}
        </p>
        <h1 className="text-h3 font-bold text-foreground">
          {text.headline(greetingAt(jakartaHour(now)), actionCount)}
        </h1>
      </div>
      {canExport ? (
        <Button asChild variant="outline" size="sm">
          <Link href={EXPORTS_PATH}>
            <Download aria-hidden />
            {text.exportLink}
          </Link>
        </Button>
      ) : null}
    </header>
  );
}
