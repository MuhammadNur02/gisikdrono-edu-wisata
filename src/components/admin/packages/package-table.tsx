'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Archive, ExternalLink, Package, Pencil } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ColumnHeader } from '@/components/admin/data-table/column-header';
import { DataTable } from '@/components/admin/data-table/data-table';
import { RowActions, type RowActionItem } from '@/components/admin/data-table/row-actions';
import type { ConfirmRequest } from '@/components/admin/shell/confirm-action-dialog';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { ContentStatusBadge } from '@/components/admin/status/status-badge';
import { PACKAGE_PATHS } from '@/config/packages';
import { rwLabel, type RwId } from '@/config/rw';
import { PACKAGE_CATEGORY } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateShort } from '@/lib/utils/dates';
import type { ActionResult } from '@/types/action-result';
import type { ListFacet } from '@/types/data-table';
import type { PackageListItem } from '@/types/package';

const text = copy.packages;

// The confirmation loads on the first archive, outside the list page's first load (admin budget, review of PR #35).
const ConfirmActionDialog = dynamic(() =>
  import('@/components/admin/shell/confirm-action-dialog').then(
    (module) => module.ConfirmActionDialog,
  ),
);

type ArchiveAction = (input: unknown) => Promise<ActionResult<null>>;

export interface PackageTableProps {
  rows: PackageListItem[];
  total: number;
  facets: readonly ListFacet[];
  // The superadmin writes every package; an RW admin their own RW's, and reads the combos that visit it.
  isSuperadmin: boolean;
  ownRwId: RwId | null;
  archiveAction: ArchiveAction;
}

function priceOf(pkg: PackageListItem): string {
  if (pkg.pricingBasis === 'flat_group' && pkg.flatPrice !== null) {
    return text.columns.perGroup(formatIDR(pkg.flatPrice));
  }
  return pkg.pricePerPax === null ? '—' : text.columns.perPax(formatIDR(pkg.pricePerPax));
}

function canWrite(
  pkg: PackageListItem,
  props: Pick<PackageTableProps, 'isSuperadmin' | 'ownRwId'>,
) {
  return props.isSuperadmin || (pkg.rwId !== null && pkg.rwId === props.ownRwId);
}

function actionsOf(
  pkg: PackageListItem,
  writable: boolean,
  askArchive: (pkg: PackageListItem) => void,
): RowActionItem[] {
  const items: RowActionItem[] = [
    {
      label: writable ? text.actions.edit : text.actions.detail,
      icon: Pencil,
      href: PACKAGE_PATHS.edit(pkg.id),
    },
  ];
  if (pkg.status === 'published') {
    items.push({
      label: text.actions.view,
      icon: ExternalLink,
      href: `${PACKAGE_PATHS.publicPrefix}${pkg.slug}`,
    });
  }
  if (writable && pkg.status !== 'archived') {
    items.push({
      label: text.actions.archive,
      icon: Archive,
      destructive: true,
      onSelect: () => {
        askArchive(pkg);
      },
    });
  }
  return items;
}

function identityColumns(): ColumnDef<PackageListItem>[] {
  return [
    {
      id: 'name',
      accessorFn: (pkg) => pkg.name,
      header: ({ column }) => <ColumnHeader column={column} title={text.columns.name} />,
      cell: ({ row }) => (
        <Link
          href={PACKAGE_PATHS.edit(row.original.id)}
          className="font-medium underline-offset-4 hover:underline focus-visible:underline"
        >
          {row.original.name}
        </Link>
      ),
      meta: { label: text.columns.name, card: 'title' },
    },
    {
      id: 'category',
      cell: ({ row }) => PACKAGE_CATEGORY[row.original.category].label,
      header: text.columns.category,
      meta: { label: text.columns.category },
    },
    {
      id: 'rw',
      cell: ({ row }) => row.original.rwIds.map(rwLabel).join(' + '),
      header: text.columns.rw,
      meta: { label: text.columns.rw },
    },
    {
      id: 'price_per_pax',
      accessorFn: (pkg) => pkg.pricePerPax,
      header: ({ column }) => <ColumnHeader column={column} title={text.columns.price} />,
      cell: ({ row }) => priceOf(row.original),
      meta: { label: text.columns.price, align: 'right' },
    },
  ];
}

function stateColumns(
  props: Pick<PackageTableProps, 'isSuperadmin' | 'ownRwId'>,
  askArchive: (pkg: PackageListItem) => void,
): ColumnDef<PackageListItem>[] {
  return [
    {
      id: 'pax',
      cell: ({ row }) => text.columns.paxRange(row.original.minPax, row.original.maxPax),
      header: text.columns.pax,
      meta: { label: text.columns.pax },
    },
    {
      id: 'status',
      cell: ({ row }) => <ContentStatusBadge status={row.original.status} />,
      header: text.columns.status,
      meta: { label: text.columns.status, card: 'badge' },
    },
    {
      id: 'updated_at',
      accessorFn: (pkg) => pkg.updatedAt,
      header: ({ column }) => <ColumnHeader column={column} title={text.columns.updatedAt} />,
      cell: ({ row }) => formatDateShort(row.original.updatedAt),
      meta: { label: text.columns.updatedAt },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">{copy.cms.common.actions}</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RowActions
            name={row.original.name}
            items={actionsOf(row.original, canWrite(row.original, props), askArchive)}
          />
        </div>
      ),
      meta: { card: 'actions' },
    },
  ];
}

// Task P4.3.05 (docs/StyleGuide.md §6.4): one page of packages from the URL's query, archive confirmed in a
// ResponsiveDialog; a package is archived by status, never deleted.
export function PackageTable({ rows, total, facets, archiveAction, ...scope }: PackageTableProps) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const { isSuperadmin, ownRwId } = scope;
  const columns = useMemo(
    () => [
      ...identityColumns(),
      ...stateColumns({ isSuperadmin, ownRwId }, (pkg) => {
        setRequest({
          run: () => archiveAction({ id: pkg.id }),
          title: text.actions.archiveTitle(pkg.name),
          consequence: text.actions.archiveConsequence,
          confirmLabel: text.actions.archive,
          done: text.actions.archived,
        });
      }),
    ],
    [isSuperadmin, ownRwId, archiveAction],
  );
  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        noun={text.noun}
        facets={facets}
        searchPlaceholder={text.search}
        emptyState={<EmptyState icon={Package} title={text.empty} description={text.emptyHint} />}
      />
      {request ? (
        <ConfirmActionDialog
          request={request}
          onClose={() => {
            setRequest(null);
          }}
        />
      ) : null}
    </>
  );
}
