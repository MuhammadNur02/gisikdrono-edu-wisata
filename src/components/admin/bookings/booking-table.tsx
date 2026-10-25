'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardList } from 'lucide-react';
import Link from 'next/link';

import { VisitDateFilter } from '@/components/admin/bookings/visit-date-filter';
import { ColumnHeader } from '@/components/admin/data-table/column-header';
import { DataTable } from '@/components/admin/data-table/data-table';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { Badge } from '@/components/ui/badge';
import { bookingDetailPath } from '@/config/bookings';
import { rwLabel } from '@/config/rw';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateShort } from '@/lib/utils/dates';
import type { BookingListRow } from '@/types/booking-admin';
import type { ListFacet } from '@/types/data-table';

const text = bookingsAdminCopy.list;

function visitText(row: BookingListRow): string {
  const start = formatDateShort(row.visitDate);
  return row.visitDateEnd === row.visitDate
    ? start
    : `${start} – ${formatDateShort(row.visitDateEnd)}`;
}

function BookingCell({ row }: { row: BookingListRow }) {
  return (
    <span className="block space-y-1 whitespace-normal">
      <Link
        href={bookingDetailPath(row.id)}
        className="block font-medium tabular-nums underline-offset-4 hover:underline focus-visible:underline"
      >
        {row.bookingCode}
      </Link>
      <span className="block text-body-sm text-muted-foreground">
        {row.institutionName ?? row.picFirstName ?? text.individual}
      </span>
    </span>
  );
}

// STAFF-02: a combo's total is the superadmin's; an RW admin sees that it is withheld, not a zero.
function TotalCell({ row }: { row: BookingListRow }) {
  if (row.amounts === null) {
    return (
      <span className="text-muted-foreground" title={text.amountHiddenHint}>
        {text.amountHidden}
      </span>
    );
  }
  return <span className="tabular-nums">{formatIDR(row.amounts.total)}</span>;
}

function StatusCell({ row }: { row: BookingListRow }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusBadge kind="booking_status" value={row.status} />
      {row.needsReview ? <Badge variant="warning">{text.needsReview}</Badge> : null}
    </span>
  );
}

const BOOKING_COLUMNS: ColumnDef<BookingListRow>[] = [
  {
    id: 'booking',
    header: text.columns.booking,
    cell: ({ row }) => <BookingCell row={row.original} />,
    meta: { label: text.columns.booking, card: 'title' },
  },
  {
    id: 'visit_date',
    accessorFn: (row) => row.visitDate,
    header: ({ column }) => <ColumnHeader column={column} title={text.columns.visitDate} />,
    cell: ({ row }) => visitText(row.original),
    meta: { label: text.columns.visitDate },
  },
  {
    id: 'rws',
    header: text.columns.rws,
    cell: ({ row }) => row.original.rwIds.map(rwLabel).join(', '),
    meta: { label: text.columns.rws },
  },
  {
    id: 'pax',
    header: text.columns.pax,
    cell: ({ row }) => <span className="tabular-nums">{text.paxCount(row.original.paxCount)}</span>,
    meta: { label: text.columns.pax, align: 'right' },
  },
  {
    id: 'total',
    header: text.columns.total,
    cell: ({ row }) => <TotalCell row={row.original} />,
    meta: { label: text.columns.total, align: 'right' },
  },
  {
    id: 'status',
    header: text.columns.status,
    cell: ({ row }) => <StatusCell row={row.original} />,
    meta: { label: text.columns.status, card: 'badge' },
  },
  {
    id: 'created_at',
    accessorFn: (row) => row.createdAt,
    header: ({ column }) => <ColumnHeader column={column} title={text.columns.createdAt} />,
    cell: ({ row }) => formatDateShort(row.original.createdAt),
    meta: { label: text.columns.createdAt },
  },
];

export interface BookingTableProps {
  rows: BookingListRow[];
  total: number;
  facets: readonly ListFacet[];
  visitDate: string | null;
}

// Task P4.3.02, docs/PRD.md FR-ADMIN-05: one page of bookings from the URL's query; the code opens the booking.
export function BookingTable({ rows, total, facets, visitDate }: BookingTableProps) {
  return (
    <DataTable
      columns={BOOKING_COLUMNS}
      rows={rows}
      total={total}
      noun={text.noun}
      facets={facets}
      searchPlaceholder={text.search}
      toolbarActions={<VisitDateFilter date={visitDate} />}
      emptyState={
        <EmptyState icon={ClipboardList} title={text.empty} description={text.emptyHint} />
      }
    />
  );
}
