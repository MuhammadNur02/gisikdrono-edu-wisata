'use server';

import { revalidatePath } from 'next/cache';

import { FINANCE_PATH, REVENUE_SHARE_PATH } from '@/config/finance';
import { mapError, ok } from '@/lib/errors';
import { saveRevenueRuleSchema, settlePayoutSchema } from '@/lib/validations/finance';
import { requireFinanceStepUp } from '@/server/auth/finance-guards';
import { requireRole } from '@/server/auth/guards';
import { saveRule, settlePayout } from '@/server/services/revenue-share-service';
import type { ActionResult } from '@/types/action-result';
import type { PayoutBatch, SavedRule } from '@/types/finance';

// /dashboard/finance/revenue-share (Task P4.7.02): a revenue rule's new version and a payout to one beneficiary. The
// forms carry the authenticator code, which withStepUp sends to verifyStaffTotpAction first (docs/Security.md §5.3).

export async function saveRevenueRuleAction(input: unknown): Promise<ActionResult<SavedRule>> {
  const parsed = saveRevenueRuleSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const superadmin = await requireRole('superadmin');
  if (!superadmin.ok) return superadmin;
  const guard = await requireFinanceStepUp();
  if (!guard.ok) return guard;

  try {
    const saved = await saveRule(parsed.data);
    revalidatePath(REVENUE_SHARE_PATH);
    return ok(saved);
  } catch (error) {
    return mapError(error);
  }
}

export async function settlePayoutAction(input: unknown): Promise<ActionResult<PayoutBatch>> {
  const parsed = settlePayoutSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const superadmin = await requireRole('superadmin');
  if (!superadmin.ok) return superadmin;
  const guard = await requireFinanceStepUp();
  if (!guard.ok) return guard;

  try {
    const batch = await settlePayout(guard.ctx, parsed.data);
    revalidatePath(REVENUE_SHARE_PATH);
    revalidatePath(FINANCE_PATH);
    return ok(batch);
  } catch (error) {
    return mapError(error);
  }
}
