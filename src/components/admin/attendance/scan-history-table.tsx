'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ScanLine } from 'lucide-react';

import { DateFilter, type DateFilterProps } from '@/components/admin/attendance/date-filter';
import { ColumnHeader } from '@/components/admin/data-table/column-header';
import { DataTable } from '@/components/admin/data-table/data-table';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { attendanceCopy } from '@/lib/copy/attendance';
import { formatClockTime, formatTimeRange } from '@/lib/utils/dates';
import type { ScanHistoryRow } from '@/types/attendance';
import type { ListFacet } from '@/types/data-table';

const text = attendanceCopy.history;
const columnsText = text.columns;

function sessionText(row: ScanHistoryRow): string {
  const time = row.startTime && row.endTime ? formatTimeRange(row.startTime, row.endTime) : '–';
  return row.sessionLabel ? `${row.sessionLabel} · ${time}` : time;
}

// Read-only for now: undo and manual check-in arrive with their RPCs.
// TODO(P4.4.01, P4.4.04): an actions column (undo_check_in, manual check-in) once the DB lane's functions exist.
const SCAN_COLUMNS: ColumnDef<ScanHistoryRow>[] = [
  {
    id: 'scanned_at',
    accessorFn: (row) => row.scannedAt,
    header: ({ column }) => <ColumnHeader column={column} title={columnsText.scannedAt} />,
    cell: ({ row }) => (
      <span className="tabular-nums">{formatClockTime(row.original.scannedAt)}</span>
    ),
    meta: { label: columnsText.scannedAt, card: 'meta' },
  },
  {
    id: 'ticket',
    header: columnsText.ticket,
    cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.ticketCode}</span>,
    meta: { label: columnsText.ticket, card: 'title' },
  },
  {
    id: 'result',
    header: columnsText.result,
    cell: ({ row }) => <StatusBadge kind="scan_result" value={row.original.result} />,
    meta: { label: columnsText.result, card: 'badge' },
  },
  {
    id: 'session',
    header: columnsText.session,
    cell: ({ row }) => sessionText(row.original),
    meta: { label: columnsText.session, card: 'meta' },
  },
  {
    id: 'phase',
    header: columnsText.phase,
    cell: ({ row }) => `${text.phases[row.original.phase]} · ${text.sources[row.original.source]}`,
    meta: { label: columnsText.phase, card: 'meta' },
  },
  {
    id: 'pax',
    header: columnsText.pax,
    cell: ({ row }) => `${String(row.original.checkedInPax)} / ${String(row.original.bookedPax)}`,
    meta: { label: columnsText.pax, card: 'meta', align: 'right' },
  },
  {
    id: 'unpaid',
    header: columnsText.unpaid,
    cell: ({ row }) => String(row.original.unpaidPax),
    meta: { label: columnsText.unpaid, card: 'meta', align: 'right' },
  },
  {
    id: 'officer',
    header: columnsText.officer,
    cell: ({ row }) => row.original.officerName ?? text.unknownOfficer,
    meta: { label: columnsText.officer, card: 'meta' },
  },
];

export interface ScanHistoryTableProps {
  rows: ScanHistoryRow[];
  total: number;
  facets: readonly ListFacet[];
  dateFilter: DateFilterProps;
}

// docs/PRD.md FR-ADMIN-06: a day's scans, newest first, filtered by result (and RW for the superadmin).
export function ScanHistoryTable({ rows, total, facets, dateFilter }: ScanHistoryTableProps) {
  return (
    <DataTable
      columns={SCAN_COLUMNS}
      rows={rows}
      total={total}
      noun={text.noun}
      facets={facets}
      searchPlaceholder={text.search}
      toolbarActions={<DateFilter {...dateFilter} />}
      emptyState={<EmptyState icon={ScanLine} title={text.empty} description={text.emptyHint} />}
    />
  );
}
