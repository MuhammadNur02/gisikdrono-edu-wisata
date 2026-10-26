import type { Metadata } from 'next';

import { DashboardPageHeader } from '@/components/admin/shell/dashboard-page-header';
import { InviteButton } from '@/components/admin/staff/invite-button';
import { UsersBoard } from '@/components/admin/staff/users-board';
import { FormAlert } from '@/components/forms/form-alert';
import { staffCopy } from '@/lib/copy/staff';
import { rwFacet } from '@/lib/utils/facets';
import { loadListQuery } from '@/lib/utils/list-query';
import {
  cancelSuperadminPromotionAction,
  inviteStaffAction,
  revokeStaffInviteAction,
  setStaffRoleAction,
  setStaffStatusAction,
} from '@/server/actions/staff';
import { verifyStaffTotpAction } from '@/server/actions/staff-totp';
import { requireDashboardStaff } from '@/server/auth/session';
import { listRwUnitsForStaff } from '@/server/services/rw-unit-service';
import {
  listOpenInvites,
  listStaffMembers,
  STAFF_STATUS_FILTERS,
} from '@/server/services/staff-directory-service';
import type { ListFacet } from '@/types/data-table';

const text = staffCopy;

export const metadata: Metadata = { title: text.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATUS_FACET: ListFacet = {
  param: 'status',
  title: text.facets.status,
  options: STAFF_STATUS_FILTERS.map((value) => ({ value, label: text.statuses[value] })),
};

const STAFF_CHANGE_ACTIONS = {
  stepUpAction: verifyStaffTotpAction,
  setRoleAction: setStaffRoleAction,
  setStatusAction: setStaffStatusAction,
  cancelPromotionAction: cancelSuperadminPromotionAction,
  revokeInviteAction: revokeStaffInviteAction,
};

function SuperadminOnly() {
  return (
    <>
      <DashboardPageHeader title={text.title} />
      <FormAlert tone="info">{text.onlySuper}</FormAlert>
    </>
  );
}

// Task P4.8.03, docs/PRD.md FR-ADMIN-01: the superadmin's alone. An RW admin has no menu item for it, and opening the
// address says so instead of showing anything; RLS would show them their own RW's colleagues only, and every change
// is refused to them by the actions and the staff RPCs.
export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireDashboardStaff();
  if (!ctx) return null;
  if (ctx.role !== 'superadmin') return <SuperadminOnly />;
  const query = await loadListQuery(searchParams);
  const [invites, rwUnits] = await Promise.all([listOpenInvites(), listRwUnitsForStaff()]);
  const list = await listStaffMembers(ctx, query, invites);
  const rwOptions = rwUnits.map((unit) => ({ id: unit.id, name: unit.name }));
  const inviteButton = (
    <InviteButton
      rwUnits={rwOptions}
      inviteAction={inviteStaffAction}
      stepUpAction={verifyStaffTotpAction}
    />
  );

  return (
    <>
      <DashboardPageHeader
        title={text.title}
        description={text.description}
        action={inviteButton}
      />
      <UsersBoard
        members={list.rows}
        total={list.total}
        facets={[STATUS_FACET, rwFacet(text.facets.rw, rwUnits)]}
        invites={invites}
        rwUnits={rwOptions}
        actions={STAFF_CHANGE_ACTIONS}
      />
    </>
  );
}
