import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';
import type { PayoutBatch, PayoutPreview } from '@/types/finance';

// The payout RPCs of Task P4.7.02 (20261101130100, 20261104190400) on the signed-in superadmin's session client:
// settle_revenue_entries, which takes the total transferred (review of PR #80, M-2), and payout_preview, the figure
// the form shows before it. Split from rpc-finance.ts (delta review of PR #80, L-f).

const money = z.number().int();
const count = z.number().int().nonnegative();

const batchSchema = z.looseObject({
  id: z.uuid(),
  beneficiary_key: z.string(),
  period_from: z.string(),
  period_to: z.string(),
  total_amount: money,
  reference: z.string().nullable(),
  paid_at: z.string().nullable(),
  proof_path: z.string().nullable(),
  created_at: z.string(),
});

export function payoutBatchOf(row: z.infer<typeof batchSchema>): PayoutBatch {
  return {
    id: row.id,
    beneficiaryKey: row.beneficiary_key,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    totalAmount: row.total_amount,
    reference: row.reference,
    paidAt: row.paid_at,
    hasProof: row.proof_path !== null,
    createdAt: row.created_at,
  };
}

export interface PayoutToSettle {
  beneficiaryKey: string;
  from: string;
  to: string;
  reference: string;
  proofPath: string;
  expectedTotal: number;
}

export async function settleRevenueEntries(
  client: DatabaseClient,
  payout: PayoutToSettle,
): Promise<PayoutBatch> {
  const reply = await resultOf(
    client.rpc('settle_revenue_entries', {
      p_beneficiary_key: payout.beneficiaryKey,
      p_from: payout.from,
      p_to: payout.to,
      p_reference: payout.reference,
      p_proof_path: payout.proofPath,
      p_expected_total: payout.expectedTotal,
    }),
  );
  return payoutBatchOf(batchSchema.parse(reply));
}

const previewSchema = z.object({
  beneficiary_key: z.string(),
  oldest_unpaid: z.string().nullable(),
  from: z.string(),
  to: z.string(),
  total: money.nullable(),
  entries: count.nullable(),
  // Review of PR #103, M-1: an unpaid negative row before the period blocks any payout of it (20261104210300).
  blocked_since: z.string().nullable(),
  blocked_reason: z.enum(['negative_pending']).nullable(),
});

// Review of PR #80, M-2: what a payout of one party would stamp, as of the server's time now (payout_preview).
export async function payoutPreview(
  client: DatabaseClient,
  query: { beneficiaryKey: string; from: string | null; to: string | null },
): Promise<PayoutPreview> {
  const reply = await resultOf(
    client.rpc('payout_preview', {
      p_beneficiary_key: query.beneficiaryKey,
      ...(query.from ? { p_from: query.from } : {}),
      ...(query.to ? { p_to: query.to } : {}),
    }),
  );
  const parsed = previewSchema.parse(reply);
  return {
    beneficiaryKey: parsed.beneficiary_key,
    oldestUnpaid: parsed.oldest_unpaid,
    from: parsed.from,
    to: parsed.to,
    total: parsed.total,
    entries: parsed.entries,
    blockedSince: parsed.blocked_reason === 'negative_pending' ? parsed.blocked_since : null,
  };
}
