import type { Metadata } from 'next';

import { ChainCheck } from '@/components/admin/finance/chain-check';
import { IssueActions } from '@/components/admin/finance/issue-actions';
import { IssuesTable, RunsTable } from '@/components/admin/finance/reconciliation-tables';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { financeCopy } from '@/lib/copy/finance';
import { reconciliationCopy } from '@/lib/copy/finance-adjustments';
import {
  checkChainsAction,
  recheckPaymentAction,
  resolveIssueAction,
} from '@/server/actions/finance-reconciliation';
import { verifyStaffTotpAction } from '@/server/actions/staff-totp';
import { requireDashboardStaff } from '@/server/auth/session';
import { listOpenIssues, listRuns } from '@/server/services/reconciliation-service';
import type { ReconciliationIssue } from '@/types/finance';

const text = reconciliationCopy;

export const metadata: Metadata = { title: text.title };

// Task P4.7.04 (docs/PRD.md FR-ADMIN-21; docs/Security.md REC-01, REC-09): the reconciliation runs, the issues still
// open with "Cek status Midtrans" and their closing, and the chain check. The superadmin's alone, at AAL2.
export default async function ReconciliationPage() {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  if (ctx.role !== 'superadmin') {
    return (
      <>
        <DashboardPageHeader title={text.title} />
        <FormAlert tone="info">{financeCopy.onlySuper}</FormAlert>
      </>
    );
  }
  const [runs, issues] = await Promise.all([listRuns(), listOpenIssues()]);
  const actionsFor = (issue: ReconciliationIssue) => (
    <IssueActions
      issueId={issue.id}
      paymentId={issue.paymentId}
      resolveAction={resolveIssueAction}
      recheckAction={recheckPaymentAction}
      stepUpAction={verifyStaffTotpAction}
    />
  );
  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} />
      <div className="flex flex-col gap-6">
        <IssuesTable issues={issues} actionsFor={actionsFor} />
        <ChainCheck checkAction={checkChainsAction} />
        <RunsTable runs={runs} />
      </div>
    </>
  );
}
