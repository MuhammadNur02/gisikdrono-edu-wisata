'use client';

import { financeCopy } from '@/lib/copy/finance';
import { formatIDR } from '@/lib/utils/currency';
import { hasPayableTotal } from '@/lib/utils/finance-display';
import type { PayoutPreviewState } from '@/types/finance';

const text = financeCopy.payouts.preview;

function previewMessage(state: PayoutPreviewState): string {
  if (state.status === 'idle') return text.choose;
  if (state.status === 'loading') return text.loading;
  if (state.status === 'failed') return state.message;
  const { total, entries } = state.preview;
  if (total === null || entries === null) return text.invalid;
  return total > 0 ? text.total(formatIDR(total), entries) : text.nothing;
}

export function PayoutPreviewLine({ state }: { state: PayoutPreviewState }) {
  return (
    <p
      aria-live="polite"
      className={
        hasPayableTotal(state)
          ? 'rounded-md bg-info-soft p-3 text-body-sm text-info-soft-foreground'
          : 'text-body-sm text-muted-foreground'
      }
    >
      {previewMessage(state)}
    </p>
  );
}
