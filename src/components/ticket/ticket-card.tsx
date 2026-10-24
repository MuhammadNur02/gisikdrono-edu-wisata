import { StatusBadge } from '@/components/admin/status/status-badge';
import { QrDisplay } from '@/components/ticket/qr-display';
import { copy } from '@/lib/copy/id';
import { formatDateLong, formatTimeRange } from '@/lib/utils/dates';
import type { GuestTicket } from '@/types/ticket';

const text = copy.booking.ticket;

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-caption font-medium text-muted-foreground">{label}</dt>
      <dd className="text-body-sm font-medium sm:text-right">{value}</dd>
    </div>
  );
}

// What the ticket shows in its place of the QR: the QR itself while it can be scanned (a used one kept for reference),
// and a word otherwise: suspended, revoked, past its day, or signed with a kid that has retired. A suspended or
// revoked ticket never shows its QR, so it cannot be shown at a gate (re-review of PR #42).
function TicketQr({ ticket }: { ticket: GuestTicket }) {
  const notice =
    ticket.status === 'suspended' || ticket.status === 'revoked' || ticket.status === 'expired'
      ? text.notice[ticket.status]
      : null;
  if (notice !== null) return <p className="text-body-sm text-muted-foreground">{notice}</p>;
  if (ticket.qr === null) return <p className="text-body-sm text-muted-foreground">{text.noQr}</p>;
  return <QrDisplay qr={ticket.qr} label={text.qrLabel(ticket.rwName)} />;
}

// docs/StyleGuide.md §5.15 TicketCard: one per leg, the QR encoding https://<site>/v/<token> only, the ticket code, the
// day and session, the group's size and the status badge. No participant name appears on a ticket.
export function TicketCard({ ticket }: { ticket: GuestTicket }) {
  return (
    <article className="space-y-4 rounded-xl border border-border p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-h3">{text.ticketOf(ticket.rwName)}</h2>
        <StatusBadge kind="ticket_status" value={ticket.status} />
      </header>
      <TicketQr ticket={ticket} />
      <dl className="space-y-3">
        <Fact label={text.code} value={ticket.ticketCode} />
        <Fact label={text.visitDate} value={formatDateLong(ticket.validOn)} />
        <Fact label={text.session} value={formatTimeRange(ticket.startTime, ticket.endTime)} />
        <Fact label={text.pax} value={text.paxCount(ticket.paxCount)} />
      </dl>
      {ticket.status === 'issued' && (
        <p className="text-caption text-muted-foreground">{text.brightness}</p>
      )}
    </article>
  );
}
