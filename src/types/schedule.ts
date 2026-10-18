import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';
import type { PublicImage } from '@/types/media';

export interface PerformanceSchedule {
  id: string;
  rwId: RwId;
  title: string;
  scheduleType: EnumValue<'schedule_type'>;
  descriptionMd: string | null;
  startsAt: string;
  endsAt: string;
  venue: string | null;
  // RFC 5545 RRULE, or NULL for a one-off event.
  recurrenceRule: string | null;
  image: PublicImage | null;
  // The published package a visitor can book for it, if any.
  packageSlug: string | null;
}

// One date a schedule happens on: the schedule itself for a one-off, or one repeat of a recurring one.
export interface ScheduleOccurrence {
  schedule: PerformanceSchedule;
  startsAt: string;
  endsAt: string;
}
