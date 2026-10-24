'use client';

import { FileText, Lock, ShieldCheck, Timer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy/id';
import { layoutCopy } from '@/lib/copy/ui';

const text = copy.booking.wizard.summary;

// The sending end of the summary step (DESIGN-SPEC §3.10 step 4), drawn here so summary-step.tsx keeps the logic.
export interface SendState {
  isBusy: boolean;
  isDisabled: boolean;
}

// "Konfirmasi & Bayar": the step's primary, in the navigation row (the action bar on a phone, DESIGN-SPEC §3.10).
export function PayButton({ isBusy, isDisabled }: SendState) {
  return (
    <Button type="submit" size="xl" loading={isBusy} disabled={isDisabled}>
      {text.pay}
      <Lock aria-hidden />
    </Button>
  );
}

// "Minta Surat Penawaran", for an institution whose number a WhatsApp code verified; an email proof cannot ask for a
// quotation.
export function QuoteButton(props: SendState & { onQuote: () => void }) {
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="xl"
        className="w-full"
        disabled={props.isBusy || props.isDisabled}
        onClick={props.onQuote}
      >
        {text.quote}
        <FileText aria-hidden />
      </Button>
      <p className="text-caption text-muted-foreground">{text.quoteHint}</p>
    </div>
  );
}

export function PayMethods() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-body-sm text-muted-foreground">{text.payWith}</span>
      {text.payMethods.map((method) => (
        <span
          key={method}
          className="inline-flex h-7 items-center rounded-full bg-muted px-3 text-caption font-semibold text-ink-2"
        >
          {method}
        </span>
      ))}
    </div>
  );
}

export function HoldNotice() {
  return (
    <p className="flex gap-3 rounded-xl bg-warning-soft p-4 text-body-sm text-warning-soft-foreground">
      <Timer aria-hidden className="mt-0.5 size-4.5 shrink-0" />
      {text.payHint}
    </p>
  );
}

export function PaymentTrust() {
  return (
    <p className="flex gap-3 text-body-sm text-ink-2">
      <ShieldCheck aria-hidden className="mt-0.5 size-4.5 shrink-0 text-rw05" />
      {layoutCopy.paymentTrust}
    </p>
  );
}
