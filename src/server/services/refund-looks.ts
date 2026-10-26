import 'server-only';

import { svcRecordRefundLook } from '@/db/rpc-refunds';
import type { DatabaseClient } from '@/db/rpc-result';
import { AppError } from '@/lib/errors';
import { lookAtOrder } from '@/server/services/payment-poll';

// Re-review of PR #69, M-3: before the superadmin marks a submitted QRIS refund failed, the server asks Midtrans about
// the request's order itself and stores that look with the request; mark_refund_request_failed then judges that answer
// alone. On the service-role client payment-service.ts hands in, keyed by the request id of a superadmin's action.

async function refundOrderOf(adminClient: DatabaseClient, requestId: string): Promise<string> {
  const { data: request, error } = await adminClient
    .from('refund_requests')
    .select('payment_id')
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw error;
  if (request === null) throw new AppError('NOT_FOUND');
  const { data: payment, error: paymentError } = await adminClient
    .from('payments')
    .select('order_id')
    .eq('id', request.payment_id)
    .single();
  if (paymentError) throw paymentError;
  return payment.order_id;
}

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
