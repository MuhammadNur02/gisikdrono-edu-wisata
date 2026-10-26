import 'server-only';

import { svcRecordRefundLook } from '@/db/rpc-refunds';
import type { DatabaseClient } from '@/db/rpc-result';
import { AppError } from '@/lib/errors';
import { lookAtOrder } from '@/server/services/payment-poll';
import { refundOrderOf } from '@/server/services/payment-reads';

// Re-review of PR #69, M-3: before the superadmin marks a submitted QRIS refund failed, the server asks Midtrans about
// the request's order itself and stores that look with the request; mark_refund_request_failed then judges that answer
// alone. On the service-role client payment-service.ts hands in, keyed by the request id of a superadmin's action.

// The event id of a fresh look that shows the refund still unbooked; a refund the answer just booked, or an order
// Midtrans does not know, leaves nothing to mark.
export async function lookAtRefundRequest(
  adminClient: DatabaseClient,
  requestId: string,
): Promise<number> {
  const look = await lookAtOrder(adminClient, await refundOrderOf(adminClient, requestId));
  if (look.isBooked || look.eventId === null) throw new AppError('STATE_INVALID');
  const isStored = await svcRecordRefundLook(adminClient, { requestId, eventId: look.eventId });
  if (!isStored) throw new AppError('STATE_INVALID');
  return look.eventId;
}
