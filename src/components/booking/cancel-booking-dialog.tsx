'use client';

import { CircleX } from 'lucide-react';
import { useState, useTransition, type ComponentProps, type ReactNode } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useRefreshAfter } from '@/hooks/use-refresh-after';
import type { ActionResult } from '@/types/action-result';

export type CancelBookingAction = (input: unknown) => Promise<ActionResult<null>>;

export interface CancelBookingDialogProps {
  bookingCode: string;
  kind: 'cancellation' | 'weather';
  // The refund this page shows, sent back so the database can tell when it has moved since (review of PR #69, M3).
  refundAmount: number;
  refundPct: number | null;
  action: CancelBookingAction;
  // Labels and the refund the server computed come from the server component, so this island ships no copy file.
  trigger: ReactNode;
  title: string;
  body: string;
  confirm: string;
  keep: string;
  // The trigger's look: the hub's danger link, or a button inside the weather panel.
  triggerVariant?: 'link' | 'outline';
}

// AlertDialogTrigger asChild hands its props (onClick, aria and data attributes, ref) to this button.
function CancelTrigger({
  variant,
  children,
  ...trigger
}: ComponentProps<'button'> & { variant: CancelBookingDialogProps['triggerVariant'] }) {
  if (variant === 'outline') {
    return (
      <Button {...trigger} variant="outline" className="w-full">
        {children}
      </Button>
    );
  }
  return (
    <Button
      {...trigger}
      variant="ghost"
      className="-ml-3 px-3 text-destructive hover:not-disabled:bg-danger-soft"
    >
      <CircleX aria-hidden />
      {children}
    </Button>
  );
}

function useCancellation(props: CancelBookingDialogProps) {
  const refresh = useRefreshAfter();
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const cancel = () => {
    setError(null);
    startTransition(async () => {
      const result = await props.action({
        bookingCode: props.bookingCode,
        kind: props.kind,
        refundAmount: props.refundAmount,
        refundPct: props.refundPct,
      });
      if (!result.ok) {
        setError(result.error.message);
        // A refund that moved: the page reads the new figure, and the dialog stays open to ask again.
        if (result.error.code === 'PRICE_MISMATCH') refresh();
        return;
      }
      setIsOpen(false);
      refresh();
    });
  };
  return { error, isOpen, setIsOpen, isPending, cancel };
}

// DESIGN-SPEC §3.11 "Batalkan reservasi": an AlertDialog that says what goes and what comes back, and asks once. The
// database decides; the page reads the new state when it refreshes (§4 Reservasi, Cancel booking: fade 150 ms).
export function CancelBookingDialog(props: CancelBookingDialogProps) {
  const { error, isOpen, setIsOpen, isPending, cancel } = useCancellation(props);
  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <CancelTrigger variant={props.triggerVariant}>{props.trigger}</CancelTrigger>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.body}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FormAlert tone="danger">{error}</FormAlert>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{props.keep}</AlertDialogCancel>
          <Button variant="destructive" loading={isPending} onClick={cancel}>
            {props.confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
