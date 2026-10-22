'use client';

import { BookingQuoteLines } from '@/components/booking/booking-quote-lines';
import { FormAlert } from '@/components/forms/form-alert';
import { Skeleton } from '@/components/ui/skeleton';
import type { QuotePreviewState } from '@/hooks/use-quote-preview';
import { copy } from '@/lib/copy/id';
import type { QuotePreviewAnswer, WizardPackage } from '@/types/booking';

const text = copy.booking.wizard.quote;

function problemText(
  answer: Extract<QuotePreviewAnswer, { kind: 'problem' }>,
  wizardPackage: WizardPackage,
) {
  if (answer.problem === 'pax_out_of_range')
    return text.paxOutOfRange(wizardPackage.minPax, wizardPackage.maxPax);
  return answer.problem === 'addon_unavailable' ? text.addonUnavailable : text.addonQuantity;
}

// The server's quote of what the visitor chose, or why it cannot be priced (Task P3.5.03). aria-live, so a total that
// changes with a stepper is read out.
export function QuotePreviewPanel({
  state,
  wizardPackage,
}: {
  state: QuotePreviewState;
  wizardPackage: WizardPackage;
}) {
  return (
    <div aria-live="polite" aria-busy={state.status === 'loading'} className="space-y-3">
      <h3 className="text-h4">{text.title}</h3>
      {state.status === 'loading' && (
        <div className="space-y-2">
          <span className="sr-only">{text.loading}</span>
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-8 w-1/2" />
        </div>
      )}
      {state.status === 'failed' && <FormAlert tone="danger">{state.message}</FormAlert>}
      {state.status === 'ready' && state.answer.kind === 'problem' && (
        <FormAlert tone="danger">{problemText(state.answer, wizardPackage)}</FormAlert>
      )}
      {state.status === 'ready' && state.answer.kind === 'quote' && (
        <BookingQuoteLines quote={state.answer.quote} />
      )}
    </div>
  );
}
