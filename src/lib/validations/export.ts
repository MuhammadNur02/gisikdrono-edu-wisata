import { z } from 'zod';

import {
  CSV_ONLY_KINDS,
  EXPORT_FORMATS,
  EXPORT_MAX_MONTHS,
  EXPORT_PURPOSE_MAX_LENGTH,
  EXPORT_PURPOSE_MIN_LENGTH,
} from '@/config/exports';
import { RW_ID_MAX, RW_ID_MIN } from '@/config/rw';
import { DB_ENUMS } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { freeTextSchema } from '@/lib/validations/free-text';
import { visitDateSchema } from '@/lib/validations/session';

// docs/Security.md §7.5 (Task P4.6.02/03): what a staff member asks to export. Kind and format, a period of at most
// 12 months, an optional RW and a mandatory purpose; who may export which kind is decided by the guards and
// rpc_create_export, never by this schema. Shared by the dashboard form and api/export/[kind].

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
    // The superadmin may narrow to one RW; an RW admin's RW is always their own, whatever is sent (export_scope).
    rwId: z.number().int().min(RW_ID_MIN).max(RW_ID_MAX).nullable().default(null),
    purpose: freeTextSchema(EXPORT_PURPOSE_MAX_LENGTH, { tooLong: messages.purposeTooLong }).pipe(
      z.string().min(EXPORT_PURPOSE_MIN_LENGTH, messages.purposeTooShort),
    ),
  })
  .strict()
  .refine(({ from, to }) => from <= to, { path: ['to'], message: messages.periodOrder })
  .refine(spansAtMostMaxMonths, { path: ['to'], message: messages.periodTooLong })
  .refine(
    ({ kind, format }) => !(CSV_ONLY_KINDS as readonly string[]).includes(kind) || format === 'csv',
    {
      path: ['format'],
      message: messages.csvOnly,
    },
  );

export type ExportRequest = z.infer<typeof exportRequestSchema>;
export type ExportRequestInput = z.input<typeof exportRequestSchema>;

// POST /api/export/[kind]: the kind comes from the address, the rest from the JSON body; a kind in the body is
// replaced by the address's, so the two can never disagree.
export function exportBodySchemaFor(kind: string) {
  return z.preprocess(
    (body) =>
      typeof body === 'object' && body !== null && !Array.isArray(body) ? { ...body, kind } : body,
    exportRequestSchema,
  );
}
