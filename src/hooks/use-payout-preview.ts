'use client';

import { useEffect, useRef, useState } from 'react';

import type { ActionResult } from '@/types/action-result';
import type { PayoutPreview, PayoutPreviewState } from '@/types/finance';

export type PreviewAction = (values: unknown) => Promise<ActionResult<PayoutPreview>>;

export interface PreviewQuery {
  beneficiaryKey: string;
  from: string;
  to: string;
}

interface PreviewCallbacks {
  // A party just chosen starts at its oldest unpaid day and ends today, as the server answers.
  onPeriod: (from: string, to: string) => void;
  onTotal: (total: number) => void;
}

// Review of PR #80, M-2: the figure payout_preview counts for the chosen party and period, asked again whenever either
// changes. The first answer for a party sets the period; the total becomes the payout's expected total, which
// settle_revenue_entries compares with the rows it stamps.
export function usePayoutPreview(
  query: PreviewQuery,
  previewAction: PreviewAction,
  callbacks: PreviewCallbacks,
): PayoutPreviewState {
  const [state, setState] = useState<PayoutPreviewState>({ status: 'idle' });
  const lastParty = useRef('');
  const latest = useRef(callbacks);
  latest.current = callbacks;
  const { beneficiaryKey, from, to } = query;

  useEffect(() => {
    if (beneficiaryKey === '') return undefined;
    const isNewParty = lastParty.current !== beneficiaryKey;
    lastParty.current = beneficiaryKey;
    let isCurrent = true;
    setState({ status: 'loading' });
    void previewAction({
      beneficiaryKey,
      from: isNewParty || from === '' ? null : from,
      to: to === '' ? null : to,
    }).then((answer) => {
      if (!isCurrent) return;
      if (!answer.ok) {
        setState({ status: 'failed', message: answer.error.message });
        return;
      }
      if (isNewParty) latest.current.onPeriod(answer.data.from, answer.data.to);
      latest.current.onTotal(answer.data.total ?? 0);
      setState({ status: 'ready', preview: answer.data });
    });
    return () => {
      isCurrent = false;
    };
  }, [beneficiaryKey, from, to, previewAction]);

  return beneficiaryKey === '' ? { status: 'idle' } : state;
}
