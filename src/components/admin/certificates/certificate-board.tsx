'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Award, Eye, FilePlus2, RefreshCw } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';

import type { SuperadminCertificateActions } from '@/components/admin/certificates/certificate-dialog';
import {
  bookingTitle,
  hasHeldCertificates,
} from '@/components/admin/certificates/certificate-labels';
import { ContentBoard, type BoardControls } from '@/components/admin/cms/content-board';
import { actionsColumn } from '@/components/admin/cms/content-columns';
import { ColumnHeader } from '@/components/admin/data-table/column-header';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { Badge } from '@/components/ui/badge';
import { rwLabel } from '@/config/rw';
import { certificatesCopy } from '@/lib/copy/certificates';
import { formatDateShort } from '@/lib/utils/dates';
import type { ActionResult } from '@/types/action-result';
import type { CertificateBooking } from '@/types/certificate';
import type { ListFacet } from '@/types/data-table';

const text = certificatesCopy.dashboard;

// The dialog and its forms load on the first opening, outside the list page's first load (admin budget).
const CertificateDialog = dynamic(() =>
  import('@/components/admin/certificates/certificate-dialog').then(
    (module) => module.CertificateDialog,
  ),
);

type BookingAction = (values: unknown) => Promise<ActionResult<number>>;

export interface CertificateBoardProps {
  rows: CertificateBooking[];
  total: number;
  facets: readonly ListFacet[];
  issueAction: BookingAction;
  rerenderAction: BookingAction;
  // waiveCertificatesAction and revokeCertificateAction for the superadmin; null for an RW admin.
  superadminActions: SuperadminCertificateActions | null;
}

function RecipientCell({ booking }: { booking: CertificateBooking }) {
  return (
    <span className="block space-y-1 whitespace-normal">
      <span className="block font-medium">{bookingTitle(booking)}</span>
      {booking.bookingCode ? (
        <span className="block font-mono text-caption text-muted-foreground">
          {text.bookingCode(booking.bookingCode)}
        </span>
      ) : null}
    </span>
  );
}

function participantsLabel(booking: CertificateBooking): string {
  const total = booking.participants.length;
  if (total === 0) return text.noParticipants;
  const issued = booking.participants.filter((certificate) => certificate.status === 'issued');
  return text.participantCount(issued.length, total);
}

function StatusCell({ booking }: { booking: CertificateBooking }) {
  const hasHeld = hasHeldCertificates(booking);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusBadge kind="certificate_status" value={booking.group.status} />
      {hasHeld ? <Badge variant="warning">{text.held}</Badge> : null}
    </span>
  );
}

function describedColumns(): ColumnDef<CertificateBooking>[] {
  return [
    {
      id: 'recipient',
      header: text.columns.recipient,
      cell: ({ row }) => <RecipientCell booking={row.original} />,
      meta: { label: text.columns.recipient, card: 'title' },
    },
    {
      id: 'visit_date',
      accessorFn: (booking) => booking.visitDate,
      header: ({ column }) => <ColumnHeader column={column} title={text.columns.visitDate} />,
      cell: ({ row }) => formatDateShort(row.original.visitDate),
      meta: { label: text.columns.visitDate },
    },
    {
      id: 'rws',
      header: text.columns.rws,
      cell: ({ row }) => row.original.rwIds.map(rwLabel).join(', '),
      meta: { label: text.columns.rws },
    },
    {
      id: 'participants',
      header: text.columns.participants,
      cell: ({ row }) => participantsLabel(row.original),
      meta: { label: text.columns.participants },
    },
    {
      id: 'status',
      header: text.columns.status,
      cell: ({ row }) => <StatusCell booking={row.original} />,
      meta: { label: text.columns.status, card: 'badge' },
    },
  ];
}

function certificateColumns(
  controls: BoardControls<CertificateBooking>,
  open: (booking: CertificateBooking) => void,
  actions: { issue: BookingAction; rerender: BookingAction },
): ColumnDef<CertificateBooking>[] {
  return [
    ...describedColumns(),
    actionsColumn<CertificateBooking>(bookingTitle, (booking) => [
      {
        label: text.open,
        icon: Eye,
        onSelect: () => {
          open(booking);
        },
      },
      {
        label: text.issue,
        icon: FilePlus2,
        onSelect: () => {
          controls.confirm({
            run: () => actions.issue({ bookingId: booking.id }),
            title: `${text.issue}: ${bookingTitle(booking)}`,
            consequence: text.issueHint,
            confirmLabel: text.issue,
            done: text.issued,
            destructive: false,
          });
        },
      },
      {
        label: text.rerender,
        icon: RefreshCw,
        onSelect: () => {
          controls.confirm({
            run: () => actions.rerender({ bookingId: booking.id }),
            title: `${text.rerender}: ${bookingTitle(booking)}`,
            consequence: text.rerenderHint,
            confirmLabel: text.rerender,
            done: text.rerendered,
            destructive: false,
          });
        },
      },
    ]),
  ];
}

// The columns, bound to the board's two actions and to opening a booking's dialog.
function useCertificateColumns(
  open: (booking: CertificateBooking) => void,
  issue: BookingAction,
  rerender: BookingAction,
) {
  return useCallback(
    (controls: BoardControls<CertificateBooking>) =>
      certificateColumns(controls, open, { issue, rerender }),
    [open, issue, rerender],
  );
}

// Task P4.5.03, docs/PRD.md FR-ADMIN-07: one page of certified bookings from the URL's query on the DataTable. Each
// row opens its certificates in a ResponsiveDialog; issuing again and rendering again are confirmed first. The opened
// booking is looked up in the rows again on every render, so the dialog shows what a refresh brought back.
export function CertificateBoard(props: CertificateBoardProps) {
  const [openedId, setOpenedId] = useState<string | null>(null);
  const open = useCallback((booking: CertificateBooking) => {
    setOpenedId(booking.id);
  }, []);
  const columns = useCertificateColumns(open, props.issueAction, props.rerenderAction);
  const opened = props.rows.find((booking) => booking.id === openedId) ?? null;
  return (
    <>
      <ContentBoard
        title={text.title}
        description={text.description}
        add={null}
        columns={columns}
        rows={props.rows}
        total={props.total}
        noun={text.noun}
        facets={props.facets}
        searchPlaceholder={text.search}
        emptyState={<EmptyState icon={Award} title={text.empty} description={text.emptyHint} />}
      />
      {opened ? (
        <CertificateDialog
          booking={opened}
          actions={props.superadminActions}
          onClose={() => {
            setOpenedId(null);
          }}
        />
      ) : null}
    </>
  );
}
