'use server';

import { revalidatePath } from 'next/cache';

import { FINANCE_PATH, RECONCILIATION_PATH } from '@/config/finance';
import { mapError, ok } from '@/lib/errors';
import { recheckPaymentSchema, resolveIssueSchema } from '@/lib/validations/finance';
import { requireFinanceStepUp } from '@/server/auth/finance-guards';
import { requireAal2, requireRole } from '@/server/auth/guards';
import { recheckPaymentStatus } from '@/server/services/payment-service';
import { checkChains, resolveIssue } from '@/server/services/reconciliation-service';
import type { ActionResult } from '@/types/action-result';
import type { ChainStatus, RecheckOutcome } from '@/types/finance';

// /dashboard/finance/reconciliation (Task P4.7.04; docs/Security.md REC-01, REC-09): closing an issue with a note,
// asking Midtrans again about a payment ("Cek status Midtrans", which applies only what the Status API answers about
// that order), and checking the audit and ledger chains (verify_audit_chain, six times an hour at most). Asking
// Midtrans again needs the authenticator code and happens once a minute per payment at most (review of PR #80, L-7).

export async function resolveIssueAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = resolveIssueSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const superadmin = await requireRole('superadmin');
  if (!superadmin.ok) return superadmin;
  const guard = await requireFinanceStepUp();
  if (!guard.ok) return guard;

  try {
    await resolveIssue(guard.ctx, parsed.data);
    revalidatePath(RECONCILIATION_PATH);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}

export async function recheckPaymentAction(input: unknown): Promise<ActionResult<RecheckOutcome>> {
  const parsed = recheckPaymentSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const superadmin = await requireRole('superadmin');
  if (!superadmin.ok) return superadmin;
  const guard = await requireFinanceStepUp();
  if (!guard.ok) return guard;

  try {
    const outcome = await recheckPaymentStatus(parsed.data.paymentId);
    revalidatePath(RECONCILIATION_PATH);
    revalidatePath(FINANCE_PATH);
    return ok(outcome);
  } catch (error) {
    return mapError(error);
  }
}

export async function checkChainsAction(): Promise<ActionResult<ChainStatus>> {
  const superadmin = await requireRole('superadmin');
  if (!superadmin.ok) return superadmin;
  const guard = await requireAal2();
  if (!guard.ok) return guard;

  try {
    return ok(await checkChains());
  } catch (error) {
    return mapError(error);
  }
}
