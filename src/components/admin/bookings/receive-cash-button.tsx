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
import type { WalkInBooking } from '@/types/walk-in';

// Review of PR #91, M2 (docs/PRD.md §13.1 A23): "Terima tunai" on /dashboard/bookings/[id], for an RW admin's
// officer booking of their RW whose hold still runs and that has no payment yet, so cash left for later is still taken
// until 23:59 WIB of the visit day. The page decides when it shows; mark_booking_paid_manually decides again.

const text = walkInCopy;

const WalkInCashForm = dynamic(() =>
  import('@/components/admin/bookings/walk-in-cash-form').then((module) => module.WalkInCashForm),
);

type CashAction = (input: unknown) => Promise<ActionResult<null>>;

export interface ReceiveCashButtonProps {
  booking: Omit<WalkInBooking, 'isCashOnTheSpot'>;
  action: CashAction;
  stepUpAction: CashAction;
}

export function ReceiveCashButton({ booking, action, stepUpAction }: ReceiveCashButtonProps) {
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
          booking={{ ...booking, isCashOnTheSpot: true }}
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
