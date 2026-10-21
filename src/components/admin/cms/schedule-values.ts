import { toJakartaDateTimeField } from '@/lib/utils/dates';
import type { ScheduleInput } from '@/lib/validations/schedule';
import type { ScheduleAdmin } from '@/types/cms';

export function blankSchedule(): ScheduleInput {
  return {
    title: '',
    scheduleType: 'dance_performance',
    descriptionMd: '',
    startsAt: '',
    endsAt: '',
    venue: '',
    recurrenceRule: '',
    imagePath: null,
    packageId: null,
    status: 'published',
  };
}

// The form's fields for a stored schedule; the id goes with the update action, never through a form field.
export function scheduleValues(schedule: ScheduleAdmin): ScheduleInput {
  return {
    title: schedule.title,
    scheduleType: schedule.scheduleType,
    descriptionMd: schedule.descriptionMd ?? '',
    startsAt: toJakartaDateTimeField(schedule.startsAt),
    endsAt: toJakartaDateTimeField(schedule.endsAt),
    venue: schedule.venue ?? '',
    recurrenceRule: schedule.recurrenceRule ?? '',
    imagePath: schedule.imagePath,
    packageId: schedule.packageId,
    status: schedule.status === 'published' ? 'published' : 'draft',
  };
}

// The update action's input: the form's values with the id of the row being changed.
export function withRowId(values: unknown, id: string): Record<string, unknown> {
  return typeof values === 'object' && values !== null ? { ...values, id } : { id };
}
