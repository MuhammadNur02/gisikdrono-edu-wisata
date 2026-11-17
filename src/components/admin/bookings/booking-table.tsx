'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardList, PanelRightOpen } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  BookingPreviewSheet,
  type PreviewLoader,
} from '@/components/admin/bookings/booking-preview';
import { VisitDateFilter } from '@/components/admin/bookings/visit-date-filter';
import { ColumnHeader } from '@/components/admin/data-table/column-header';
import { DataTable } from '@/components/admin/data-table/data-table';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { RwTag } from '@/components/layout/rw-tag';
import { Badge } from '@/components/ui/badge';
import { bookingDetailPath } from '@/config/bookings';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';
import { formatIDR } from '@/lib/utils/currency';
import {
  formatDateShort,
  formatDateTimeShort,
  formatTimeAgo,
  formatWeekdayDayMonth,
  todayInJakarta,
} from '@/lib/utils/dates';
import { rwBadgeFor } from '@/lib/utils/rw-units';
import type { BookingListRow } from '@/types/booking-admin';
import type { ListFacet } from '@/types/data-table';
import type { RwBadge } from '@/types/rw-unit';

const text = bookingsAdminCopy.list;

function dayText(row: BookingListRow, today: string): string {
  if (row.visitDate === today && row.visitDateEnd === today) return text.today;
  const start = formatWeekdayDayMonth(row.visitDate);
  return row.visitDateEnd === row.visitDate
    ? start
    : `${start} – ${formatDateShort(row.visitDateEnd)}`;
}

// The day (today in the accent), then the package under it.
function VisitCell({ row }: { row: BookingListRow }) {
  const today = todayInJakarta();
  return (
    <span className="block whitespace-normal">
      <span
        className={
          row.visitDate === today ? 'font-medium text-primary-ink' : 'font-medium text-foreground'
        }
      >
        {dayText(row, today)}
      </span>
      {row.packageName ? (
        <span className="block text-caption text-muted-foreground">{row.packageName}</span>
      ) : null}
    </span>
  );
}

function RwCell({ row, rws }: { row: BookingListRow; rws: readonly RwBadge[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {row.rwIds.map((rwId) => (
        <RwTag key={rwId} rw={rwBadgeFor(rwId, rws)} size="sm" />
      ))}
    </span>
  );
}

// "2 jam yang lalu", with the exact time on hover; the server and the browser may round a minute apart.
function CreatedCell({ row }: { row: BookingListRow }) {
  return (
    <span
      className="text-muted-foreground"
      title={formatDateTimeShort(row.createdAt)}
      suppressHydrationWarning
    >
      {formatTimeAgo(row.createdAt)}
    </span>
  );
}

function BookingCell({ row }: { row: BookingListRow }) {
  return (
    <Link
      href={bookingDetailPath(row.id)}
      className="block rounded-sm whitespace-normal outline-none focus-visible:ring-2 focus-visible:ring-ring hover:[&>.who]:underline"
    >
      <span className="who block font-semibold text-foreground underline-offset-4">
        {row.institutionName ?? row.picFirstName ?? text.individual}
      </span>
      <span className="block font-mono text-caption text-muted-foreground tabular-nums">
        {row.bookingCode}
      </span>
    </Link>
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

const HEAD_COLUMNS: ColumnDef<BookingListRow>[] = [
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
    cell: ({ row }) => <VisitCell row={row.original} />,
    meta: { label: text.columns.visitDate },
  },
];

// The RW column needs every RW's accent, so the columns are built once per list of RWs.
type OpenPreview = (row: BookingListRow) => void;

// The row's own way into the preview, for the keyboard and for phones (the cards have no row click).
function PreviewButton({ row, open }: { row: BookingListRow; open: OpenPreview }) {
  return (
    <button
      type="button"
      aria-label={text.preview.open(row.bookingCode)}
      title={text.preview.open(row.bookingCode)}
      onClick={() => {
        open(row);
      }}
      className="flex size-11 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-8"
    >
      <PanelRightOpen aria-hidden className="size-4" />
    </button>
  );
}

function bookingColumns(rws: readonly RwBadge[], open: OpenPreview): ColumnDef<BookingListRow>[] {
  return [
    ...HEAD_COLUMNS,
    {
      id: 'rws',
      header: text.columns.rws,
      cell: ({ row }) => <RwCell row={row.original} rws={rws} />,
      meta: { label: text.columns.rws },
    },
    ...TAIL_COLUMNS,
    {
      id: 'preview',
      header: () => <span className="sr-only">{text.preview.history}</span>,
      cell: ({ row }) => <PreviewButton row={row.original} open={open} />,
      meta: { label: text.preview.openDetail, align: 'right' },
    },
  ];
}

const TAIL_COLUMNS: ColumnDef<BookingListRow>[] = [
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
    cell: ({ row }) => <CreatedCell row={row.original} />,
    meta: { label: text.columns.createdAt },
  },
];

export interface BookingTableProps {
  rows: BookingListRow[];
  // Every RW, for the RW tags in their own accent.
  rws: readonly RwBadge[];
  total: number;
  facets: readonly ListFacet[];
  // loadBookingPreviewAction, handed in by the page.
  loadPreview: PreviewLoader;
  visitDate: string | null;
}

// Task P4.3.02, docs/PRD.md FR-ADMIN-05: one page of bookings from the URL's query; the name opens the booking, a click
// elsewhere on the row (or its panel button) opens the preview (Dasbor Gelap).
export function BookingTable({
  rows,
  rws,
  total,
  facets,
  visitDate,
  loadPreview,
}: BookingTableProps) {
  const [opened, setOpened] = useState<BookingListRow | null>(null);
  const columns = useMemo(() => bookingColumns(rws, setOpened), [rws]);
  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        noun={text.noun}
        facets={facets}
        searchPlaceholder={text.search}
        toolbarActions={<VisitDateFilter date={visitDate} />}
        emptyState={
          <EmptyState icon={ClipboardList} title={text.empty} description={text.emptyHint} />
        }
        onRowOpen={setOpened}
      />
      <BookingPreviewSheet
        bookingId={opened?.id ?? null}
        bookingCode={opened?.bookingCode ?? null}
        rws={rws}
        load={loadPreview}
        onClose={() => {
          setOpened(null);
        }}
      />
    </>
  );
}
