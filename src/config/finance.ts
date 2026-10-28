// /dashboard/finance and its sub-pages (Task P4.7, docs/PRD.md FR-ADMIN-18..21, docs/Security.md §10).

export const FINANCE_PATH = '/dashboard/finance';
export const REVENUE_SHARE_PATH = '/dashboard/finance/revenue-share';
export const ADJUSTMENTS_PATH = '/dashboard/finance/adjustments';
export const RECONCILIATION_PATH = '/dashboard/finance/reconciliation';

// The recap opens on the last 30 days; finance_overview refuses a period longer than 12 months.
export const FINANCE_DEFAULT_PERIOD_DAYS = 30;
export const FINANCE_MAX_PERIOD_DAYS = 366;

// The beneficiary keys of revenue_share_entries: the kelurahan, an RW treasury, a vendor (settle_revenue_entries).
export const KELURAHAN_KEY = 'kelurahan';
export const RW_KEY_PREFIX = 'rw:';
export const VENDOR_KEY_PREFIX = 'vendor:';

// internal.revenue_rule_lines_of: 1 to 10 lines, each above 0 and at most 100 with two decimals, summing to 100.
export const RULE_MAX_LINES = 10;
export const RULE_TOTAL_PCT = 100;
export const RULE_PCT_DECIMALS = 2;
// Shares are compared in hundredths of a percent, so no float rounding decides.
export const RULE_PCT_SCALE = 100;
export const RULE_NAME_MAX_LENGTH = 100;

// settle_revenue_entries: a reference of 3 to 100 characters; the last four digits of the payout account.
export const PAYOUT_REFERENCE_MIN_LENGTH = 3;
export const PAYOUT_REFERENCE_MAX_LENGTH = 100;
export const PAYOUT_ACCOUNT_DIGITS = 4;

// propose_adjustment and reject_adjustment: a reason (or a rejection) of at least 10 characters.
export const ADJUSTMENT_REASON_MIN_LENGTH = 10;
export const ADJUSTMENT_REASON_MAX_LENGTH = 500;
// release_refund_key_mismatch: a note of 10 (ADJUSTMENT_REASON_MIN_LENGTH) to 300 characters.
export const RELEASE_NOTE_MAX_LENGTH = 300;

// A reconciliation issue is closed with a note of at least 5 characters, which the audit log keeps.
export const ISSUE_NOTE_MIN_LENGTH = 5;
export const ISSUE_NOTE_MAX_LENGTH = 500;

// reconciliation_issues.resolution (20261104190000): the cause was fixed, or it was checked and needs no action.
export const ISSUE_RESOLUTIONS = ['resolved', 'ignored'] as const;

// The uploads-quarantine path api/uploads/sign issues, and a ledger line or beneficiary key, as the forms carry them.
export const UPLOAD_PATH_MAX_LENGTH = 200;
export const LEDGER_KEY_MAX_LENGTH = 80;

// How many rows each finance list reads at once; the kelurahan's volume is small.
export const FINANCE_LIST_LIMIT = 50;
export const RECONCILIATION_RUNS_LIMIT = 14;

// Review of PR #80, M-1: the hints the finance RPCs raise as P0001 that the pages answer with a sentence of their own
// (finance-errors.ts). finance-errors.test.ts reads the migrations and fails on a hint that is in neither this list
// nor the shared mapping of mapError.
export const FINANCE_REFUSAL_HINTS = [
  'RULE_LINES_INVALID',
  'RULE_START_INVALID',
  'RULE_OVERLAP',
  'RULE_TARGET_INVALID',
  'PAYOUT_EMPTY',
  'PAYOUT_TOTAL_MISMATCH',
  // Review of PR #80, L-5: an unpaid negative row of the party lies before the period.
  'PAYOUT_NEGATIVE_PENDING',
  'PROOF_MISSING',
  'PROOF_REUSED',
  'ADJUSTMENT_TYPE_UNSUPPORTED',
  'ADJUSTMENT_OPEN',
  'ADJUSTMENT_STATE',
  'APPROVER_INELIGIBLE',
  'APPLY_TOO_EARLY',
  'REFUND_NO_PAYMENT',
  'REFUND_TOO_LARGE',
  'SHARE_TOO_LARGE',
  'LEDGER_MISSING',
  'REFUND_NOT_AT_MIDTRANS',
  'REFUND_KEY_MISMATCH',
  'REFUND_LIST_MISSING',
  'REFUND_PENDING_AT_MIDTRANS',
  'REFUND_REQUEST_MISMATCH',
  'RELEASE_INELIGIBLE',
  'ALERT_NOT_NOTIFIED',
  // Review of PR #80, L-2: the sole superadmin releases 24 hours after the alert went out.
  'RELEASE_TOO_EARLY',
  // PR #90's: a manual refund named for a weather link held for an unset Midtrans fee.
  'WEATHER_FEE_UNSET_MANUAL',
] as const;
export type FinanceRefusalHint = (typeof FINANCE_REFUSAL_HINTS)[number];
