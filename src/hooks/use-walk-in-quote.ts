'use client';

import { useEffect, useRef, useState } from 'react';

import type { ActionResult } from '@/types/action-result';
import type { QuotePreviewAnswer } from '@/types/booking';

// Task P4.3.10: the price of the officer's booking comes from the server, asked again once the package or the group
// size stop changing; the browser only shows it. An answer to a choice changed since is dropped.

const PREVIEW_PAUSE_MS = 400;

export type WalkInQuoteAction = (input: unknown) => Promise<ActionResult<QuotePreviewAnswer>>;

export type WalkInQuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; answer: QuotePreviewAnswer }
  | { status: 'failed'; message: string };

export function useWalkInQuote(
  action: WalkInQuoteAction,
  packageId: string,
  pax: number,
): WalkInQuoteState {
  const [state, setState] = useState<WalkInQuoteState>({ status: 'idle' });
  const latest = useRef('');
  const isAskable = packageId !== '' && Number.isInteger(pax) && pax > 0;
  const key = isAskable ? `${packageId}:${String(pax)}` : '';

  useEffect(() => {
    latest.current = key;
    if (key === '') return undefined;
    const timer = setTimeout(() => {
      setState({ status: 'loading' });
      void action({ packageId, pax }).then((result) => {
        if (latest.current !== key) return;
        setState(
          result.ok
            ? { status: 'ready', answer: result.data }
            : { status: 'failed', message: result.error.message },
        );
      });
    }, PREVIEW_PAUSE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [action, key, packageId, pax]);

  return isAskable ? state : { status: 'idle' };
}
