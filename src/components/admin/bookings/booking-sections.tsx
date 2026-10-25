import {
  DetailCard,
  EmptyLine,
  FactList,
  type Fact,
} from '@/components/admin/bookings/booking-detail-parts';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { rwLabel } from '@/config/rw';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';
import { copy } from '@/lib/copy/id';
import { formatIDR } from '@/lib/utils/currency';
import {
  formatDateLong,
  formatDateShort,
  formatDateTimeShort,
  formatSessionStart,
} from '@/lib/utils/dates';
import type { BookingDetail, BookingTimelineEvent } from '@/types/booking-admin';

// The read-only sections of /dashboard/bookings/[id] (Task P4.3.02, docs/PRD.md FR-ADMIN-05): the booking itself, its
// sessions and tickets, its payments and invoices, and its status history. Amounts appear only where v_booking_admin
// shows them (STAFF-02); payment and invoice amounts are the finance RPC's (P4.7.01).

const text = bookingsAdminCopy.detail;
const listText = bookingsAdminCopy.list;

function visitText(booking: BookingDetail): string {
  const start = formatDateLong(booking.visitDate);
  return booking.visitDateEnd === booking.visitDate
    ? start
    : `${start} – ${formatDateLong(booking.visitDateEnd)}`;
}

function amountFacts(booking: BookingDetail): Fact[] {
  if (booking.amounts === null) {
    return [{ label: text.total, value: listText.amountHiddenHint }];
  }
  return [
    { label: text.total, value: formatIDR(booking.amounts.total) },
    { label: text.paid, value: formatIDR(booking.amounts.paid) },
  ];
}

function optionalFacts(booking: BookingDetail): Fact[] {
  const facts: Fact[] = [];
  if (booking.expiresAt && booking.status === 'pending_payment') {
    facts.push({ label: text.expiresAt, value: formatDateTimeShort(booking.expiresAt) });
  }
  if (booking.notes) facts.push({ label: text.visitorNote, value: booking.notes });
  if (booking.reviewReason) facts.push({ label: text.reviewReason, value: booking.reviewReason });
  if (booking.cancelReason) facts.push({ label: text.cancelReason, value: booking.cancelReason });
  return facts;
}

export function BookingSummary({ booking }: { booking: BookingDetail }) {
  const facts: Fact[] = [
    { label: text.package, value: booking.packageName ?? '—' },
    {
      label: text.booker,
      value: booking.institutionName ?? booking.picFirstName ?? listText.individual,
    },
    {
      label: text.bookerType,
      value: booking.bookerType ? copy.booking.wizard.booker.bookerTypes[booking.bookerType] : '—',
    },
    { label: text.channelLabel, value: booking.channel ? text.channel[booking.channel] : '—' },
    { label: text.visit, value: visitText(booking) },
    { label: text.pax, value: listText.paxCount(booking.paxCount) },
    ...amountFacts(booking),
    ...optionalFacts(booking),
  ];
  return (
    <DetailCard title={text.summary}>
      <FactList facts={facts} />
    </DetailCard>
  );
}

export function BookingLegs({ booking }: { booking: BookingDetail }) {
  return (
    <DetailCard title={text.legs}>
      <ul className="divide-y divide-border">
        {booking.legs.map((leg) => (
          <li
            key={`${String(leg.rwId)}-${leg.sessionDate}`}
            className="flex flex-wrap items-center justify-between gap-2 py-3"
          >
            <span className="space-y-0.5">
              <span className="block text-body-sm font-medium">
                {rwLabel(leg.rwId)} · {formatDateShort(leg.sessionDate)} ·{' '}
                {formatSessionStart(leg.startTime)}
              </span>
              <span className="block text-caption text-muted-foreground">
                {[leg.label, listText.paxCount(leg.pax)].filter(Boolean).join(' · ')}
              </span>
            </span>
            <StatusBadge kind="booking_leg_status" value={leg.status} />
          </li>
        ))}
      </ul>
    </DetailCard>
  );
}

