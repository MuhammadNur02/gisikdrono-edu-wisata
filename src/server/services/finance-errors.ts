import 'server-only';

import type { FinanceRefusalHint } from '@/config/finance';
import { financeCopy } from '@/lib/copy/finance';
import { adjustmentsCopy } from '@/lib/copy/finance-adjustments';
import { AppError, raisedHintOf } from '@/lib/errors';
import { databaseErrorCode } from '@/lib/utils/database-errors';
import type { ActionErrorCode } from '@/types/action-result';

// The refusals the finance RPCs raise as P0001 with a hint (20261101130100 to 20261104210300, listed once in
// FINANCE_REFUSAL_HINTS), each turned into the Indonesian sentence the page shows. A hint mapError already knows
// (STATE_INVALID, RATE_LIMITED) is left to it.

const INSUFFICIENT_PRIVILEGE = '42501';
const INVALID_PARAMETER = '22023';
const NO_DATA_FOUND = 'P0002';

const REFUSALS: Readonly<Record<FinanceRefusalHint, { code: ActionErrorCode; message: string }>> = {
  RULE_LINES_INVALID: { code: 'VALIDATION', message: financeCopy.rules.errors.RULE_LINES_INVALID },
  RULE_START_INVALID: { code: 'VALIDATION', message: financeCopy.rules.errors.RULE_START_INVALID },
  RULE_OVERLAP: { code: 'CONFLICT', message: financeCopy.rules.errors.RULE_OVERLAP },
  RULE_TARGET_INVALID: {
    code: 'VALIDATION',
    message: financeCopy.rules.errors.RULE_TARGET_INVALID,
  },
  PAYOUT_EMPTY: { code: 'STATE_INVALID', message: financeCopy.payouts.errors.PAYOUT_EMPTY },
  PAYOUT_TOTAL_MISMATCH: {
    code: 'CONFLICT',
    message: financeCopy.payouts.errors.PAYOUT_TOTAL_MISMATCH,
  },
  PAYOUT_NEGATIVE_PENDING: {
    code: 'STATE_INVALID',
    message: financeCopy.payouts.errors.PAYOUT_NEGATIVE_PENDING,
  },
  PROOF_MISSING: { code: 'VALIDATION', message: adjustmentsCopy.errors.PROOF_MISSING },
  PROOF_REUSED: { code: 'CONFLICT', message: adjustmentsCopy.errors.PROOF_REUSED },
  ADJUSTMENT_TYPE_UNSUPPORTED: {
    code: 'VALIDATION',
    message: adjustmentsCopy.errors.ADJUSTMENT_TYPE_UNSUPPORTED,
  },
  ADJUSTMENT_OPEN: { code: 'CONFLICT', message: adjustmentsCopy.errors.ADJUSTMENT_OPEN },
  ADJUSTMENT_STATE: { code: 'STATE_INVALID', message: adjustmentsCopy.errors.ADJUSTMENT_STATE },
  APPROVER_INELIGIBLE: { code: 'FORBIDDEN', message: adjustmentsCopy.errors.APPROVER_INELIGIBLE },
  APPLY_TOO_EARLY: { code: 'STATE_INVALID', message: adjustmentsCopy.errors.APPLY_TOO_EARLY },
  REFUND_NO_PAYMENT: { code: 'STATE_INVALID', message: adjustmentsCopy.errors.REFUND_NO_PAYMENT },
  REFUND_TOO_LARGE: { code: 'VALIDATION', message: adjustmentsCopy.errors.REFUND_TOO_LARGE },
  SHARE_TOO_LARGE: { code: 'VALIDATION', message: adjustmentsCopy.errors.SHARE_TOO_LARGE },
  LEDGER_MISSING: { code: 'STATE_INVALID', message: adjustmentsCopy.errors.LEDGER_MISSING },
  REFUND_NOT_AT_MIDTRANS: {
    code: 'STATE_INVALID',
    message: adjustmentsCopy.errors.REFUND_NOT_AT_MIDTRANS,
  },
  REFUND_KEY_MISMATCH: {
    code: 'STATE_INVALID',
    message: adjustmentsCopy.errors.REFUND_KEY_MISMATCH,
  },
  REFUND_LIST_MISSING: {
    code: 'STATE_INVALID',
    message: adjustmentsCopy.errors.REFUND_LIST_MISSING,
  },
  REFUND_PENDING_AT_MIDTRANS: {
    code: 'STATE_INVALID',
    message: adjustmentsCopy.errors.REFUND_PENDING_AT_MIDTRANS,
  },
  REFUND_REQUEST_MISMATCH: {
    code: 'VALIDATION',
    message: adjustmentsCopy.errors.REFUND_REQUEST_MISMATCH,
  },
  RELEASE_INELIGIBLE: { code: 'FORBIDDEN', message: adjustmentsCopy.errors.RELEASE_INELIGIBLE },
  ALERT_NOT_NOTIFIED: { code: 'STATE_INVALID', message: adjustmentsCopy.errors.ALERT_NOT_NOTIFIED },
  RELEASE_TOO_EARLY: { code: 'STATE_INVALID', message: adjustmentsCopy.errors.RELEASE_TOO_EARLY },
  WEATHER_FEE_UNSET_MANUAL: {
    code: 'STATE_INVALID',
    message: adjustmentsCopy.errors.WEATHER_FEE_UNSET_MANUAL,
  },
};

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const SHORT_ID_LENGTH = 8;

