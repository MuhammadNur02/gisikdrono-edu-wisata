'use client';

import { Ban } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import type { RevokeTicketAction } from '@/components/admin/bookings/revoke-ticket-dialog';
import { Button } from '@/components/ui/button';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';

// The dialog and its form load on the first click, outside the page's first load (admin budget).
const RevokeTicketDialog = dynamic(() =>
  import('@/components/admin/bookings/revoke-ticket-dialog').then(
    (module) => module.RevokeTicketDialog,
  ),
);

function RevokeTrigger({ ticketCode, onOpen }: { ticketCode: string; onOpen: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="min-h-11 text-destructive sm:min-h-9"
      onClick={onOpen}
    >
      <Ban aria-hidden />
      {bookingsAdminCopy.detail.revokeTicket}
      <span className="sr-only">: {ticketCode}</span>
    </Button>
  );
}

// The superadmin's "Cabut tiket" on one ticket of the booking detail (FR-ADMIN-26).
export function RevokeTicketButton({
  bookingId,
  ticketCode,
  action,
  stepUpAction,
}: {
  bookingId: string;
  ticketCode: string;
  action: RevokeTicketAction;
  stepUpAction: RevokeTicketAction;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <RevokeTrigger
        ticketCode={ticketCode}
        onOpen={() => {
          setIsOpen(true);
        }}
      />
      {isOpen ? (
        <RevokeTicketDialog
          bookingId={bookingId}
          ticketCode={ticketCode}
          action={action}
          stepUpAction={stepUpAction}
          onClose={() => {
            setIsOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
