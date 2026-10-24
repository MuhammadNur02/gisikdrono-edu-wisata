import { Sun } from 'lucide-react';

import { StatusBadge } from '@/components/admin/status/status-badge';
import { QrDisplay } from '@/components/ticket/qr-display';
import { rwAccentClasses, type RwAccent } from '@/config/rw';
import { bookingLayoutCopy } from '@/lib/copy/booking-layout';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatDateLong, formatTimeRange } from '@/lib/utils/dates';
import type { GuestTicket } from '@/types/ticket';

const text = copy.booking.ticket;
const layout = bookingLayoutCopy.ticket;

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 md:flex-col md:justify-start md:gap-1">
      <dt className="text-body-sm text-muted-foreground md:text-meta-caps">{label}</dt>
      <dd className="text-right text-label leading-snug font-semibold text-foreground md:text-left">
        {value}
      </dd>
    </div>
  );
}

// A suspended, revoked or expired ticket shows a word in place of its QR, so it cannot be shown at a gate (re-review
// of PR #42); so does a ticket signed with a kid that has retired, for which no QR can be drawn.
function noticeOf(ticket: GuestTicket): string | null {
  if (ticket.status === 'suspended' || ticket.status === 'revoked' || ticket.status === 'expired') {
    return text.notice[ticket.status];
  }
  return ticket.qr === null ? text.noQr : null;
}

// The tinted stub (DESIGN-SPEC §3.13): forest night with the kawung for RW 05, the leg's own shade for another RW.
function TicketStub({ ticket, packageName }: { ticket: GuestTicket; packageName: string }) {
  return (
    <div className="kawung flex shrink-0 flex-col justify-between gap-6 bg-rw-shade p-6 kawung-10 md:w-55 md:p-7">
      <div className="space-y-2">
        <p className="text-eyebrow text-rw-hi">{layout.stub}</p>
        <h2 className="text-h4 font-display font-extrabold text-balance text-on-dark">
          {packageName}
        </h2>
      </div>
      <div className="space-y-1">
        <p className="text-meta-caps text-on-dark-2">{layout.gate}</p>
        <p className="text-label leading-snug font-semibold text-on-dark">{ticket.rwName}</p>
      </div>
    </div>
  );
}

// The QR column: the QR with the hint to show it, or only the notice in its place. Never animated.
function TicketScan({ ticket }: { ticket: GuestTicket }) {
  const notice = noticeOf(ticket);
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-3 p-6 text-center max-md:order-2 md:w-70 md:p-7">
      {notice !== null || ticket.qr === null ? (
        <p className="rounded-xl bg-muted p-5 text-body-sm text-ink-2">{notice}</p>
      ) : (
        <QrDisplay qr={ticket.qr} label={text.qrLabel(ticket.rwName)} />
      )}
      {notice === null && ticket.status === 'issued' && (
        <>
          <p className="text-label font-semibold text-foreground">{layout.showQr}</p>
          <p className="flex items-center gap-1.5 text-caption text-ink-2">
            <Sun aria-hidden className="size-4 shrink-0" />
            {text.brightness}
          </p>
        </>
      )}
    </div>
  );
}

// The perforation: two paper notches and a dashed line, across on a phone and down from md.
function Perforation() {
  return (
    <div aria-hidden className="relative shrink-0 max-md:order-3 max-md:h-6 md:w-6">
      <span className="absolute -top-3 left-0 size-6 rounded-full bg-background max-md:top-0 max-md:-left-3" />
      <span className="absolute right-0 -bottom-3 size-6 rounded-full bg-background max-md:top-0 max-md:-right-3 max-md:bottom-auto" />
      <span className="absolute border-dashed border-border-strong max-md:inset-x-4 max-md:top-3 max-md:border-t-2 md:inset-y-4 md:left-3 md:border-l-2" />
    </div>
  );
}

function TicketDetails({ ticket }: { ticket: GuestTicket }) {
  return (
    <div className="min-w-0 flex-1 space-y-5 p-6 max-md:order-4 md:p-8">
      <StatusBadge kind="ticket_status" value={ticket.status} />
      <dl className="grid gap-3 md:grid-cols-2 md:gap-x-6 md:gap-y-5">
        <Fact label={text.visitDate} value={formatDateLong(ticket.validOn)} />
        <Fact label={text.session} value={formatTimeRange(ticket.startTime, ticket.endTime)} />
        <Fact label={text.pax} value={text.paxCount(ticket.paxCount)} />
      </dl>
      <div className="space-y-1 border-t border-border pt-4">
        <p className="text-meta-caps text-muted-foreground">{text.code}</p>
        <p className="text-h3 font-display font-extrabold tracking-wide break-all tabular-nums">
          {ticket.ticketCode}
        </p>
      </div>
    </div>
  );
}

// docs/StyleGuide.md §5.15 TicketCard, DESIGN-SPEC §3.13: one per leg. The QR encodes https://<site>/v/<token> only;
// the ticket shows the package, its RW, the day and session, the group's size and the ticket code. No participant name
// appears on a ticket. Static: the card and its QR never animate.
export function TicketCard({
  ticket,
  packageName,
  accentKey,
}: {
  ticket: GuestTicket;
  packageName: string;
  accentKey: RwAccent | null;
}) {
  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-panel md:flex-row',
        rwAccentClasses(accentKey).scope,
      )}
    >
      <TicketStub ticket={ticket} packageName={packageName} />
      <TicketDetails ticket={ticket} />
      <Perforation />
      <TicketScan ticket={ticket} />
    </article>
  );
}
