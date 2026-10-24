// docs/Security.md §7.5 (DATA-06, RL-01): the bounds of a data export. rpc_create_export (Task P4.6.01) enforces the
// same caps in the database; these let the form and the route refuse early with the same numbers.
export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_MAX_ROWS = 50_000;
export const EXPORT_MAX_MONTHS = 12;
// A purpose is mandatory and is kept with the exports row (AUD-04).
export const EXPORT_PURPOSE_MIN_LENGTH = 10;
export const EXPORT_PURPOSE_MAX_LENGTH = 200;
