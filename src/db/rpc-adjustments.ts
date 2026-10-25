import 'server-only';

import { z } from 'zod';

import { DB_ENUMS } from '@/db/enums';
import { resultOf, type DatabaseClient } from '@/db/rpc-result';
import type { AdjustmentDetails } from '@/types/finance';

// The adjustment and refund RPCs of Task P4.7.03 (20261101130200, 20261103150100) on the superadmin's session client.
// Each one checks the fresh TOTP itself and answers with the adjustment row (or the refund's outcome) as jsonb.

const adjustmentReplySchema = z.looseObject({
  id: z.uuid(),
  status: z.enum(DB_ENUMS.adjustment_status),
  apply_not_before: z.string().nullable(),
});

export interface AdjustmentReply {
  id: string;
  status: (typeof DB_ENUMS.adjustment_status)[number];
  applyNotBefore: string | null;
}

function replyOf(reply: unknown): AdjustmentReply {
  const parsed = adjustmentReplySchema.parse(reply);
  return { id: parsed.id, status: parsed.status, applyNotBefore: parsed.apply_not_before };
}

export interface AdjustmentToPropose {
  type: 'manual_refund' | 'reclassify_share' | 'write_off';
  bookingId: string;
  paymentId: string | null;
  amount: number;
  reason: string;
  evidencePath: string;
  details: AdjustmentDetails;
}

export async function proposeAdjustment(
  client: DatabaseClient,
  proposal: AdjustmentToPropose,
): Promise<AdjustmentReply> {
  const details = proposal.details.lineRef
    ? {
        line_ref: proposal.details.lineRef,
        from_key: proposal.details.fromKey ?? null,
        to_key: proposal.details.toKey ?? null,
      }
    : {};
  const reply = await resultOf(
    client.rpc('propose_adjustment', {
      p_type: proposal.type,
      p_booking_id: proposal.bookingId,
      p_amount: proposal.amount,
      p_reason: proposal.reason,
      p_evidence_path: proposal.evidencePath,
      p_details: details,
      p_payment_id: proposal.paymentId ?? undefined,
    }),
  );
  return replyOf(reply);
}

export async function approveAdjustment(client: DatabaseClient, id: string): Promise<AdjustmentReply> {
  return replyOf(await resultOf(client.rpc('approve_adjustment', { p_id: id })));
}

export async function rejectAdjustment(
  client: DatabaseClient,
  rejection: { id: string; reason: string },
): Promise<AdjustmentReply> {
  return replyOf(
    await resultOf(client.rpc('reject_adjustment', { p_id: rejection.id, p_reason: rejection.reason })),
  );
}

export async function applyAdjustment(client: DatabaseClient, id: string): Promise<AdjustmentReply> {
  return replyOf(await resultOf(client.rpc('apply_adjustment', { p_id: id })));
}
