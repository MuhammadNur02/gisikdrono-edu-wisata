import 'server-only';

import type { Tables } from '@/db/types';
import { toPublicImage, toRwId } from '@/lib/queries/mappers';
import { cachedPublicRead, rowsOf } from '@/lib/queries/public-read';
import { TAGS } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import type { PerformanceSchedule } from '@/types/schedule';

const SCHEDULE_COLUMNS =
  'id, rw_id, title, schedule_type, description_md, starts_at, ends_at, venue, recurrence_rule, image_path, tour_packages(slug)';

type ScheduleRow = Pick<
  Tables<'performance_schedules'>,
  | 'id'
  | 'rw_id'
  | 'title'
  | 'schedule_type'
  | 'description_md'
  | 'starts_at'
  | 'ends_at'
  | 'venue'
  | 'recurrence_rule'
  | 'image_path'
  // The linked package arrives only while it is published (tour_packages_public_read).
> & { tour_packages: Pick<Tables<'tour_packages'>, 'slug'> | null };

function toPerformanceSchedule(row: ScheduleRow): PerformanceSchedule {
  return {
    id: row.id,
    rwId: toRwId(row.rw_id),
    title: row.title,
    scheduleType: row.schedule_type,
    descriptionMd: row.description_md,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    venue: row.venue,
    recurrenceRule: row.recurrence_rule,
    image: toPublicImage(row.image_path, row.title),
    packageSlug: row.tour_packages?.slug ?? null,
  };
}

// Every published schedule in time order. Past one-off events stay in the list because a recurring one
// started in the past too; the jadwal page (Task P2.4.03) decides what is still ahead, at request time.
export const listSchedules = cachedPublicRead(
  async (): Promise<PerformanceSchedule[]> => {
    const result = await createSupabaseAnonClient()
      .from('performance_schedules')
      .select(SCHEDULE_COLUMNS)
      .order('starts_at');
    return rowsOf(result, 'performance_schedules').map(toPerformanceSchedule);
  },
  ['schedules', 'list'],
  [TAGS.schedules],
);
