'use client';

import { Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import type { WalkInActions } from '@/components/admin/bookings/walk-in-form';
import { ResponsiveSheet } from '@/components/admin/shell/responsive-sheet';
import { Button } from '@/components/ui/button';
import { bookingDetailPath } from '@/config/bookings';
import { walkInCopy } from '@/lib/copy/walk-in';
import type { ActionResult } from '@/types/action-result';
import type { WalkInBooking, WalkInPackage } from '@/types/walk-in';

// "Pemesanan di loket" on /dashboard/bookings (Task P4.3.10): a Sheet from md up, a Drawer below (docs/StyleGuide.md
// §5.3). The booking first; then, when the officer takes the cash at once, the cash with an authenticator code.

const text = walkInCopy;

// The forms load on the first opening, outside the page's first load (admin budget).
const WalkInForm = dynamic(() =>
  import('@/components/admin/bookings/walk-in-form').then((module) => module.WalkInForm),
);
const WalkInCashForm = dynamic(() =>
  import('@/components/admin/bookings/walk-in-cash-form').then((module) => module.WalkInCashForm),
);

type CashAction = (input: unknown) => Promise<ActionResult<null>>;

export interface WalkInSheetProps {
  packages: readonly WalkInPackage[];
  maxPax: number;
  canTakeCash: boolean;
  actions: WalkInActions & { recordCash: CashAction; stepUp: CashAction; sendLink: CashAction };
}

function useWalkInSheet(sendLink: CashAction) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [created, setCreated] = useState<WalkInBooking | null>(null);
  const finish = (booking: WalkInBooking) => {
    setIsOpen(false);
    setCreated(null);
    router.push(bookingDetailPath(booking.bookingId));
  };
  const onCreated = (booking: WalkInBooking) => {
    toast.success(text.created(booking.bookingCode));
    if (booking.isCashOnTheSpot) setCreated(booking);
    else finish(booking);
  };
  // Left without the cash ("Bayar nanti", closed, Esc): the PIC gets the pay link, and the booking opens on its own
  // page, where the cash can still be taken until 23:59 WIB of the visit day (review of PR #91, M2).
  const payLater = (booking: WalkInBooking) => {
    void sendLink({ bookingId: booking.bookingId }).then((result) => {
      if (result.ok) toast.success(text.linkSent);
      else toast.error(result.error.message);
    });
    finish(booking);
  };
  const onOpenChange = (open: boolean) => {
    if (!open && created) payLater(created);
    else setIsOpen(open);
  };
  return { isOpen, setIsOpen, created, finish, payLater, onCreated, onOpenChange };
}

function SheetBody(props: WalkInSheetProps & ReturnType<typeof useWalkInSheet>) {
  const { created, finish, payLater } = props;
  if (!created) {
    return (
      <WalkInForm
        packages={props.packages}
        maxPax={props.maxPax}
        canTakeCash={props.canTakeCash}
        actions={props.actions}
        onCreated={props.onCreated}
      />
    );
  }
  return (
    <WalkInCashForm
      booking={created}
      action={props.actions.recordCash}
      stepUpAction={props.actions.stepUp}
      onRecorded={() => {
        toast.success(text.cashRecorded);
        finish(created);
      }}
      laterLabel={text.cashLater}
      onLater={() => {
        payLater(created);
      }}
    />
  );
}

export function WalkInSheet(props: WalkInSheetProps) {
  const sheet = useWalkInSheet(props.actions.sendLink);
  return (
    <>
      <Button
        type="button"
        className="min-h-11"
        onClick={() => {
          sheet.setIsOpen(true);
        }}
      >
        <Plus aria-hidden />
        {text.open}
      </Button>
      <ResponsiveSheet
        open={sheet.isOpen}
        onOpenChange={sheet.onOpenChange}
        title={sheet.created ? text.cashTitle(sheet.created.bookingCode) : text.title}
        description={sheet.created ? undefined : text.description}
      >
        <SheetBody {...props} {...sheet} />
      </ResponsiveSheet>
    </>
  );
}
