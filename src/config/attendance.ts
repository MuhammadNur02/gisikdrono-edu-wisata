// /dashboard/attendance (Task P4.3.09, docs/PRD.md FR-ADMIN-06): the gate list of a day and its scan history.

export const ATTENDANCE_PATH = '/dashboard/attendance';

// How far back the history reads, well inside the 24 months prune_operational_tables keeps ticket_scans.
export const ATTENDANCE_HISTORY_DAYS = 365;

// The scan history sorts by time only, newest first unless the header says otherwise.
export const SCAN_SORT_COLUMNS = ['scanned_at'] as const;
export const SCAN_DEFAULT_SORT = 'scanned_at.desc';
