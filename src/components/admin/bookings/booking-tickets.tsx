import { DetailCard, EmptyLine } from '@/components/admin/bookings/booking-detail-parts';
import { RevokeTicketButton } from '@/components/admin/bookings/revoke-ticket-button';
import type { RevokeTicketAction } from '@/components/admin/bookings/revoke-ticket-dialog';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { rwLabel } from '@/config/rw';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';
import { formatDateShort } from '@/lib/utils/dates';
import type { BookingDetail, BookingTicketSummary } from '@/types/booking-admin';

const text = bookingsAdminCopy.detail;

// revokeTicketAction and verifyStaffTotpAction, the superadmin's; null for an RW admin.
export interface RevokeTicketActions {
  revoke: RevokeTicketAction;
  stepUp: RevokeTicketAction;
}

// revoke_ticket takes an issued or suspended ticket; a used, revoked or expired one stays as it is.
function isRevocable(ticket: BookingTicketSummary): boolean {
  return ticket.status === 'issued' || ticket.status === 'suspended';
}

function TicketLine({
  bookingId,
  ticket,
  revokeAction,
}: {
  bookingId: string;
  ticket: BookingTicketSummary;
  revokeAction: RevokeTicketActions | null;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <span className="space-y-0.5">
        <span className="block font-mono text-body-sm">{ticket.ticketCode}</span>
        <span className="block text-caption text-muted-foreground">
          {rwLabel(ticket.rwId)} · {formatDateShort(ticket.validOn)}
          {ticket.checkedInPax === null
            ? ''
            : ` · ${text.checkedIn(ticket.checkedInPax, ticket.unpaidPax ?? 0)}`}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <StatusBadge kind="ticket_status" value={ticket.status} />
        {revokeAction && isRevocable(ticket) ? (
          <RevokeTicketButton
            bookingId={bookingId}
            ticketCode={ticket.ticketCode}
            action={revokeAction.revoke}
            stepUpAction={revokeAction.stepUp}
          />
        ) : null}
      </span>
    </li>
  );
}

// The booking's tickets, one per RW of the visit; the superadmin may revoke one with a reason (FR-ADMIN-26).
export function BookingTickets({
  booking,
  revokeAction,
}: {
  booking: BookingDetail;
  // revokeTicketAction for the superadmin; null for an RW admin.
  revokeAction: RevokeTicketActions | null;
}) {
  return (
    <DetailCard title={text.tickets}>
      {booking.tickets.length === 0 ? (
        <EmptyLine>{text.ticketsEmpty}</EmptyLine>
      ) : (
        <ul className="divide-y divide-border">
          {booking.tickets.map((ticket) => (
            <TicketLine
              key={ticket.ticketCode}
              bookingId={booking.id}
              ticket={ticket}
              revokeAction={revokeAction}
            />
          ))}
        </ul>
      )}
    </DetailCard>
  );
}
