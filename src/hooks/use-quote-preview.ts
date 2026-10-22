'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { copy } from '@/lib/copy/id';
import type { QuotePreviewAnswer, WizardActions } from '@/types/booking';

// Task P3.5.03, docs/PRD.md FR-BOOK-04/05: the quote of what the visitor chose comes from the server every time,
// asked again once the group size or the add-ons stop changing, so a stepper held down asks once. The browser only
// shows it; it never adds anything up.

const PREVIEW_PAUSE_MS = 400;

export interface QuoteRequest {
  packageSlug: string;
  pax: number;
  addons: readonly { productId: string; qty: number }[];
}

export type QuotePreviewState =
  | { status: 'loading' }
  | { status: 'ready'; answer: QuotePreviewAnswer }
  | { status: 'failed'; message: string };

export function useQuotePreview(
  previewQuote: WizardActions['previewQuote'],
  request: QuoteRequest | null,
) {
  const [state, setState] = useState<QuotePreviewState>({ status: 'loading' });
  const [round, setRound] = useState(0);
  const latestKey = useRef('');
  const key = request === null ? '' : JSON.stringify(request);

  useEffect(() => {
    if (key === '') return undefined;
    latestKey.current = key;
    const timer = setTimeout(() => {
      setState({ status: 'loading' });
      void previewQuote(JSON.parse(key)).then((result) => {
        // An answer to a choice the visitor has changed since is dropped.
        if (latestKey.current !== key) return;
        setState(
          result.ok
            ? { status: 'ready', answer: result.data }
            : {
                status: 'failed',
                message: result.error.message || copy.booking.wizard.quote.failed,
              },
        );
      });
    }, PREVIEW_PAUSE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [key, round, previewQuote]);

  // After PRICE_MISMATCH: the summary shows the price the catalogue holds now.
  const refresh = useCallback(() => {
    setRound((current) => current + 1);
  }, []);

  return { state, refresh };
}