export function BookingTickets({ booking }: { booking: BookingDetail }) {
  return (
    <DetailCard title={text.tickets}>
      {booking.tickets.length === 0 ? (
        <EmptyLine>{text.ticketsEmpty}</EmptyLine>
      ) : (
        <ul className="divide-y divide-border">
          {booking.tickets.map((ticket) => (
            <li
              key={ticket.ticketCode}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <span className="space-y-0.5">
                <span className="block font-mono text-body-sm">{ticket.ticketCode}</span>
                <span className="block text-caption text-muted-foreground">
                  {rwLabel(ticket.rwId)} · {formatDateShort(ticket.validOn)}
                  {ticket.checkedInPax === null
                    ? ''
                    : ` · ${text.checkedIn(ticket.checkedInPax, ticket.unpaidPax ?? 0)}`}
                </span>
              </span>
              <StatusBadge kind="ticket_status" value={ticket.status} />
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}

export function BookingPayments({ booking }: { booking: BookingDetail }) {
  return (
    <DetailCard title={text.payments}>
      {booking.payments.length === 0 ? (
        <EmptyLine>{text.paymentsEmpty}</EmptyLine>
      ) : (
        <ul className="divide-y divide-border">
          {booking.payments.map((payment) => (
            <li
              key={payment.orderId}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <span className="space-y-0.5">
                <span className="block text-body-sm font-medium">
                  {text.attempt(payment.attemptNo)}
                </span>
                <span className="block font-mono text-caption text-muted-foreground">
                  {[
                    payment.orderId,
                    payment.method ? copy.documents.methods[payment.method] : null,
                    payment.settlementTime
                      ? text.settledAt(formatDateTimeShort(payment.settlementTime))
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <StatusBadge kind="payment_status" value={payment.status} />
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}

export function BookingInvoices({ booking }: { booking: BookingDetail }) {
  return (
    <DetailCard title={text.invoices}>
      {booking.invoices.length === 0 ? (
        <EmptyLine>{text.invoicesEmpty}</EmptyLine>
      ) : (
        <ul className="divide-y divide-border">
          {booking.invoices.map((invoice) => (
            <li
              key={invoice.invoiceNumber}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <span className="space-y-0.5">
                <span className="block font-mono text-body-sm">{invoice.invoiceNumber}</span>
                <span className="block text-caption text-muted-foreground">
                  {[
                    formatDateShort(invoice.issuedAt),
                    invoice.receiptNumber ? text.receipt(invoice.receiptNumber) : null,
                    invoice.creditNoteNumber ? text.creditNote(invoice.creditNoteNumber) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <StatusBadge kind="invoice_status" value={invoice.status} />
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}

function isMachineReason(reason: string): reason is keyof typeof text.reasons {
  return Object.hasOwn(text.reasons, reason);
}

function reasonText(reason: string): string {
  return isMachineReason(reason) ? text.reasons[reason] : reason;
}

export function BookingTimeline({ events }: { events: readonly BookingTimelineEvent[] }) {
  return (
    <DetailCard title={text.timeline}>
      {events.length === 0 ? (
        <EmptyLine>{text.timelineEmpty}</EmptyLine>
      ) : (
        <ol className="space-y-4 border-l border-border pl-4">
          {events.map((event) => (
            <li key={event.id} className="space-y-1">
              <span className="flex flex-wrap items-center gap-2">
                {event.toStatus ? (
                  <StatusBadge kind="booking_status" value={event.toStatus} />
                ) : (
                  <span className="text-body-sm font-medium">{text.created}</span>
                )}
                <span className="text-caption text-muted-foreground">
                  {formatDateTimeShort(event.occurredAt)} · {text.actors[event.actorType]}
                </span>
              </span>
              {event.reason ? <p className="text-body-sm">{reasonText(event.reason)}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </DetailCard>
  );
}