function isRefusalHint(hint: string): hint is FinanceRefusalHint {
  return Object.hasOwn(REFUSALS, hint);
}

// Review of PR #80, L-1: REFUND_KEY_MISMATCH names the applied adjustment Midtrans disagrees with, which is not the
// one being applied; the RPC's message carries its id.
function raisedMessageOf(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('message' in error)) return '';
  return typeof error.message === 'string' ? error.message : '';
}

function refusalMessage(hint: FinanceRefusalHint, error: unknown): string {
  if (hint !== 'REFUND_KEY_MISMATCH') return REFUSALS[hint].message;
  const adjustmentId = UUID_PATTERN.exec(raisedMessageOf(error))?.[0];
  return adjustmentId
    ? adjustmentsCopy.refundKeyMismatchOf(adjustmentId.slice(0, SHORT_ID_LENGTH))
    : REFUSALS[hint].message;
}

// Review of PR #80, Info: named_weather_link (20261104181000) refuses a weather link with the shared STATE_INVALID;
// its message names the link, so the page can say which choice to change. Applying an approved adjustment whose link
// no longer waits for it asks for the adjustment to be withdrawn instead (review of PR #103, Info).
const WEATHER_LINK_REFUSAL = /^weather link /;

// Which finance write failed, where the same refusal asks for another next step.
export type FinanceWriteStage = 'write' | 'apply';

function isWeatherLinkRefusal(hint: string | undefined, error: unknown): boolean {
  return hint === 'STATE_INVALID' && WEATHER_LINK_REFUSAL.test(raisedMessageOf(error));
}

// The readable refusal for a finance RPC's error, or null to let mapError decide.
export function financeRefusal(error: unknown, stage: FinanceWriteStage = 'write'): AppError | null {
  const hint = raisedHintOf(error);
  if (hint && isRefusalHint(hint))
    return new AppError(REFUSALS[hint].code, refusalMessage(hint, error));
  if (isWeatherLinkRefusal(hint, error)) {
    const message =
      stage === 'apply'
        ? adjustmentsCopy.errors.WEATHER_LINK_STATE_APPLY
        : adjustmentsCopy.errors.WEATHER_LINK_STATE;
    return new AppError('STATE_INVALID', message);
  }
  const code = databaseErrorCode(error);
  // The RPCs check the fresh TOTP themselves; a code older than five minutes reads as a step-up to repeat.
  if (code === INSUFFICIENT_PRIVILEGE) return new AppError('FORBIDDEN');
  if (code === INVALID_PARAMETER) return new AppError('VALIDATION');
  if (code === NO_DATA_FOUND) return new AppError('NOT_FOUND');
  return null;
}

// Runs a finance write and throws its readable refusal instead of the raw database error.
export async function asFinanceWrite<T>(
  run: () => Promise<T>,
  stage: FinanceWriteStage = 'write',
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw financeRefusal(error, stage) ?? error;
  }
}
