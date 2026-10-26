import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';

// The refund-request looks of the re-review of PR #69 (M-2, M-3; 20261104080200_visit_terms_functions.sql): a
// submitted QRIS refund Midtrans never paid out is failed only on the server's own Status API look, the payment_events
// row that look stored (a duplicate answer's row included), taken at least 24 h after the submission.

// payments-poll: the look stored with the request, then the request failed when that answer shows its refund unpaid.
// True when it was marked failed.
export async function svcFailUnconfirmedRefundByPoll(
  adminClient: DatabaseClient,
  look: { requestId: string; eventId: number },
): Promise<boolean> {
  return z.boolean().parse(
    await resultOf(
      adminClient.rpc('svc_fail_unconfirmed_refund_by_poll', {
        p_request_id: look.requestId,
        p_event_id: look.eventId,
      }),
    ),
  );
}

// A look stored with the request alone: payments-poll for a request still requested, the superadmin's action right
// before mark_refund_request_failed. True when the event was an answer about the request's own order.
export async function svcRecordRefundLook(
  adminClient: DatabaseClient,
  look: { requestId: string; eventId: number },
): Promise<boolean> {
  return z.boolean().parse(
    await resultOf(
      adminClient.rpc('svc_record_refund_look', {
        p_request_id: look.requestId,
        p_event_id: look.eventId,
      }),
    ),
  );
}

// The superadmin's step-up RPC, on their own session client: AAL2, a fresh TOTP and a reason, on the look just stored.
export async function markRefundRequestFailed(
  client: DatabaseClient,
  mark: { requestId: string; eventId: number; reason: string },
): Promise<void> {
  await resultOf(
    client.rpc('mark_refund_request_failed', {
      p_request_id: mark.requestId,
      p_event_id: mark.eventId,
      p_reason: mark.reason,
    }),
  );
}
