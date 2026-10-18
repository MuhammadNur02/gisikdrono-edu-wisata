import { CalendarDays, MapPin } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { SCHEDULE_TYPE_LABELS } from '@/config/status';
import { formatDateLong, formatInstantTimeRange } from '@/lib/utils/dates';
import type { PerformanceSchedule } from '@/types/schedule';

export interface SchedulePreviewProps {
  schedules: readonly PerformanceSchedule[];
}

// docs/PRD.md FR-PUB-09: the next performances as a short timeline, dates and hours in WIB.
export function SchedulePreview({ schedules }: SchedulePreviewProps) {
  return (
    <ol className="divide-y divide-border rounded-xl border border-border bg-card dark:border-white/5">
      {schedules.map((schedule) => (
        <li key={schedule.id} className="grid gap-2 p-4 md:grid-cols-3 md:gap-6 md:p-5">
          <p className="flex items-start gap-2 text-body-sm">
            <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              <time dateTime={schedule.startsAt} className="block font-medium">
                {formatDateLong(schedule.startsAt)}
              </time>
              <span className="text-muted-foreground">
                {formatInstantTimeRange(schedule.startsAt, schedule.endsAt)}
              </span>
            </span>
          </p>
          <div className="space-y-1 md:col-span-2">
            <Badge variant="secondary">{SCHEDULE_TYPE_LABELS[schedule.scheduleType]}</Badge>
            <h3 className="text-h4">{schedule.title}</h3>
            {schedule.venue ? (
              <p className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
                <MapPin aria-hidden className="size-4" />
                {schedule.venue}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
