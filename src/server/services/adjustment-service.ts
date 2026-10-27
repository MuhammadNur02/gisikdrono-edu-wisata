import 'server-only';

import {
  applyAdjustment,
  approveAdjustment,
  proposeAdjustment,
  rejectAdjustment,
  releaseRefundKeyMismatch,
} from '@/db/rpc-adjustments';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { failureFor } from '@/lib/uploads/outcomes';
import { createUuidV7 } from '@/lib/utils/uuid-v7';
import type { ProposeAdjustmentValues, ReleaseKeyMismatchValues } from '@/lib/validations/finance';
import type { StaffContext } from '@/server/auth/guards';
import { removeFinanceEvidence, storeFinanceEvidence } from '@/server/services/document-service';
import { asFinanceWrite } from '@/server/services/finance-errors';
import type { AdjustmentDetails, AdjustmentReply } from '@/types/finance';

// /dashboard/finance/adjustments (Task P4.7.04; docs/Security.md §3.8, REC-09, REC-16): the dual-controlled money
// adjustments, read under RLS (payment_adjustments_super_read) and written only through their RPCs, which check the
// fresh TOTP, the approver's eligibility and the 24-hour delay themselves. The evidence is put in the documents bucket
// under the booking's folder before propose_adjustment names it. The list is adjustment-reads.ts's.

// What propose_adjustment keeps of the details: a move's line and parties, or a manual refund's weather link (#90).
function detailsOf(values: ProposeAdjustmentValues): AdjustmentDetails {
  if (values.type === 'reclassify_share') {
    return {
      lineRef: values.lineRef ?? undefined,
      fromKey: values.fromKey ?? undefined,
      toKey: values.toKey ?? undefined,
    };
  }
  return values.type === 'manual_refund' && values.weatherLinkId
    ? { weatherLinkId: values.weatherLinkId }
    : {};
}

export async function propose(
  ctx: StaffContext,
  values: ProposeAdjustmentValues,
): Promise<AdjustmentReply> {
  const destination = `bookings/${values.bookingId}/adjustment-${createUuidV7()}`;
  const stored = await storeFinanceEvidence(ctx, values.evidenceUpload, destination);
  if (!stored.ok) throw new AppError('VALIDATION', failureFor(stored.problem).error.message);
  const supabase = await createSupabaseServerClient();
  try {
    return await asFinanceWrite(() =>
      proposeAdjustment(supabase, {
        type: values.type,
        bookingId: values.bookingId,
        paymentId: values.paymentId,
        amount: values.amount,
        reason: values.reason,
        evidencePath: stored.path,
        details: detailsOf(values),
      }),
    );
  } catch (error) {
    // A refusal wrote nothing, so the file and its digest go; after any other error the write may have gone through,
    // and the file stays with its digest (delta review of PR #80, L-d).
    if (error instanceof AppError) await removeFinanceEvidence(stored.path);
    throw error;
  }
}

export async function approve(adjustmentId: string): Promise<AdjustmentReply> {
  const supabase = await createSupabaseServerClient();
  return asFinanceWrite(() => approveAdjustment(supabase, adjustmentId));
}

export async function reject(adjustmentId: string, reason: string): Promise<AdjustmentReply> {
  const supabase = await createSupabaseServerClient();
  return asFinanceWrite(() => rejectAdjustment(supabase, { id: adjustmentId, reason }));
}

export async function apply(adjustmentId: string): Promise<AdjustmentReply> {
  const supabase = await createSupabaseServerClient();
  return asFinanceWrite(() => applyAdjustment(supabase, adjustmentId));
}

// Review of PR #80, L-1: the superadmin acknowledges an applied manual refund's refund_key_mismatch alert with a note,
// after which record_refund books Midtrans' figure (audited, with the high refund_key_mismatch_overridden alert).
export async function releaseKeyMismatch(values: ReleaseKeyMismatchValues): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await asFinanceWrite(() => releaseRefundKeyMismatch(supabase, values));
}
