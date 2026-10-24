'use client';

import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy/id';
import type { ActionResult } from '@/types/action-result';

const text = copy.booking.payment;

export type StartPaymentAction = (input: unknown) => Promise<ActionResult<{ redirectUrl: string }>>;

// "Bayar sekarang" (Task P3.7.04): the server makes or reuses the attempt and answers Snap's address, which the browser
// then opens as a full page, Midtrans' redirect mode (docs/Security.md §3.2: no snap.js on this site).
export function PayButton(props: {
  bookingCode: string;
  label: string;
  action: StartPaymentAction;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const pay = () => {
    setError(null);
    startTransition(async () => {
      const result = await props.action({ bookingCode: props.bookingCode });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setIsRedirecting(true);
      window.location.assign(result.data.redirectUrl);
    });
  };
  return (
    <div className="space-y-3">
      {error && <FormAlert tone="danger">{error}</FormAlert>}
      <Button
        type="button"
        size="lg"
        className="w-full"
        loading={isPending || isRedirecting}
        onClick={pay}
      >
        {isRedirecting ? text.redirecting : props.label}
      </Button>
      <p className="text-caption text-muted-foreground">{text.payHint}</p>
    </div>
  );
}
