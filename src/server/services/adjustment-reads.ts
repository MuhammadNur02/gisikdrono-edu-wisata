import 'server-only';

import { z } from 'zod';

import { FINANCE_LIST_LIMIT } from '@/config/finance';
import { DB_ENUMS } from '@/db/enums';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { jakartaDayBounds } from '@/lib/utils/dates';
import type { AdjustmentFilter } from '@/lib/validations/finance-filters';
import type { Adjustment, FinanceList } from '@/types/finance';

// /dashboard/finance/adjustments (Task P4.7.04): the adjustments newest first under RLS (payment_adjustments_super_read),
// at most FINANCE_LIST_LIMIT at a time, filtered by status and the Jakarta days they were proposed on so an older
// approval stays reachable (review of PR #80, L-5). Each row says whether it has evidence to open (M-3) and, for an
// applied manual refund, whether Midtrans' disagreement over its key still blocks record_refund (L-1).

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
    weather_link_id: z.string().optional(),
  }),
  evidence_path: z.string().nullable(),
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
  'id, booking_id, payment_id, type, status, amount, reason, details, evidence_path, proposed_by, proposed_at, approved_by, approved_at, apply_not_before, applied_at, rejected_reason';
const KEY_MISMATCH_PREFIX = 'refund_key_mismatch:';

async function namesOf(
  table: 'profiles' | 'bookings',
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();
  const column = table === 'profiles' ? 'full_name' : 'booking_code';
  const { data, error } = await supabase
    .from(table)
    .select(`id, ${column}`)
    .in('id', [...new Set(ids)]);
  if (error) throw error;
  const rows = z.array(z.record(z.string(), z.string().nullable())).parse(data);
  return new Map(
    rows.flatMap((row) => (row.id && row[column] ? [[row.id, row[column]] as const] : [])),
  );
}

const mismatchAlertSchema = z.object({
  fingerprint: z.string(),
  details: z.looseObject({ release_note: z.string().optional() }),
});

// Review of PR #80, L-3: an adjustment is blocked while its latest refund_key_mismatch alert carries no release note,
// acknowledged or not; a plain acknowledgement releases nothing (release_refund_key_mismatch, 20261104190200).
export function blockedOf(alertsNewestFirst: readonly z.infer<typeof mismatchAlertSchema>[]): Set<string> {
  const latest = new Map<string, boolean>();
  for (const alert of alertsNewestFirst) {
    if (!latest.has(alert.fingerprint)) latest.set(alert.fingerprint, !alert.details.release_note);
  }
  const blocked = [...latest].filter(([, isBlocked]) => isBlocked);
  return new Set(blocked.map(([fingerprint]) => fingerprint.slice(KEY_MISMATCH_PREFIX.length)));
}

// The applied manual refunds among the rows whose Midtrans disagreement over their key still blocks (L6).
async function blockedByKeyMismatch(rows: readonly AdjustmentRow[]): Promise<Set<string>> {
  const fingerprints = rows
    .filter((row) => row.type === 'manual_refund' && row.status === 'applied')
    .map((row) => `${KEY_MISMATCH_PREFIX}${row.id}`);
  if (fingerprints.length === 0) return new Set();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('security_alerts')
    .select('fingerprint, details')
    .in('fingerprint', fingerprints)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return blockedOf(z.array(mismatchAlertSchema).parse(data));
}

interface RowNames {
  people: Map<string, string>;
  codes: Map<string, string>;
  blocked: Set<string>;
}

function adjustmentOf(row: AdjustmentRow, names: RowNames): Adjustment {
  return {
    id: row.id,
    bookingId: row.booking_id,
    bookingCode: names.codes.get(row.booking_id) ?? null,
    paymentId: row.payment_id,
    type: row.type,
    status: row.status,
    amount: row.amount,
    reason: row.reason,
    details: {
      lineRef: row.details.line_ref,
      fromKey: row.details.from_key,
      toKey: row.details.to_key,
      weatherLinkId: row.details.weather_link_id,
    },
    proposedBy: row.proposed_by,
    proposedByName: names.people.get(row.proposed_by) ?? null,
    proposedAt: row.proposed_at,
    approvedByName: row.approved_by ? (names.people.get(row.approved_by) ?? null) : null,
    approvedAt: row.approved_at,
    applyNotBefore: row.apply_not_before,
    appliedAt: row.applied_at,
    rejectedReason: row.rejected_reason,
    hasEvidence: row.evidence_path !== null,
    hasOpenKeyMismatch: names.blocked.has(row.id),
  };
}

async function adjustmentRows(filter: AdjustmentFilter): Promise<AdjustmentRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('payment_adjustments').select(ADJUSTMENT_COLUMNS);
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.from) query = query.gte('proposed_at', jakartaDayBounds(filter.from).start);
  if (filter.to) query = query.lt('proposed_at', jakartaDayBounds(filter.to).end);
  // One row past the page tells whether there are more to filter for.
  const { data, error } = await query
    .order('proposed_at', { ascending: false })
    .limit(FINANCE_LIST_LIMIT + 1);
  if (error) throw error;
  return z.array(adjustmentRowSchema).parse(data);
}

export async function listAdjustments(filter: AdjustmentFilter): Promise<FinanceList<Adjustment>> {
  const fetched = await adjustmentRows(filter);
  const rows = fetched.slice(0, FINANCE_LIST_LIMIT);
  const [people, codes, blocked] = await Promise.all([
    namesOf(
      'profiles',
      rows.flatMap((row) =>
        row.approved_by ? [row.proposed_by, row.approved_by] : [row.proposed_by],
      ),
    ),
    namesOf(
      'bookings',
      rows.map((row) => row.booking_id),
    ),
    blockedByKeyMismatch(rows),
  ]);
  return {
    items: rows.map((row) => adjustmentOf(row, { people, codes, blocked })),
    hasMore: fetched.length > FINANCE_LIST_LIMIT,
  };
}
