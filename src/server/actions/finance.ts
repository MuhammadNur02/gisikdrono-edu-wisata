'use server';

import { revalidatePath } from 'next/cache';

import { FINANCE_PATH, REVENUE_SHARE_PATH } from '@/config/finance';
import { mapError, ok } from '@/lib/errors';
import {
  payoutPreviewSchema,
  saveRevenueRuleSchema,
  settlePayoutSchema,
} from '@/lib/validations/finance';
import { requireFinanceStepUp } from '@/server/auth/finance-guards';
import { requireAal2, requireRole } from '@/server/auth/guards';
import { previewPayout, saveRule, settlePayout } from '@/server/services/revenue-share-service';
import type { ActionResult } from '@/types/action-result';
import type { PayoutBatch, PayoutPreview, SavedRule } from '@/types/finance';

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

// Review of PR #80, M-2: the period's figure before a payout is recorded, read as of the server's time; nothing is
// written, so AAL2 is enough and no code is asked.
export async function previewPayoutAction(input: unknown): Promise<ActionResult<PayoutPreview>> {
  const parsed = payoutPreviewSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const superadmin = await requireRole('superadmin');
  if (!superadmin.ok) return superadmin;
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    return ok(await previewPayout(parsed.data));
  } catch (error) {
    return mapError(error);
  }
}
