import { z } from 'zod';

import { DB_ENUMS } from '@/db/enums';

// The URL filters of /dashboard/security-alerts and /dashboard/audit-logs (Task P4.10.02) and the acknowledge action.
// A filter the URL spells wrongly is dropped, never an error: the page then shows everything.

const FIRST_PAGE = 1;
const ENTITY_TYPE_PATTERN = /^[a-z_]{1,40}$/;
const ENTITY_ID_MAX_LENGTH = 64;
const ENTITY_ID_PATTERN = /^[A-Za-z0-9_:/.-]+$/;

type SearchParams = Record<string, string | string[] | undefined>;

// Only the first value of a repeated parameter counts.
function firstOf(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const pageField = z.coerce.number().int().min(FIRST_PAGE).catch(FIRST_PAGE);
const isoDate = z.iso.date();

function optional<T extends z.ZodType>(schema: T) {
  return schema.optional().catch(undefined);
}

export const ALERT_STATES = ['open', 'acknowledged'] as const;
export type AlertState = (typeof ALERT_STATES)[number];

const alertFilterSchema = z.object({
  severity: optional(z.enum(DB_ENUMS.alert_severity)),
  state: optional(z.enum(ALERT_STATES)),
  page: pageField,
});

export type AlertFilter = z.output<typeof alertFilterSchema>;

export function parseAlertFilter(params: SearchParams): AlertFilter {
  return alertFilterSchema.parse({
    severity: firstOf(params, 'severity'),
    state: firstOf(params, 'state'),
    page: firstOf(params, 'page'),
  });
}

const auditFilterSchema = z
  .object({
    entity: optional(z.string().regex(ENTITY_TYPE_PATTERN)),
    entityId: optional(z.string().max(ENTITY_ID_MAX_LENGTH).regex(ENTITY_ID_PATTERN)),
    actor: optional(z.uuid()),
    from: optional(isoDate),
    to: optional(isoDate),
    page: pageField,
  })
  // A range that ends before it starts keeps only its start.
  .transform((filter) =>
    filter.from !== undefined && filter.to !== undefined && filter.to < filter.from
      ? { ...filter, to: undefined }
      : filter,
  );

export type AuditFilter = z.output<typeof auditFilterSchema>;

export function parseAuditFilter(params: SearchParams): AuditFilter {
  return auditFilterSchema.parse({
    entity: firstOf(params, 'entity'),
    entityId: firstOf(params, 'entityId'),
    actor: firstOf(params, 'actor'),
    from: firstOf(params, 'from'),
    to: firstOf(params, 'to'),
    page: firstOf(params, 'page'),
  });
}

export const acknowledgeAlertSchema = z.object({ alertId: z.uuid() }).strict();
