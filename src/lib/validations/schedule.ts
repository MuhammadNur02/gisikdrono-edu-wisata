import { z } from 'zod';

import { CMS_LIMITS } from '@/config/cms';
import { DB_ENUMS } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import {
  contentText,
  imagePathSchema,
  jakartaDateTimeSchema,
  optionalContentText,
  publishableStatusSchema,
  rowIdSchema,
} from '@/lib/validations/content';

// /dashboard/schedules (docs/PRD.md FR-ADMIN-13): RW 08's performances. The RW is never part of the form: schedules
// are RW 08's (SCHEDULE_RW_ID). A recurrence rule is checked here for its outline only, so rrule stays out of the
// browser; the service parses it with rrule, as the public schedule page does.

const messages = copy.cms.validation;
// RFC 5545: FREQ first, then KEY=VALUE parts, with or without the RRULE: prefix.
const RRULE_OUTLINE = /^(?:RRULE:)?FREQ=(?:DAILY|WEEKLY|MONTHLY|YEARLY)(?:;[A-Z]+=[A-Z0-9,+:-]+)*$/;

const scheduleFields = {
  title: contentText(CMS_LIMITS.scheduleTitle),
  scheduleType: z.enum(DB_ENUMS.schedule_type),
  descriptionMd: optionalContentText(CMS_LIMITS.longText),
  startsAt: jakartaDateTimeSchema,
  endsAt: jakartaDateTimeSchema,
  venue: optionalContentText(CMS_LIMITS.venue),
  recurrenceRule: optionalContentText(CMS_LIMITS.recurrenceRule).refine(
    (rule) => rule === null || RRULE_OUTLINE.test(rule),
    messages.recurrence,
  ),
  imagePath: imagePathSchema,
  packageId: rowIdSchema.nullable(),
  status: publishableStatusSchema,
};

function endsAfterStart(schedule: { startsAt: string; endsAt: string }): boolean {
  return Date.parse(schedule.endsAt) > Date.parse(schedule.startsAt);
}

const timeOrder = { path: ['endsAt'], message: messages.endAfterStart };

// A new schedule gets its id from the database; its photo is a gallery photo of RW 08, which needs no row folder.
export const createScheduleSchema = z
  .object(scheduleFields)
  .strict()
  .refine(endsAfterStart, timeOrder);

export const updateScheduleSchema = z
  .object({ id: rowIdSchema, ...scheduleFields })
  .strict()
  .refine(endsAfterStart, timeOrder);

export type ScheduleInput = z.input<typeof createScheduleSchema>;
export type ScheduleValues = z.output<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.input<typeof updateScheduleSchema>;
export type UpdateScheduleValues = z.output<typeof updateScheduleSchema>;
