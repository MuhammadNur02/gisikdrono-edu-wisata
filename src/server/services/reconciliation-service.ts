import 'server-only';

import { z } from 'zod';

import { FINANCE_LIST_LIMIT, ISSUE_RESOLUTIONS, RECONCILIATION_RUNS_LIMIT } from '@/config/finance';
import { DB_ENUMS } from '@/db/enums';
import { verifyAuditChain } from '@/db/rpc-finance';
import { reconciliationCopy } from '@/lib/copy/finance-adjustments';
import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ResolveIssueValues } from '@/lib/validations/finance';
import type { StaffContext } from '@/server/auth/guards';
import { asFinanceWrite } from '@/server/services/finance-errors';
import type { ChainStatus, ReconciliationIssue, ReconciliationRun } from '@/types/finance';

// /dashboard/finance/reconciliation (Task P4.7.04; docs/Security.md REC-01, REC-09): the nightly runs, the issues
// still open, and the superadmin closing one in their own name with a note (reconciliation_issues_super_resolve,
// 20261103150000: a closed issue stays closed). The chains are checked through verify_audit_chain.

const runRowSchema = z.object({
  id: z.uuid(),
  run_date: z.string(),
  source: z.string(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  payments_checked: z.number().int(),
  issues_found: z.number().int(),
  ledger_chain_ok: z.boolean().nullable(),
  audit_chain_ok: z.boolean().nullable(),
});

export async function listRuns(): Promise<ReconciliationRun[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('reconciliation_runs')
    .select('id, run_date, source, started_at, finished_at, payments_checked, issues_found, ledger_chain_ok, audit_chain_ok')
    .order('started_at', { ascending: false })
    .limit(RECONCILIATION_RUNS_LIMIT);
  if (error) throw error;
  return z.array(runRowSchema).parse(data).map((row) => ({
    id: row.id,
    runDate: row.run_date,
    source: row.source,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    paymentsChecked: row.payments_checked,
    issuesFound: row.issues_found,
    ledgerChainOk: row.ledger_chain_ok,
    auditChainOk: row.audit_chain_ok,
  }));
}

const issueRowSchema = z.object({
  id: z.uuid(),
  run_id: z.uuid(),
  booking_id: z.uuid().nullable(),
  payment_id: z.uuid().nullable(),
  issue_type: z.string(),
  severity: z.enum(DB_ENUMS.alert_severity),
  created_at: z.string(),
  resolved_at: z.string().nullable(),
  resolution: z.enum(ISSUE_RESOLUTIONS).nullable(),
  resolution_note: z.string().nullable(),
  bookings: z.object({ booking_code: z.string() }).nullable(),
  payments: z.object({ order_id: z.string() }).nullable(),
});

export async function listOpenIssues(): Promise<ReconciliationIssue[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('reconciliation_issues')
    .select(
      'id, run_id, booking_id, payment_id, issue_type, severity, created_at, resolved_at, resolution, resolution_note, bookings(booking_code), payments(order_id)',
    )
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(FINANCE_LIST_LIMIT);
  if (error) throw error;
  return z.array(issueRowSchema).parse(data).map((row) => ({
    id: row.id,
    runId: row.run_id,
    bookingId: row.booking_id,
    bookingCode: row.bookings?.booking_code ?? null,
    paymentId: row.payment_id,
    orderId: row.payments?.order_id ?? null,
    issueType: row.issue_type,
    severity: row.severity,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolution: row.resolution,
    resolutionNote: row.resolution_note,
  }));
}

// Closes an open issue once; an issue already closed (or out of the superadmin's sight) updates no row.
export async function resolveIssue(ctx: StaffContext, values: ResolveIssueValues): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('reconciliation_issues')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: ctx.userId,
      resolution: values.resolution,
      resolution_note: values.note,
    })
    .eq('id', values.issueId)
    .is('resolved_at', null)
    .select('id');
  if (error) throw error;
  if (data.length === 0) throw new AppError('STATE_INVALID', reconciliationCopy.alreadyClosed);
}

export async function checkChains(): Promise<ChainStatus> {
  const supabase = await createSupabaseServerClient();
  return asFinanceWrite(() => verifyAuditChain(supabase));
}
