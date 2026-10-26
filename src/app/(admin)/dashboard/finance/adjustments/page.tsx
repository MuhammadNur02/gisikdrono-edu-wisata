import type { Metadata } from 'next';

import { AdjustmentActions } from '@/components/admin/finance/adjustment-actions';
import { AdjustmentsTable } from '@/components/admin/finance/adjustments-table';
import { ProposeDialog } from '@/components/admin/finance/propose-dialog';
import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { FormAlert } from '@/components/forms/form-alert';
import { financeCopy } from '@/lib/copy/finance';
import { adjustmentsCopy } from '@/lib/copy/finance-adjustments';
import {
  applyAdjustmentAction,
  approveAdjustmentAction,
  findFinanceBookingAction,
  proposeAdjustmentAction,
  rejectAdjustmentAction,
} from '@/server/actions/finance-adjustments';
import { verifyStaffTotpAction } from '@/server/actions/staff-totp';
import { requireDashboardStaff } from '@/server/auth/session';
import { listAdjustments } from '@/server/services/adjustment-service';
import type { Adjustment } from '@/types/finance';

const text = adjustmentsCopy;

export const metadata: Metadata = { title: text.title };

// Task P4.7.04 (docs/PRD.md FR-ADMIN-21; docs/Security.md §3.8, REC-09, REC-16): the dual-controlled adjustments,
// proposed with evidence, approved by another superadmin (or, alone, after 24 hours), and applied once; an approval
// that can no longer apply is withdrawn. The superadmin's alone, at AAL2, each step behind the authenticator code.
export default async function AdjustmentsPage() {
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
  const adjustments = await listAdjustments();
  const nowIso = new Date().toISOString();
  const propose = (
    <ProposeDialog
      findAction={findFinanceBookingAction}
      proposeAction={proposeAdjustmentAction}
      stepUpAction={verifyStaffTotpAction}
    />
  );
  const actionsFor = (adjustment: Adjustment) => (
    <AdjustmentActions
      adjustment={{ id: adjustment.id, status: adjustment.status, applyNotBefore: adjustment.applyNotBefore }}
      nowIso={nowIso}
      approveAction={approveAdjustmentAction}
      rejectAction={rejectAdjustmentAction}
      applyAction={applyAdjustmentAction}
      stepUpAction={verifyStaffTotpAction}
    />
  );
  return (
    <>
      <DashboardPageHeader title={text.title} description={text.description} action={propose} />
      <AdjustmentsTable adjustments={adjustments} actionsFor={actionsFor} proposeAction={propose} />
    </>
  );
}
