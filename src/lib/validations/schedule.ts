import { z } from 'zod';

import { CMS_LIMITS, MONTH_LENGTHS_IN_LEAP_YEAR } from '@/config/cms';
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

// /dashboard/schedules (docs/PRD.md FR-ADMIN-13): the performances of an RW that runs a schedule. The RW is never part
// of the form: the action takes the admin's own, or the one the superadmin's RwSwitcher points at. A recurrence rule is checked here for its outline only, so rrule stays out of the
// browser; the service parses it with rrule, as the public schedule page does.

const messages = copy.cms.validation;
// RFC 5545: FREQ first, then KEY=VALUE parts, with or without the RRULE: prefix.
const RRULE_OUTLINE = /^(?:RRULE:)?FREQ=(?:DAILY|WEEKLY|MONTHLY|YEARLY)(?:;[A-Z]+=[A-Z0-9,+:-]+)*$/;
const RRULE_PREFIX = 'RRULE:';
const ALL_MONTHS = MONTH_LENGTHS_IN_LEAP_YEAR.map((_length, index) => index + 1);
const LONGEST_MONTH = Math.max(...MONTH_LENGTHS_IN_LEAP_YEAR);

function ruleValues(rule: string, key: string): number[] | null {
  const part = rule
    .replace(RRULE_PREFIX, '')
    .split(';')
    .find((entry) => entry.startsWith(`${key}=`));
  return part === undefined
    ? null
    : part
        .slice(key.length + 1)
        .split(',')
        .map(Number);
}

// Finding 3 of the review of PR #18: a rule must name a day that exists, so 30 February or 31 April alone is refused
// (29 February is a real day, every fourth year). Days count from the end of the month when negative.
function namesRealDays(rule: string): boolean {
  const months = ruleValues(rule, 'BYMONTH') ?? ALL_MONTHS;
  const days = ruleValues(rule, 'BYMONTHDAY');
  if (!months.every((month) => ALL_MONTHS.includes(month))) return false;
  if (days === null) return true;
  const isDay = (day: number) =>
    Number.isInteger(day) && day !== 0 && Math.abs(day) <= LONGEST_MONTH;
  if (!days.every(isDay)) return false;
  const lengthOf = (month: number) => MONTH_LENGTHS_IN_LEAP_YEAR[month - 1] ?? 0;
  return months.some((month) => days.some((day) => Math.abs(day) <= lengthOf(month)));
}

const scheduleFields = {
  title: contentText(CMS_LIMITS.scheduleTitle),
  scheduleType: z.enum(DB_ENUMS.schedule_type),
  descriptionMd: optionalContentText(CMS_LIMITS.longText),
  startsAt: jakartaDateTimeSchema,
  endsAt: jakartaDateTimeSchema,
  venue: optionalContentText(CMS_LIMITS.venue),
  recurrenceRule: optionalContentText(CMS_LIMITS.recurrenceRule).refine(
    (rule) => rule === null || (RRULE_OUTLINE.test(rule) && namesRealDays(rule)),
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

// A new schedule gets its id from the database; its photo is a gallery photo of its RW, which needs no row folder.
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
