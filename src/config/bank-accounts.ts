// Task P4.3.06 (20261104120000_bank_account_rpcs.sql, internal.require_bank_account and record_bank_reveal): the
// shape of a vendor's or an RW treasury's account, and the reason a reveal records. The database checks the same.
export const BANK_ACCOUNT_LIMITS = {
  bankName: { min: 2, max: 60 },
  accountHolder: { min: 2, max: 120 },
  revealReason: { min: 3, max: 300 },
} as const;

export const BANK_ACCOUNT_NUMBER = /^[0-9]{5,20}$/;

// A revealed number hides itself again after this long (review of PR #79), as a hidden participant list is dropped.
export const REVEALED_NUMBER_VISIBLE_MS = 5 * 60 * 1000;

// The page that lists the RW treasuries, refreshed after a change to one.
export const RW_TREASURIES_PATH = '/dashboard/settings';
