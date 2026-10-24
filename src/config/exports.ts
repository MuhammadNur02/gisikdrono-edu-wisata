// docs/Security.md §7.5 (DATA-06, RL-01): the bounds of a data export. rpc_create_export (Task P4.6.01) enforces the
// same caps in the database (50 000 rows among them); these let the form and the route of P4.6.02/03, still to
// come, refuse early with the same numbers.
export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;

export const EXPORT_MAX_MONTHS = 12;
// A purpose is mandatory and is kept with the exports row (AUD-04).
export const EXPORT_PURPOSE_MIN_LENGTH = 10;
export const EXPORT_PURPOSE_MAX_LENGTH = 200;
