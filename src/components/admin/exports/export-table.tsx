'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Download, FileSpreadsheet } from 'lucide-react';
import type { ReactNode } from 'react';

import { DataTable } from '@/components/admin/data-table/data-table';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { rwLabel } from '@/config/rw';
import { exportsCopy } from '@/lib/copy/exports';
import { formatDateShort, formatDateTimeShort } from '@/lib/utils/dates';
import type { ListFacet } from '@/types/data-table';
import type { ExportListItem } from '@/types/export';

const text = exportsCopy.history;
const columnsText = text.columns;

function periodText(row: ExportListItem): string {
  if (!row.periodFrom || !row.periodTo) return '–';
  return `${formatDateShort(row.periodFrom)} – ${formatDateShort(row.periodTo)}`;
}

// "Unduh lagi" while the file is within its 24 hours: a plain link to the route, which answers with a fresh 300-second
// link; after that, the export only says it has expired, or that it never had a file.
function DownloadCell({ row }: { row: ExportListItem }) {
  if (row.hasFailed) return <Badge variant="danger">{text.failed}</Badge>;
  if (!row.isAvailable) return <Badge variant="neutral">{text.expired}</Badge>;
  const kindLabel = exportsCopy.kinds[row.kind];
  return (
    <Button asChild variant="outline" size="sm">
      <a
        href={`/api/export/${row.kind}?id=${row.id}`}
        aria-label={text.downloadOf(kindLabel, formatDateTimeShort(row.createdAt))}
      >
        <Download aria-hidden />
        {text.download}
      </a>
    </Button>
  );
}

const EXPORT_COLUMNS: ColumnDef<ExportListItem>[] = [
  {
    id: 'created_at',
    header: columnsText.createdAt,
    cell: ({ row }) => (
      <span className="tabular-nums">{formatDateTimeShort(row.original.createdAt)}</span>
    ),
    meta: { label: columnsText.createdAt, card: 'meta' },
  },
  {
    id: 'kind',
    header: columnsText.kind,
    cell: ({ row }) => (
      <span className="font-medium">
        {exportsCopy.kinds[row.original.kind]} · {row.original.format.toUpperCase()}
      </span>
    ),
    meta: { label: columnsText.kind, card: 'title' },
  },
  {
    id: 'period',
    header: columnsText.period,
    cell: ({ row }) => periodText(row.original),
    meta: { label: columnsText.period, card: 'meta' },
  },
  {
    id: 'rw',
    header: columnsText.rw,
    cell: ({ row }) => (row.original.rwId === null ? text.allRws : rwLabel(row.original.rwId)),
    meta: { label: columnsText.rw, card: 'meta' },
  },
  {
    id: 'rows',
    header: columnsText.rows,
    cell: ({ row }) => (row.original.rowCount === null ? '–' : String(row.original.rowCount)),
    meta: { label: columnsText.rows, card: 'meta', align: 'right' },
  },
  {
    id: 'purpose',
    header: columnsText.purpose,
    cell: ({ row }) => <span className="line-clamp-2 max-w-72">{row.original.purpose ?? '–'}</span>,
    meta: { label: columnsText.purpose, card: 'meta' },
  },
  {
    id: 'requested_by',
    header: columnsText.requestedBy,
    cell: ({ row }) => row.original.requestedByName ?? '–',
    meta: { label: columnsText.requestedBy, card: 'meta' },
  },
  {
    id: 'expires_at',
    header: columnsText.expiry,
    cell: ({ row }) =>
      row.original.isAvailable ? text.expiresAt(formatDateTimeShort(row.original.expiresAt)) : '–',
    meta: { label: columnsText.expiry, card: 'meta' },
  },
  {
    id: 'action',
    header: () => <span className="sr-only">{columnsText.action}</span>,
    cell: ({ row }) => <DownloadCell row={row.original} />,
    meta: { label: columnsText.action, card: 'actions' },
  },
];

export interface ExportTableProps {
  rows: ExportListItem[];
  total: number;
  facets: readonly ListFacet[];
  // The page's "Ekspor baru", repeated in the empty state as its one next step.
  createAction: ReactNode;
}

// Task P4.6.03: the staff member's exports (the superadmin's: everyone's), newest first, with their row counts and
// expiry, filtered by kind and, for the superadmin, RW, and searched by purpose.
export function ExportTable({ rows, total, facets, createAction }: ExportTableProps) {
  return (
    <DataTable
      columns={EXPORT_COLUMNS}
      rows={rows}
      total={total}
      noun={text.noun}
      facets={facets}
      searchPlaceholder={text.search}
      toolbarActions={createAction}
      emptyState={
        <EmptyState
          icon={FileSpreadsheet}
          title={text.empty}
          description={text.emptyHint}
          action={createAction}
        />
      }
    />
  );
}
