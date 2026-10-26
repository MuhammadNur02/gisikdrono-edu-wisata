'use server';

import { fail, mapError, ok } from '@/lib/errors';
import { markRefundFailedSchema } from '@/lib/validations/refund-request';
import { requireRole } from '@/server/auth/guards';
import { markRefundRequestFailedByStaff } from '@/server/services/payment-service';
import type { ActionResult } from '@/types/action-result';

// Delta review of PR #69, D-2, and its re-review, M-3: the superadmin at AAL2 marks a submitted QRIS refund Midtrans
// never paid out as failed, which opens the bank-transfer path. The server asks Midtrans about the order first;
// mark_refund_request_failed checks the role, AAL2, the fresh code and that look again in the database.
export async function markRefundRequestFailedAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = markRefundFailedSchema.safeParse(input);
  if (!parsed.success) return mapError(parsed.error);
  const guard = await requireRole('superadmin');
  if (!guard.ok) return guard;
  if (!guard.ctx.isAal2) return fail('FORBIDDEN');

  try {
    await markRefundRequestFailedByStaff(parsed.data);
    return ok(null);
  } catch (error) {
    return mapError(error);
  }
}
