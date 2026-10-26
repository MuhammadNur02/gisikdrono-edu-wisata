import type { Metadata } from 'next';

import { ChainCheck } from '@/components/admin/finance/chain-check';
import { IssueActions } from '@/components/admin/finance/issue-actions';
import { IssuesTable, RunsTable } from '@/components/admin/finance/reconciliation-tables';
import { FilterBar, type FilterField } from '@/components/admin/security/filter-bar';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { RECONCILIATION_PATH } from '@/config/finance';
import { financeCopy } from '@/lib/copy/finance';
import { reconciliationCopy } from '@/lib/copy/finance-adjustments';
import { parseDayFilter, type DayFilter } from '@/lib/validations/finance';
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

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Review of PR #80, L-5: an older open issue stays reachable by the days it was found on.
function filterFields(filter: DayFilter): FilterField[] {
  return [
    { kind: 'date', name: 'from', label: text.filters.from, value: filter.from ?? undefined },
    { kind: 'date', name: 'to', label: text.filters.to, value: filter.to ?? undefined },
  ];
}

// Task P4.7.04 (docs/PRD.md FR-ADMIN-21; docs/Security.md REC-01, REC-09): the reconciliation runs, the issues still
// open with "Cek status Midtrans" and their closing, and the chain check. The superadmin's alone, at AAL2.
export default async function ReconciliationPage({ searchParams }: { searchParams: SearchParams }) {
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
  const filter = parseDayFilter(await searchParams);
  const [runs, issues] = await Promise.all([listRuns(), listOpenIssues(filter)]);
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
        <FilterBar fields={filterFields(filter)} resetHref={RECONCILIATION_PATH} />
        {issues.hasMore ? <FormAlert tone="info">{text.more}</FormAlert> : null}
        <IssuesTable issues={issues.items} actionsFor={actionsFor} />
        <ChainCheck checkAction={checkChainsAction} />
        <RunsTable runs={runs} />
      </div>
    </>
  );
}
