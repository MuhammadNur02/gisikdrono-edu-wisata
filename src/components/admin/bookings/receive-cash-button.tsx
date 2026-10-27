'use client';

import { Banknote } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { ResponsiveSheet } from '@/components/admin/shell/responsive-sheet';
import { Button } from '@/components/ui/button';
import { walkInCopy } from '@/lib/copy/walk-in';
import type { ActionResult } from '@/types/action-result';
import type { CashBooking } from '@/types/walk-in';

// Review of PR #91, M2 (docs/PRD.md §13.1 A23): "Terima tunai" on /dashboard/bookings/[id], for an RW admin's
// officer booking of their RW whose hold still runs and that is neither paid nor under review, so cash left for later
// is still taken until 23:59 WIB of the visit day, also after the PIC opened the pay link (delta review, M-1). The page
// decides when it shows; recordWalkInCashAction and mark_booking_paid_manually decide again.

const text = walkInCopy;

const WalkInCashForm = dynamic(() =>
  import('@/components/admin/bookings/walk-in-cash-form').then((module) => module.WalkInCashForm),
);

type CashAction = (input: unknown) => Promise<ActionResult<null>>;

export interface ReceiveCashButtonProps {
  booking: CashBooking;
  hasOpenPayLink: boolean;
  action: CashAction;
  stepUpAction: CashAction;
}

export function ReceiveCashButton(props: ReceiveCashButtonProps) {
  const { booking, action, stepUpAction } = props;
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        className="min-h-11 w-full"
        onClick={() => {
          setIsOpen(true);
        }}
      >
        <Banknote aria-hidden />
        {text.receiveCash}
      </Button>
      <ResponsiveSheet
        open={isOpen}
        onOpenChange={setIsOpen}
        title={text.cashTitle(booking.bookingCode)}
      >
        <WalkInCashForm
          booking={booking}
          hasOpenPayLink={props.hasOpenPayLink}
          action={action}
          stepUpAction={stepUpAction}
          laterLabel={text.cashClose}
          onRecorded={() => {
            toast.success(text.cashRecorded);
            setIsOpen(false);
            router.refresh();
          }}
          onLater={() => {
            setIsOpen(false);
          }}
        />
      </ResponsiveSheet>
    </>
  );
}
