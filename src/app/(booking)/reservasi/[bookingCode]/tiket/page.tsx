import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AuthCard } from '@/components/auth/auth-card';
import { FormAlert } from '@/components/forms/form-alert';
import { TicketCard } from '@/components/ticket/ticket-card';
import { copy } from '@/lib/copy/id';
import { requireGuestToken } from '@/server/auth/guards';
import { getTicketsForBooking } from '@/server/services/ticket-service';

const text = copy.booking.ticket;

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: text.title, robots: { index: false, follow: false } };

interface TicketPageProps {
  params: Promise<{ bookingCode: string }>;
}

// docs/PRD.md FR-BOOK-13 (Task P3.10.02): the booking's tickets, one per leg, for the browser holding its link (any
// scope opens the view). Any other visitor gets the same 404 as for a code that does not exist (GUEST-02).
export default async function TicketPage({ params }: TicketPageProps) {
  const { bookingCode } = await params;
  const guard = await requireGuestToken(bookingCode, 'view');
  if (!guard.ok) notFound();
  const tickets = await getTicketsForBooking(guard.guest.bookingId);
  return (
    <div className="w-full max-w-lg">
      <AuthCard title={text.title} description={text.description}>
        {tickets.length === 0 ? (
          <FormAlert tone="info">{text.none}</FormAlert>
        ) : (
          <div className="space-y-4">
            {tickets.map((ticket) => (
              <TicketCard key={ticket.ticketCode} ticket={ticket} />
            ))}
          </div>
        )}
      </AuthCard>
    </div>
  );
}
