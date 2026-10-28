'use client';

import { financeCopy } from '@/lib/copy/finance';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateWritten } from '@/lib/utils/dates';
import { hasPayableTotal } from '@/lib/utils/finance-display';
import type { PayoutPreviewState } from '@/types/finance';

const text = financeCopy.payouts.preview;

function previewMessage(state: PayoutPreviewState): string {
  if (state.status === 'idle') return text.choose;
  if (state.status === 'loading') return text.loading;
  if (state.status === 'failed') return state.message;
  const { total, entries, blockedSince } = state.preview;
  if (blockedSince !== null) return text.negativePending(formatDateWritten(blockedSince));
  if (total === null || entries === null) return text.invalid;
  return total > 0 ? text.total(formatIDR(total), entries) : text.nothing;
}

function isBlocked(state: PayoutPreviewState): boolean {
  return state.status === 'ready' && state.preview.blockedSince !== null;
}

function previewTone(state: PayoutPreviewState): string {
  if (isBlocked(state)) return 'rounded-md bg-warning-soft p-3 text-body-sm text-warning-soft-foreground';
  return hasPayableTotal(state)
    ? 'rounded-md bg-info-soft p-3 text-body-sm text-info-soft-foreground'
    : 'text-body-sm text-muted-foreground';
}

// Review of PR #103, M-1: a period no payout may record says why, before anything is transferred; the form's submit
// stays disabled because the preview carries no total (hasPayableTotal).
export function PayoutPreviewLine({ state }: { state: PayoutPreviewState }) {
  return (
    <p aria-live="polite" className={previewTone(state)}>
      {previewMessage(state)}
    </p>
  );
}
