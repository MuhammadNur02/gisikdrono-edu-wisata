import { CalendarDays, MapPin } from 'lucide-react';

import { SectionLink } from '@/components/marketing/section-link';
import { Badge } from '@/components/ui/badge';
import { SCHEDULE_TYPE_LABELS } from '@/config/status';
import { formatDateLong, formatInstantTimeRange } from '@/lib/utils/dates';
import { packagePath } from '@/lib/utils/paths';
import type { ScheduleOccurrence } from '@/types/schedule';

export interface ScheduleListProps {
  occurrences: readonly ScheduleOccurrence[];
}

function ScheduleItem({ occurrence }: { occurrence: ScheduleOccurrence }) {
  const { schedule } = occurrence;
  return (
    <li className="grid gap-2 p-4 md:grid-cols-3 md:gap-6 md:p-5">
      <p className="flex items-start gap-2 text-body-sm">
        <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>
          <time dateTime={occurrence.startsAt} className="block font-medium">
            {formatDateLong(occurrence.startsAt)}
          </time>
          <span className="text-muted-foreground">
            {formatInstantTimeRange(occurrence.startsAt, occurrence.endsAt)}
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
        {schedule.packageSlug ? (
          <SectionLink href={packagePath(schedule.packageSlug)} label="Lihat paket kunjungannya" />
        ) : null}
      </div>
    </li>
  );
}

// docs/PRD.md FR-PUB-09/10: performances as a timeline, dates and hours in WIB, the bookable package linked
// when the schedule names one.
export function ScheduleList({ occurrences }: ScheduleListProps) {
  return (
    <ol className="divide-y divide-border rounded-xl border border-border bg-card dark:border-white/5">
      {occurrences.map((occurrence) => (
        <ScheduleItem
          key={`${occurrence.schedule.id}-${occurrence.startsAt}`}
          occurrence={occurrence}
        />
      ))}
    </ol>
  );
}
