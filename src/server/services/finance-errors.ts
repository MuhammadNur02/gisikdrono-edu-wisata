import 'server-only';

import { financeCopy } from '@/lib/copy/finance';
import { adjustmentsCopy } from '@/lib/copy/finance-adjustments';
import { AppError, raisedHintOf } from '@/lib/errors';
import { databaseErrorCode } from '@/lib/utils/database-errors';
import type { ActionErrorCode } from '@/types/action-result';

// The refusals the finance RPCs raise as P0001 with a hint (20261101130100, 20261101130200), each turned into the
// Indonesian sentence the page shows. A hint mapError already knows (STATE_INVALID, RATE_LIMITED) is left to it.

const INSUFFICIENT_PRIVILEGE = '42501';
const INVALID_PARAMETER = '22023';
const NO_DATA_FOUND = 'P0002';

const REFUSALS: Readonly<Record<string, { code: ActionErrorCode; message: string }>> = {
  RULE_LINES_INVALID: { code: 'VALIDATION', message: financeCopy.rules.errors.RULE_LINES_INVALID },
  RULE_START_INVALID: { code: 'VALIDATION', message: financeCopy.rules.errors.RULE_START_INVALID },
  RULE_OVERLAP: { code: 'CONFLICT', message: financeCopy.rules.errors.RULE_OVERLAP },
  RULE_TARGET_INVALID: { code: 'VALIDATION', message: financeCopy.rules.errors.RULE_TARGET_INVALID },
  PAYOUT_EMPTY: { code: 'STATE_INVALID', message: financeCopy.payouts.errors.PAYOUT_EMPTY },
  PROOF_MISSING: { code: 'VALIDATION', message: adjustmentsCopy.errors.PROOF_MISSING },
  PROOF_REUSED: { code: 'CONFLICT', message: adjustmentsCopy.errors.PROOF_REUSED },
  ADJUSTMENT_TYPE_UNSUPPORTED: { code: 'VALIDATION', message: adjustmentsCopy.errors.ADJUSTMENT_TYPE_UNSUPPORTED },
  ADJUSTMENT_OPEN: { code: 'CONFLICT', message: adjustmentsCopy.errors.ADJUSTMENT_OPEN },
  ADJUSTMENT_STATE: { code: 'STATE_INVALID', message: adjustmentsCopy.errors.ADJUSTMENT_STATE },
  APPROVER_INELIGIBLE: { code: 'FORBIDDEN', message: adjustmentsCopy.errors.APPROVER_INELIGIBLE },
  APPLY_TOO_EARLY: { code: 'STATE_INVALID', message: adjustmentsCopy.errors.APPLY_TOO_EARLY },
  REFUND_NO_PAYMENT: { code: 'STATE_INVALID', message: adjustmentsCopy.errors.REFUND_NO_PAYMENT },
  REFUND_TOO_LARGE: { code: 'VALIDATION', message: adjustmentsCopy.errors.REFUND_TOO_LARGE },
  SHARE_TOO_LARGE: { code: 'VALIDATION', message: adjustmentsCopy.errors.SHARE_TOO_LARGE },
  LEDGER_MISSING: { code: 'STATE_INVALID', message: adjustmentsCopy.errors.LEDGER_MISSING },
  REFUND_NOT_AT_MIDTRANS: { code: 'STATE_INVALID', message: adjustmentsCopy.errors.REFUND_NOT_AT_MIDTRANS },
};

// The readable refusal for a finance RPC's error, or null to let mapError decide.
export function financeRefusal(error: unknown): AppError | null {
  const hint = raisedHintOf(error);
  const refusal = hint ? REFUSALS[hint] : undefined;
  if (refusal) return new AppError(refusal.code, refusal.message);
  const code = databaseErrorCode(error);
  // The RPCs check the fresh TOTP themselves; a code older than five minutes reads as a step-up to repeat.
  if (code === INSUFFICIENT_PRIVILEGE) return new AppError('FORBIDDEN');
  if (code === INVALID_PARAMETER) return new AppError('VALIDATION');
  if (code === NO_DATA_FOUND) return new AppError('NOT_FOUND');
  return null;
}

// Runs a finance write and throws its readable refusal instead of the raw database error.
export async function asFinanceWrite<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw financeRefusal(error) ?? error;
  }
}
