import 'server-only';

import { z } from 'zod';

import { FINANCE_LIST_LIMIT } from '@/config/finance';
import { DB_ENUMS } from '@/db/enums';
import {
  applyAdjustment,
  approveAdjustment,
  proposeAdjustment,
  rejectAdjustment,
  type AdjustmentReply,
} from '@/db/rpc-adjustments';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { failureFor } from '@/lib/uploads/outcomes';
import { createUuidV7 } from '@/lib/utils/uuid-v7';
import type { ProposeAdjustmentValues } from '@/lib/validations/finance';
import type { StaffContext } from '@/server/auth/guards';
import { removeFinanceEvidence, storeFinanceEvidence } from '@/server/services/document-service';
import { asFinanceWrite } from '@/server/services/finance-errors';
import type { Adjustment } from '@/types/finance';

// /dashboard/finance/adjustments (Task P4.7.04; docs/Security.md §3.8, REC-09, REC-16): the dual-controlled money
// adjustments, read under RLS (payment_adjustments_super_read) and written only through their RPCs, which check the
// fresh TOTP, the approver's eligibility and the 24-hour delay themselves. The evidence is put in the documents bucket
// under the booking's folder before propose_adjustment names it.

const adjustmentRowSchema = z.object({
  id: z.uuid(),
  booking_id: z.uuid(),
  payment_id: z.uuid().nullable(),
  type: z.enum(DB_ENUMS.adjustment_type),
  status: z.enum(DB_ENUMS.adjustment_status),
  amount: z.number().int(),
  reason: z.string(),
  details: z.looseObject({
    line_ref: z.string().optional(),
    from_key: z.string().optional(),
    to_key: z.string().optional(),
  }),
  proposed_by: z.uuid(),
  proposed_at: z.string(),
  approved_by: z.uuid().nullable(),
  approved_at: z.string().nullable(),
  apply_not_before: z.string().nullable(),
  applied_at: z.string().nullable(),
  rejected_reason: z.string().nullable(),
});

type AdjustmentRow = z.infer<typeof adjustmentRowSchema>;

const ADJUSTMENT_COLUMNS =
  'id, booking_id, payment_id, type, status, amount, reason, details, proposed_by, proposed_at, approved_by, approved_at, apply_not_before, applied_at, rejected_reason';

async function namesOf(table: 'profiles' | 'bookings', ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();
  const column = table === 'profiles' ? 'full_name' : 'booking_code';
  const { data, error } = await supabase.from(table).select(`id, ${column}`).in('id', [...new Set(ids)]);
  if (error) throw error;
  const rows = z.array(z.record(z.string(), z.string().nullable())).parse(data);
  return new Map(rows.flatMap((row) => (row.id && row[column] ? [[row.id, row[column]] as const] : [])));
}

function adjustmentOf(row: AdjustmentRow, people: Map<string, string>, codes: Map<string, string>): Adjustment {
  return {
    id: row.id,
    bookingId: row.booking_id,
    bookingCode: codes.get(row.booking_id) ?? null,
    paymentId: row.payment_id,
    type: row.type,
    status: row.status,
    amount: row.amount,
    reason: row.reason,
    details: { lineRef: row.details.line_ref, fromKey: row.details.from_key, toKey: row.details.to_key },
    proposedBy: row.proposed_by,
    proposedByName: people.get(row.proposed_by) ?? null,
    proposedAt: row.proposed_at,
    approvedByName: row.approved_by ? (people.get(row.approved_by) ?? null) : null,
    approvedAt: row.approved_at,
    applyNotBefore: row.apply_not_before,
    appliedAt: row.applied_at,
    rejectedReason: row.rejected_reason,
  };
}

export async function listAdjustments(): Promise<Adjustment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('payment_adjustments')
    .select(ADJUSTMENT_COLUMNS)
    .order('proposed_at', { ascending: false })
    .limit(FINANCE_LIST_LIMIT);
  if (error) throw error;
  const rows = z.array(adjustmentRowSchema).parse(data);
  const people = await namesOf(
    'profiles',
    rows.flatMap((row) => (row.approved_by ? [row.proposed_by, row.approved_by] : [row.proposed_by])),
  );
  const codes = await namesOf('bookings', rows.map((row) => row.booking_id));
  return rows.map((row) => adjustmentOf(row, people, codes));
}

export async function propose(ctx: StaffContext, values: ProposeAdjustmentValues): Promise<AdjustmentReply> {
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
        details:
          values.type === 'reclassify_share'
            ? { lineRef: values.lineRef ?? undefined, fromKey: values.fromKey ?? undefined, toKey: values.toKey ?? undefined }
            : {},
      }),
    );
  } catch (error) {
    await removeFinanceEvidence(stored.path);
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
