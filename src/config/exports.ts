// docs/Security.md §7.5 (DATA-06, RL-01): the bounds of a data export. rpc_create_export (Task P4.6.01) enforces the
// same caps in the database (12 months, 50 000 rows, 10 an hour); these let the form and the route (P4.6.02/03) refuse
// early with the same numbers and name the file the same way.
export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_MAX_MONTHS = 12;
// A purpose is mandatory and is kept with the exports row (AUD-04).
export const EXPORT_PURPOSE_MIN_LENGTH = 10;
export const EXPORT_PURPOSE_MAX_LENGTH = 200;

// The documents bucket's folder for exports, one folder per staff member (CLAUDE.md §6.6).
export const EXPORT_FOLDER = 'exports';
// The media types the documents bucket accepts for them (0006_storage.sql).
export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
// The audit log leaves only as CSV (rpc_create_export refuses anything else).
export const CSV_ONLY_KINDS = ['audit'] as const;

// The JSON body of POST /api/export/[kind] is a handful of short fields.
export const EXPORT_REQUEST_BODY_LIMIT_BYTES = 2048;
