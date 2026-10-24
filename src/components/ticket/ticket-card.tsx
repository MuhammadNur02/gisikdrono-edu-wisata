import { Sun } from 'lucide-react';

import { StatusBadge } from '@/components/admin/status/status-badge';
import { QrDisplay } from '@/components/ticket/qr-display';
import { rwAccentClasses, type RwAccent } from '@/config/rw';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatDateLong, formatTimeRange } from '@/lib/utils/dates';
import type { GuestTicket } from '@/types/ticket';

const text = copy.booking.ticket;

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

// What the ticket shows in its place of the QR: the QR itself while it can be scanned (a used one kept for reference),
// and a word otherwise: suspended, revoked, past its day, or signed with a kid that has retired. A suspended or
// revoked ticket never shows its QR, so it cannot be shown at a gate (re-review of PR #42).
function TicketQr({ ticket }: { ticket: GuestTicket }) {
  const notice =
    ticket.status === 'suspended' || ticket.status === 'revoked' || ticket.status === 'expired'
      ? text.notice[ticket.status]
      : null;
  if (notice !== null) {
    return <p className="rounded-xl bg-muted p-5 text-body-sm text-ink-2">{notice}</p>;
  }
  if (ticket.qr === null) {
    return <p className="rounded-xl bg-muted p-5 text-body-sm text-ink-2">{text.noQr}</p>;
  }
  return <QrDisplay qr={ticket.qr} label={text.qrLabel(ticket.rwName)} />;
}

// The tinted stub (DESIGN-SPEC §3.13): forest night with the kawung for RW 05, the leg's own shade for another RW.
function TicketStub({ ticket }: { ticket: GuestTicket }) {
  return (
    <div className="kawung flex flex-col justify-between gap-6 bg-(--rw-grade-shade) p-6 kawung-10 md:p-7">
      <div className="space-y-2">
        <p className="text-eyebrow text-rw-hi">{text.stub}</p>
        <h2 className="text-h4 font-display font-extrabold text-balance text-white">
          {text.ticketOf(ticket.rwName)}
        </h2>
      </div>
      <div className="space-y-1 max-md:hidden">
        <p className="text-meta-caps text-on-dark-2">{text.gate}</p>
        <p className="text-label leading-snug font-semibold text-white">{ticket.rwName}</p>
      </div>
    </div>
  );
}

// The QR column: the QR (or the notice in its place), the ticket code and the hint to show it at the gate.
function TicketScan({ ticket }: { ticket: GuestTicket }) {
  const isIssued = ticket.status === 'issued';
  return (
    <div className="flex flex-col items-center gap-3 p-6 text-center max-md:order-2 md:p-7">
      <TicketQr ticket={ticket} />
      <p className="text-meta-caps text-muted-foreground">{text.code}</p>
      <p className="-mt-2 text-h4 font-display font-extrabold tracking-wide whitespace-nowrap tabular-nums">
        {ticket.ticketCode}
      </p>
      <p className="flex items-center gap-1.5 text-caption text-ink-2">
        {isIssued && <Sun aria-hidden className="size-4 shrink-0" />}
        {isIssued ? text.brightness : text.showQr}
      </p>
    </div>
  );
}

// The perforation: two paper notches and a dashed line, across on a phone and down from md.
function Perforation() {
  return (
    <div aria-hidden className="relative max-md:order-3 max-md:h-6 md:w-6">
      <span className="absolute -top-3 left-0 size-6 rounded-full bg-background max-md:top-0 max-md:-left-3" />
      <span className="absolute right-0 -bottom-3 size-6 rounded-full bg-background max-md:top-0 max-md:-right-3 max-md:bottom-auto" />
      <span className="absolute border-dashed border-border-strong max-md:inset-x-4 max-md:top-3 max-md:border-t-2 md:inset-y-4 md:left-3 md:border-l-2" />
    </div>
  );
}

// docs/StyleGuide.md §5.15 TicketCard, DESIGN-SPEC §3.13: one per leg. The QR encodes https://<site>/v/<token> only;
// the ticket shows its code, the day and session and the group's size. No participant name appears on a ticket. The
// card fades up once on load; the QR never moves on its own.
export function TicketCard({
  ticket,
  accentKey,
}: {
  ticket: GuestTicket;
  accentKey: RwAccent | null;
}) {
  return (
    <article
      className={cn(
        'grid overflow-hidden rounded-3xl border border-border bg-card shadow-lg motion-safe:animate-in motion-safe:duration-480 motion-safe:fade-in motion-safe:slide-in-from-bottom-4 md:grid-cols-[13.75rem_minmax(0,1fr)_1.5rem_17.5rem]',
        rwAccentClasses(accentKey).scope,
      )}
    >
      <TicketStub ticket={ticket} />
      <div className="space-y-5 p-6 max-md:order-4 md:p-8">
        <StatusBadge kind="ticket_status" value={ticket.status} />
        <dl className="grid gap-3 md:grid-cols-2 md:gap-x-6 md:gap-y-5">
          <Fact label={text.visitDate} value={formatDateLong(ticket.validOn)} />
          <Fact label={text.session} value={formatTimeRange(ticket.startTime, ticket.endTime)} />
          <Fact label={text.pax} value={text.paxCount(ticket.paxCount)} />
        </dl>
      </div>
      <Perforation />
      <TicketScan ticket={ticket} />
    </article>
  );
}
