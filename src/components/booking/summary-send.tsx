'use client';

import { FileText, Lock, ShieldCheck, Timer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { bookingLayoutCopy } from '@/lib/copy/booking-layout';
import { copy } from '@/lib/copy/id';
import { layoutCopy } from '@/lib/copy/ui';
import { cn } from '@/lib/utils/cn';

const text = copy.booking.wizard.summary;
const layout = bookingLayoutCopy.wizard.summary;

// The sending end of the summary step (DESIGN-SPEC §3.10 step 4), drawn here so summary-step.tsx keeps the logic.
export interface SendState {
  isBusy: boolean;
  isDisabled: boolean;
}

// "Konfirmasi & Bayar" beside "Minta Surat Penawaran" in the confirm panel (DESIGN-SPEC §3.10 step 4). On a phone the
// same button sits in the fixed action bar, to the right of the 52 px back button (20 + 52 + 12 px from the left),
// so it exists once in the page.
const PAY_IN_ACTION_BAR =
  'max-md:fixed max-md:right-5 max-md:bottom-3.5 max-md:left-21 max-md:z-40 max-md:h-13';

export function ConfirmPayButton({ isBusy, isDisabled }: SendState) {
  return (
    <Button
      type="submit"
      size="xl"
      loading={isBusy}
      disabled={isDisabled}
      className={cn('md:flex-1', PAY_IN_ACTION_BAR)}
    >
      {text.pay}
      <Lock aria-hidden />
    </Button>
  );
}

// "Minta Surat Penawaran", for an institution whose number a WhatsApp code verified; an email proof cannot ask for a
// quotation.
export function QuoteButton(props: SendState & { onQuote: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xl"
      className="md:flex-1"
      disabled={props.isBusy || props.isDisabled}
      onClick={props.onQuote}
    >
      {text.quote}
      <FileText aria-hidden />
    </Button>
  );
}

export function SendButtons(props: SendState & { canAskQuotation: boolean; onQuote: () => void }) {
  const { canAskQuotation, onQuote, ...state } = props;
  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-3 md:flex-row">
        <ConfirmPayButton {...state} />
        {canAskQuotation && <QuoteButton {...state} onQuote={onQuote} />}
      </div>
      {canAskQuotation && <p className="text-caption text-muted-foreground">{text.quoteHint}</p>}
    </div>
  );
}

export function PayMethods() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-body-sm text-muted-foreground">{layout.payWith}</span>
      {layout.payMethods.map((method) => (
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
