'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Ban, History, Power, ShieldCheck, ShieldOff, UserCog, Users, XCircle } from 'lucide-react';
import { useMemo } from 'react';

import { ColumnHeader } from '@/components/admin/data-table/column-header';
import { DataTable } from '@/components/admin/data-table/data-table';
import { RowActions, type RowActionItem } from '@/components/admin/data-table/row-actions';
import { EmptyState } from '@/components/admin/shell/empty-state';
import type { StaffChangeRequest } from '@/components/admin/staff/change-dialog';
import { Badge } from '@/components/ui/badge';
import { rwLabel } from '@/config/rw';
import { AUDIT_LOGS_PATH } from '@/config/staff';
import { copy } from '@/lib/copy/id';
import { staffCopy } from '@/lib/copy/staff';
import { formatDateTimeShort } from '@/lib/utils/dates';
import type { ListFacet } from '@/types/data-table';
import type { StaffMember } from '@/types/staff';

const text = staffCopy;

export interface StaffTableProps {
  rows: StaffMember[];
  total: number;
  facets: readonly ListFacet[];
  onRequest: (request: StaffChangeRequest) => void;
}

function roleOf(member: StaffMember): string {
  if (member.role === 'admin_rw' && member.rwId !== null)
    return `${text.roles.admin_rw} ${rwLabel(member.rwId)}`;
  return text.roles[member.role];
}

// The per-user audit trail is the audit log filtered to this profile.
function auditTrailHref(member: StaffMember): string {
  return `${AUDIT_LOGS_PATH}?entity=profiles&entityId=${member.id}`;
}

function actionsOf(member: StaffMember, onRequest: StaffTableProps['onRequest']): RowActionItem[] {
  const items: RowActionItem[] = [
    { label: text.actions.auditTrail, icon: History, href: auditTrailHref(member) },
  ];
  // docs/Security.md §5.3: never on the superadmin's own row (profiles_guard refuses it as well).
  if (member.isSelf) return items;
  // M1 of the review of PR #77: an account still being onboarded gets its role only by finishing onboarding.
  if (member.isAwaitingOnboarding) {
    const invite = member.pendingInvite;
    if (invite) {
      items.push({
        label: text.actions.revokeInvite,
        icon: Ban,
        destructive: true,
        onSelect: () => {
          onRequest({ kind: 'revokeInvite', invite });
        },
      });
    }
    return items;
  }
  const ask = (kind: 'role' | 'status' | 'cancelPromotion') => () => {
    onRequest({ kind, member });
  };
  // M1 of the PR #43 review: no role for an account without a verified factor (changeStaffRole refuses it too).
  if (member.isActive && member.hasVerifiedTotp)
    items.push({ label: text.actions.changeRole, icon: UserCog, onSelect: ask('role') });
  if (member.promotionRequestedAt !== null) {
    items.push({
      label: text.actions.cancelPromotion,
      icon: XCircle,
      onSelect: ask('cancelPromotion'),
    });
  }
  items.push({
    label: member.isActive ? text.actions.deactivate : text.actions.reactivate,
    icon: Power,
    destructive: member.isActive,
    onSelect: ask('status'),
  });
  return items;
}

function NameCell({ member }: { member: StaffMember }) {
  return (
    <div className="min-w-0">
      <span className="font-medium">{member.fullName}</span>
      {member.isSelf ? <span className="text-muted-foreground"> ({text.you})</span> : null}
      <span className="block text-caption break-all text-muted-foreground">{member.email}</span>
      {member.promotionRequestedAt ? (
        <span className="block text-caption text-warning-soft-foreground">
          {text.pending.promotion(formatDateTimeShort(member.promotionRequestedAt))}
        </span>
      ) : null}
      {member.mfaResetRequestedAt ? (
        <span className="block text-caption text-warning-soft-foreground">
          {text.pending.mfaReset}
        </span>
      ) : null}
    </div>
  );
}

function StatusBadgeOf({ member }: { member: StaffMember }) {
  if (member.isAwaitingOnboarding) {
    return <Badge variant="warning">{text.statuses.awaitingOnboarding}</Badge>;
  }
  return (
    <Badge variant={member.isActive ? 'success' : 'neutral'}>
      {member.isActive ? text.statuses.active : text.statuses.inactive}
    </Badge>
  );
}

function MfaBadge({ isEnrolled }: { isEnrolled: boolean }) {
  const Icon = isEnrolled ? ShieldCheck : ShieldOff;
  return (
    <Badge variant={isEnrolled ? 'success' : 'warning'}>
      <Icon aria-hidden />
      {isEnrolled ? text.mfa.enrolled : text.mfa.missing}
    </Badge>
  );
}

const IDENTITY_COLUMNS: ColumnDef<StaffMember>[] = [
  {
    id: 'name',
    accessorFn: (member) => member.fullName,
    header: ({ column }) => <ColumnHeader column={column} title={text.columns.name} />,
    cell: ({ row }) => <NameCell member={row.original} />,
    meta: { label: text.columns.name, card: 'title' },
  },
  {
    id: 'role',
    header: text.columns.role,
    cell: ({ row }) => roleOf(row.original),
    meta: { label: text.columns.role },
  },
];

function columnsFor(onRequest: StaffTableProps['onRequest']): ColumnDef<StaffMember>[] {
  return [
    ...IDENTITY_COLUMNS,
    {
      id: 'status',
      header: text.columns.status,
      cell: ({ row }) => <StatusBadgeOf member={row.original} />,
      meta: { label: text.columns.status, card: 'badge' },
    },
    {
      id: 'mfa',
      header: text.columns.mfa,
      cell: ({ row }) => <MfaBadge isEnrolled={row.original.hasVerifiedTotp} />,
      meta: { label: text.columns.mfa },
    },
    {
      id: 'last_sign_in',
      header: text.columns.lastSignIn,
      cell: ({ row }) =>
        row.original.lastSignInAt ? formatDateTimeShort(row.original.lastSignInAt) : text.never,
      meta: { label: text.columns.lastSignIn },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">{copy.cms.common.actions}</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RowActions name={row.original.fullName} items={actionsOf(row.original, onRequest)} />
        </div>
      ),
      meta: { card: 'actions' },
    },
  ];
}

// Task P4.8.03 (Recipe B): every staff account with its role, status, authenticator and last sign-in.
export function StaffTable({ rows, total, facets, onRequest }: StaffTableProps) {
  const columns = useMemo(() => columnsFor(onRequest), [onRequest]);
  return (
    <DataTable
      columns={columns}
      rows={rows}
      total={total}
      noun={text.noun}
      facets={facets}
      searchPlaceholder={text.searchPlaceholder}
      emptyState={<EmptyState icon={Users} title={text.empty} description={text.emptyHint} />}
    />
  );
}
