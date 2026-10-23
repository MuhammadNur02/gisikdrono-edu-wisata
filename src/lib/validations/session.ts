import { z } from 'zod';

import { SESSION_LIMITS, WEEKDAYS, type Weekday } from '@/config/sessions';
import { DB_ENUMS } from '@/db/enums';
import { sessionsCopy } from '@/lib/copy/sessions';
import {
  contentText,
  isCalendarMoment,
  optionalContentText,
  rowIdSchema,
} from '@/lib/validations/content';

// /dashboard/sessions (Task P4.3.04, docs/PRD.md FR-ADMIN-03): the weekly pattern and the sessions of one RW. The RW is
// never part of a form: the action takes the admin's own, or the one the superadmin's RwSwitcher points at. Every
// schema is .strict() and shared by the form and its Server Action.

const messages = sessionsCopy.validation;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const VISIT_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_KEY_LENGTH = 7;
// `HH:MM`; Postgres reads a time back as `HH:MM:SS`, and the seconds are dropped.
const CLOCK_TIME_LENGTH = 5;

// A time of day as a time field writes it (`08:00`), or as Postgres read it back (`08:00:00`).
export const clockTimeSchema = z
  .string()
  .trim()
  .transform((value) => value.slice(0, CLOCK_TIME_LENGTH))
  .pipe(z.string().regex(CLOCK_TIME, messages.time));

export const visitDateSchema = z
  .string()
  .trim()
  .refine((value) => VISIT_DATE.test(value) && isCalendarMoment(value), messages.date);

export const monthKeySchema = z
  .string()
  .trim()
  .length(MONTH_KEY_LENGTH)
  .regex(MONTH_KEY, messages.month);

function endsAfterStart(times: { startTime: string; endTime: string }): boolean {
  return times.endTime > times.startTime;
}

const timeOrder = { path: ['endTime'], message: messages.endAfterStart };

const capacity = (min: number) =>
  z
    .int()
    .min(min, messages.capacity(min, SESSION_LIMITS.capacityMax))
    .max(SESSION_LIMITS.capacityMax, messages.capacity(min, SESSION_LIMITS.capacityMax));

// The weekday select works in strings; the column is a smallint (0 = Sunday).
export const WEEKDAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];
const SATURDAY_KEY: WeekdayKey = '6';

// A stored weekday as the select shows it; an unknown number reads as Saturday, the usual visiting day.
export function weekdayKeyOf(weekday: number): WeekdayKey {
  return WEEKDAY_KEYS.find((key) => key === String(weekday)) ?? SATURDAY_KEY;
}

// The stored weekday of a select key. The schema keeps the key itself so the form reads and writes one type.
export function weekdayOfKey(key: WeekdayKey): Weekday {
  return WEEKDAYS.find((day) => String(day) === key) ?? WEEKDAYS[0];
}

const templateFields = {
  weekday: z.enum(WEEKDAY_KEYS),
  label: contentText(SESSION_LIMITS.label),
  startTime: clockTimeSchema,
  endTime: clockTimeSchema,
  capacity: capacity(SESSION_LIMITS.templateCapacityMin),
  isActive: z.boolean(),
};

export const createSessionTemplateSchema = z
  .object(templateFields)
  .strict()
  .refine(endsAfterStart, timeOrder);

export const updateSessionTemplateSchema = z
  .object({ id: rowIdSchema, ...templateFields })
  .strict()
  .refine(endsAfterStart, timeOrder);

export type SessionTemplateInput = z.input<typeof createSessionTemplateSchema>;
export type SessionTemplateValues = z.output<typeof createSessionTemplateSchema>;
export type UpdateSessionTemplateValues = z.output<typeof updateSessionTemplateSchema>;

const sessionFields = {
  sessionDate: visitDateSchema,
  label: contentText(SESSION_LIMITS.label),
  startTime: clockTimeSchema,
  endTime: clockTimeSchema,
  capacity: capacity(SESSION_LIMITS.sessionCapacityMin),
  status: z.enum(DB_ENUMS.session_status),
  notes: optionalContentText(SESSION_LIMITS.notes),
};

export const createVisitSessionSchema = z
  .object(sessionFields)
  .strict()
  .refine(endsAfterStart, timeOrder);

export const updateVisitSessionSchema = z
  .object({ id: rowIdSchema, ...sessionFields })
  .strict()
  .refine(endsAfterStart, timeOrder);

export type VisitSessionInput = z.input<typeof createVisitSessionSchema>;
export type VisitSessionValues = z.output<typeof createVisitSessionSchema>;
export type UpdateVisitSessionValues = z.output<typeof updateVisitSessionSchema>;

// `Buat sesi` fills one calendar month from the weekly pattern.
export const generateSessionsSchema = z.object({ month: monthKeySchema }).strict();
export type GenerateSessionsInput = z.input<typeof generateSessionsSchema>;
