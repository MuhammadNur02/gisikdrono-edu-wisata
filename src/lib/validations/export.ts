import { z } from 'zod';

import {
  EXPORT_FORMATS,
  EXPORT_MAX_MONTHS,
  EXPORT_PURPOSE_MAX_LENGTH,
  EXPORT_PURPOSE_MIN_LENGTH,
} from '@/config/exports';
import { DB_ENUMS } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { freeTextSchema } from '@/lib/validations/free-text';
import { visitDateSchema } from '@/lib/validations/session';

// docs/Security.md §7.5 (Task P4.6.02/03): what a staff member asks to export. Kind and format, a period of at most
// 12 months and a mandatory purpose; who may export which kind is decided by the guards and rpc_create_export, never
// by this schema. Shared by the export form and GET /api/export/[kind].

const messages = copy.dashboard.exports.validation;

const MONTHS_PER_YEAR = 12;
const MONTH_DIGITS = 2;

// The first visit date past the cap: 2026-03-15 → 2027-03-15. Plain calendar arithmetic on the strings, so no time
// zone can move a day; a day the later month lacks ('2027-02-29') still compares correctly as text.
function firstDayPastCap(from: string): string {
  const [yearText = '', monthText = '', dayText = ''] = from.split('-');
  const monthIndex = Number(yearText) * MONTHS_PER_YEAR + Number(monthText) - 1 + EXPORT_MAX_MONTHS;
  const year = Math.floor(monthIndex / MONTHS_PER_YEAR);
  const month = (monthIndex % MONTHS_PER_YEAR) + 1;
  return `${String(year)}-${String(month).padStart(MONTH_DIGITS, '0')}-${dayText}`;
}

function spansAtMostMaxMonths({ from, to }: { from: string; to: string }): boolean {
  return to < firstDayPastCap(from);
}

export const exportRequestSchema = z
  .object({
    kind: z.enum(DB_ENUMS.export_kind),
    format: z.enum(EXPORT_FORMATS),
    from: visitDateSchema,
    to: visitDateSchema,
    purpose: freeTextSchema(EXPORT_PURPOSE_MAX_LENGTH, { tooLong: messages.purposeTooLong }).pipe(
      z.string().min(EXPORT_PURPOSE_MIN_LENGTH, messages.purposeTooShort),
    ),
  })
  .strict()
  .refine(({ from, to }) => from <= to, { path: ['to'], message: messages.periodOrder })
  .refine(spansAtMostMaxMonths, { path: ['to'], message: messages.periodTooLong });

export type ExportRequest = z.infer<typeof exportRequestSchema>;
