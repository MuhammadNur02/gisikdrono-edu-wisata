'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Archive, ExternalLink, Pencil, ShoppingBag } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ColumnHeader } from '@/components/admin/data-table/column-header';
import { DataTable } from '@/components/admin/data-table/data-table';
import { RowActions, type RowActionItem } from '@/components/admin/data-table/row-actions';
import type { ConfirmRequest } from '@/components/admin/shell/confirm-action-dialog';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { ContentStatusBadge } from '@/components/admin/status/status-badge';
import { PRODUCT_PATHS } from '@/config/products';
import { rwLabel } from '@/config/rw';
import { PRODUCT_CATEGORY } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { productsCopy } from '@/lib/copy/products';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateShort } from '@/lib/utils/dates';
import type { ActionResult } from '@/types/action-result';
import type { ListFacet } from '@/types/data-table';
import type { ProductListItem } from '@/types/product';

const text = productsCopy;

// The confirmation loads on the first archive, outside the list page's first load (admin budget, review of PR #35).
const ConfirmActionDialog = dynamic(() =>
  import('@/components/admin/shell/confirm-action-dialog').then(
    (module) => module.ConfirmActionDialog,
  ),
);

export interface ProductTableProps {
  rows: ProductListItem[];
  total: number;
  facets: readonly ListFacet[];
  // Entry is the superadmin's (decision of 2026-10-24); an RW admin gets no archive action.
  archiveAction: ((input: unknown) => Promise<ActionResult<null>>) | null;
}

function actionsOf(
  product: ProductListItem,
  askArchive: ((product: ProductListItem) => void) | null,
): RowActionItem[] {
  const items: RowActionItem[] = [
    {
      label: askArchive ? text.actions.edit : text.actions.detail,
      icon: Pencil,
      href: PRODUCT_PATHS.edit(product.id),
    },
  ];
  if (product.status === 'published') {
    const href = `${PRODUCT_PATHS.publicPrefix}${product.slug}`;
    items.push({ label: text.actions.view, icon: ExternalLink, href });
  }
  if (askArchive && product.status !== 'archived') {
    items.push({
      label: text.actions.archive,
      icon: Archive,
      destructive: true,
      onSelect: () => {
        askArchive(product);
      },
    });
  }
  return items;
}

function nameColumns(): ColumnDef<ProductListItem>[] {
  return [
    {
      id: 'name',
      accessorFn: (product) => product.name,
      header: ({ column }) => <ColumnHeader column={column} title={text.columns.name} />,
      cell: ({ row }) => (
        <Link
          href={PRODUCT_PATHS.edit(row.original.id)}
          className="font-medium underline-offset-4 hover:underline focus-visible:underline"
        >
          {row.original.name}
        </Link>
      ),
      meta: { label: text.columns.name, card: 'title' },
    },
    {
      id: 'vendor',
      header: text.columns.vendor,
      cell: ({ row }) => row.original.vendorName,
      meta: { label: text.columns.vendor },
    },
    {
      id: 'category',
      header: text.columns.category,
      cell: ({ row }) => PRODUCT_CATEGORY[row.original.category].label,
      meta: { label: text.columns.category },
    },
    {
      id: 'rw',
      header: text.columns.rw,
      cell: ({ row }) => rwLabel(row.original.rwId),
      meta: { label: text.columns.rw },
    },
  ];
}

function stateColumns(
  askArchive: ((product: ProductListItem) => void) | null,
): ColumnDef<ProductListItem>[] {
  return [
    {
      id: 'price',
      accessorFn: (product) => product.price,
      header: ({ column }) => <ColumnHeader column={column} title={text.columns.price} />,
      cell: ({ row }) =>
        text.columns.perUnit(formatIDR(row.original.price), row.original.unitLabel),
      meta: { label: text.columns.price, align: 'right' },
    },
    {
      id: 'status',
      header: text.columns.status,
      cell: ({ row }) => <ContentStatusBadge status={row.original.status} />,
      meta: { label: text.columns.status, card: 'badge' },
    },
    {
      id: 'updated_at',
      accessorFn: (product) => product.updatedAt,
      header: ({ column }) => <ColumnHeader column={column} title={text.columns.updatedAt} />,
      cell: ({ row }) => formatDateShort(row.original.updatedAt),
      meta: { label: text.columns.updatedAt },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">{copy.cms.common.actions}</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RowActions name={row.original.name} items={actionsOf(row.original, askArchive)} />
        </div>
      ),
      meta: { card: 'actions' },
    },
  ];
}

// Task P4.3.06 (docs/StyleGuide.md §6.4): one page of products from the URL's query; archive confirmed in a
// ResponsiveDialog, by status, never a delete.
export function ProductTable({ rows, total, facets, archiveAction }: ProductTableProps) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const columns = useMemo(() => {
    const askArchive = archiveAction
      ? (product: ProductListItem) => {
          setRequest({
            run: () => archiveAction({ id: product.id }),
            title: text.actions.archiveTitle(product.name),
            consequence: text.actions.archiveConsequence,
            confirmLabel: text.actions.archive,
            done: text.actions.archived,
          });
        }
      : null;
    return [...nameColumns(), ...stateColumns(askArchive)];
  }, [archiveAction]);
  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        noun={text.noun}
        facets={facets}
        searchPlaceholder={text.search}
        emptyState={
          <EmptyState icon={ShoppingBag} title={text.empty} description={text.emptyHint} />
        }
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
