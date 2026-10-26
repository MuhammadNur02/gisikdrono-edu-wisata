import type { Metadata } from 'next';

import { AdjustmentActions } from '@/components/admin/finance/adjustment-actions';
import { AdjustmentsTable } from '@/components/admin/finance/adjustments-table';
import { EvidenceLink } from '@/components/admin/finance/evidence-link';
import { ProposeDialog } from '@/components/admin/finance/propose-dialog';
import { ReleaseDialog } from '@/components/admin/finance/release-dialog';
import { FilterBar, type FilterField } from '@/components/admin/security/filter-bar';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { ADJUSTMENTS_PATH } from '@/config/finance';
import { ADJUSTMENT_STATUS } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { financeCopy } from '@/lib/copy/finance';
import { adjustmentsCopy } from '@/lib/copy/finance-adjustments';
import { parseAdjustmentFilter, type AdjustmentFilter } from '@/lib/validations/finance';
import {
  applyAdjustmentAction,
  approveAdjustmentAction,
  findFinanceBookingAction,
  proposeAdjustmentAction,
  rejectAdjustmentAction,
  releaseKeyMismatchAction,
} from '@/server/actions/finance-adjustments';
import { viewFinanceEvidenceAction } from '@/server/actions/finance-evidence';
import { verifyStaffTotpAction } from '@/server/actions/staff-totp';
import { requireDashboardStaff } from '@/server/auth/session';
import { listAdjustments } from '@/server/services/adjustment-reads';
import type { Adjustment } from '@/types/finance';

const text = adjustmentsCopy;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Review of PR #80, L-5: an older approval stays reachable by status and the days it was proposed on.
function filterFields(filter: AdjustmentFilter): FilterField[] {
  return [
    {
      kind: 'select',
      name: 'status',
      label: text.filters.status,
      value: filter.status ?? undefined,
      options: DB_ENUMS.adjustment_status.map((status) => ({
        value: status,
        label: ADJUSTMENT_STATUS[status].label,
      })),
    },
    { kind: 'date', name: 'from', label: text.filters.from, value: filter.from ?? undefined },
    { kind: 'date', name: 'to', label: text.filters.to, value: filter.to ?? undefined },
  ];
}

// A row's next steps: its evidence for the approver to open (M-3), its workflow, and an L6 block to release (L-1).
function RowActions({ adjustment, nowIso }: { adjustment: Adjustment; nowIso: string }) {
  return (
    <div className="flex flex-col items-end gap-2">
      {adjustment.hasEvidence ? (
        <EvidenceLink kind="adjustment" id={adjustment.id} viewAction={viewFinanceEvidenceAction} />
      ) : null}
      <AdjustmentActions
        adjustment={{
          id: adjustment.id,
          status: adjustment.status,
          applyNotBefore: adjustment.applyNotBefore,
        }}
        nowIso={nowIso}
        approveAction={approveAdjustmentAction}
        rejectAction={rejectAdjustmentAction}
        applyAction={applyAdjustmentAction}
        stepUpAction={verifyStaffTotpAction}
      />
      {adjustment.hasOpenKeyMismatch ? (
        <ReleaseDialog
          adjustmentId={adjustment.id}
          releaseAction={releaseKeyMismatchAction}
          stepUpAction={verifyStaffTotpAction}
        />
      ) : null}
    </div>
  );
}

// Task P4.7.04 (docs/PRD.md FR-ADMIN-21; docs/Security.md §3.8, REC-09, REC-16): the dual-controlled adjustments,
// proposed with evidence, approved by another superadmin (or, alone, after 24 hours), and applied once; an approval
// that can no longer apply is withdrawn. The superadmin's alone, at AAL2, each step behind the authenticator code.
export default async function AdjustmentsPage({ searchParams }: { searchParams: SearchParams }) {
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
  const filter = parseAdjustmentFilter(await searchParams);
  const adjustments = await listAdjustments(filter);
  const nowIso = new Date().toISOString();
  const propose = (
    <ProposeDialog
      findAction={findFinanceBookingAction}
      proposeAction={proposeAdjustmentAction}
      stepUpAction={verifyStaffTotpAction}
    />
  );
  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} action={propose} />
      <div className="flex flex-col gap-6">
        <FilterBar fields={filterFields(filter)} resetHref={ADJUSTMENTS_PATH} />
        {adjustments.hasMore ? <FormAlert tone="info">{text.more}</FormAlert> : null}
        <AdjustmentsTable
          adjustments={adjustments.items}
          actionsFor={(adjustment) => <RowActions adjustment={adjustment} nowIso={nowIso} />}
          proposeAction={propose}
        />
      </div>
    </>
  );
}
