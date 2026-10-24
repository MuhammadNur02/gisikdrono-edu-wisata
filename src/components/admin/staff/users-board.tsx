'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';

import type {
  StaffChangeActions,
  StaffChangeRequest,
} from '@/components/admin/staff/change-dialog';
import { InviteList } from '@/components/admin/staff/invite-list';
import type { RwOption } from '@/components/admin/staff/role-select';
import { StaffTable } from '@/components/admin/staff/staff-table';
import type { ListFacet } from '@/types/data-table';
import type { StaffInviteSummary, StaffMember } from '@/types/staff';

// The change dialog and its forms load on the first row action, outside the page's first load (admin budget).
const StaffChangeDialog = dynamic(() =>
  import('@/components/admin/staff/change-dialog').then((module) => module.StaffChangeDialog),
);

export interface UsersBoardProps {
  members: StaffMember[];
  total: number;
  facets: readonly ListFacet[];
  invites: readonly StaffInviteSummary[];
  rwUnits: readonly RwOption[];
  actions: StaffChangeActions;
}

// /dashboard/users (Task P4.8.03): the staff list and the open invites share one change dialog.
export function UsersBoard({ members, total, facets, invites, rwUnits, actions }: UsersBoardProps) {
  const [request, setRequest] = useState<StaffChangeRequest | null>(null);
  const onRequest = useCallback((next: StaffChangeRequest) => {
    setRequest(next);
  }, []);
  return (
    <div className="space-y-6">
      <StaffTable rows={members} total={total} facets={facets} onRequest={onRequest} />
      <InviteList invites={invites} onRequest={onRequest} />
      {request ? (
        <StaffChangeDialog
          request={request}
          rwUnits={rwUnits}
          actions={actions}
          onClose={() => {
            setRequest(null);
          }}
        />
      ) : null}
    </div>
  );
}
