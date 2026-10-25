import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { FormAlert } from '@/components/forms/form-alert';
import { TicketCard } from '@/components/ticket/ticket-card';
import type { RwAccent } from '@/config/rw';
import { bookingLayoutCopy } from '@/lib/copy/booking-layout';
import { copy } from '@/lib/copy/id';
import { listRwUnits } from '@/lib/queries/rw-units';
import { requireGuestToken } from '@/server/auth/guards';
import { loadPaymentPage } from '@/server/services/payment-service';
import { getTicketsForBooking } from '@/server/services/ticket-service';
import type { PaymentPageView } from '@/types/payment';
import type { GuestTicket } from '@/types/ticket';

const text = copy.booking.ticket;
const layout = bookingLayoutCopy.ticket;
const PAID_STATUSES: ReadonlySet<PaymentPageView['status']> = new Set([
  'paid',
  'checked_in',
  'completed',
]);

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: text.title, robots: { index: false, follow: false } };

interface TicketPageProps {
  params: Promise<{ bookingCode: string }>;
}

// DESIGN-SPEC §3.13: the banner says the payment arrived and the tickets went out, once there is a ticket to show,
// with the "Lunas" chip when the server reads the booking as paid.
function ReadyBanner({ isPaid }: { isPaid: boolean }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-success-soft p-4 text-success-soft-foreground motion-safe:animate-in motion-safe:duration-300 motion-safe:fade-in motion-safe:slide-in-from-top-2 md:p-5">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground"
      >
        <Check className="size-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-h4 font-display font-bold">{layout.ready}</p>
        <p className="text-body-sm">{layout.readySent}</p>
      </div>
      {isPaid && (
        <span className="inline-flex h-7 shrink-0 items-center gap-2 rounded-full bg-card px-3 text-caption font-semibold text-success">
          <span aria-hidden className="size-1.5 rounded-full bg-success" />
          {layout.paid}
        </span>
      )}
    </div>
  );
}

function DayOfNotes() {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-7">
      <h2 className="text-h4 font-bold">{layout.dayOf.title}</h2>
      <ul className="space-y-3">
        {layout.dayOf.items.map((item) => (
          <li key={item} className="flex gap-3 text-body-sm text-ink-2">
            <Check aria-hidden className="mt-0.5 size-4.5 shrink-0 text-success" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TicketList({
  tickets,
  packageName,
  accents,
}: {
  tickets: GuestTicket[];
  packageName: string;
  accents: ReadonlyMap<string, RwAccent>;
}) {
  return (
    <div className="space-y-6">
      {tickets.map((ticket) => (
        <TicketCard
          key={ticket.ticketCode}
          ticket={ticket}
          packageName={packageName}
          accentKey={accents.get(ticket.rwName) ?? null}
        />
      ))}
    </div>
  );
}

// docs/PRD.md FR-BOOK-13 (Task P3.10.02): the booking's tickets, one per leg, for the browser holding its link (any
// scope opens the view). Any other visitor gets the same 404 as for a code that does not exist (GUEST-02). The stub of
// each ticket takes its RW's colours, matched by the RW's name from the public RW list; the package's name and the
// booking's status come from the same read as the pay page.
export default async function TicketPage({ params }: TicketPageProps) {
  const { bookingCode } = await params;
  const guard = await requireGuestToken(bookingCode, 'view');
  if (!guard.ok) notFound();
  const [tickets, booking, rwUnits] = await Promise.all([
    getTicketsForBooking(guard.guest.bookingId),
    loadPaymentPage(guard.guest.bookingId),
    listRwUnits(),
  ]);
  const accents = new Map(rwUnits.map((rw) => [rw.name, rw.accentKey]));
  return (
    <div className="w-full max-w-250 space-y-6 md:space-y-8">
      <h1 className="sr-only">{text.title}</h1>
      {tickets.length === 0 ? (
        <FormAlert tone="info">{text.none}</FormAlert>
      ) : (
        <>
          {tickets.some((ticket) => ticket.status === 'issued') && (
            <ReadyBanner isPaid={PAID_STATUSES.has(booking.status)} />
          )}
          <TicketList tickets={tickets} packageName={booking.packageName} accents={accents} />
          <DayOfNotes />
        </>
      )}
    </div>
  );
}
