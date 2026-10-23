'use client';

import { useState } from 'react';

import type { QuotePreviewState } from '@/hooks/use-quote-preview';
import { copy } from '@/lib/copy/id';
import { bookingToSend, shownContactOf, type BookingDraft } from '@/lib/utils/booking-wizard';
import type { BookingMode } from '@/lib/validations/booking';
import type { ActionFailure } from '@/types/action-result';
import type { WizardActions, WizardPackage } from '@/types/booking';

// The summary's send (Task P3.5.04): the booking assembled from the draft with the hash of the quote shown and the
// contact shown as verified, and what the visitor is told for every answer that made no booking. pay_to_confirm and
// resent are answers, not errors.

const text = copy.booking.wizard.summary;

export interface SubmitNotice {
  tone: 'info' | 'danger';
  message: string;
  // A full session, or one already half held unpaid: the visitor may pick another, keeping the rest of the draft.
  offersOtherSession: boolean;
}

const PAY_TO_CONFIRM_NOTICE: SubmitNotice = {
  tone: 'info',
  message: text.payToConfirm,
  offersOtherSession: true,
};

function failureNotice(failure: ActionFailure['error']): SubmitNotice {
  if (failure.code === 'PRICE_MISMATCH') {
    return { tone: 'danger', message: text.priceChanged, offersOtherSession: false };
  }
  return {
    tone: 'danger',
    message: failure.message,
    offersOtherSession: failure.code === 'QUOTA_EXCEEDED',
  };
}

export interface BookingSubmitOptions {
  draft: BookingDraft;
  wizardPackage: WizardPackage;
  preview: QuotePreviewState;
  createBooking: WizardActions['createBooking'];
  requestQuotation: WizardActions['requestQuotation'];
  onBooked: (nextUrl: string) => void;
  // The visitor already holds an unpaid hold for this, whose link went to them again: the draft is done with too
  // (review of PR #27, L5).
  onResent: () => void;
  // After PRICE_MISMATCH: the summary shows the price the catalogue holds now (docs/PRD.md FR-BOOK-05).
  refreshPreview: () => void;
  // A Turnstile token is good once, so every answer but a booking is followed by a fresh one.
  renewCaptcha: () => void;
}

export function useBookingSubmit(options: BookingSubmitOptions) {
  const [notice, setNotice] = useState<SubmitNotice | null>(null);
  const [isAskedToReverify, setIsAskedToReverify] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  function answer(result: Awaited<ReturnType<WizardActions['createBooking']>>) {
    if (result.ok && result.data.kind === 'created') {
      options.onBooked(result.data.nextUrl);
      return;
    }
    if (result.ok && result.data.kind === 'resent') {
      options.onResent();
      return;
    }
    options.renewCaptcha();
    if (!result.ok) {
      if (result.error.code === 'PRICE_MISMATCH') options.refreshPreview();
      setNotice(failureNotice(result.error));
    } else if (result.data.kind === 'reverify') setIsAskedToReverify(true);
    else setNotice(PAY_TO_CONFIRM_NOTICE);
  }

  async function send(
    mode: BookingMode,
    summary: { privacyAccepted: true; turnstileToken: string },
  ) {
    const { preview, draft, wizardPackage } = options;
    if (preview.status !== 'ready' || preview.answer.kind !== 'quote') return;
    setIsBusy(true);
    setNotice(null);
    const booking = bookingToSend(draft, wizardPackage, summary, preview.answer.quoteHash);
    // "Konfirmasi & Bayar" holds; "Minta Surat Penawaran" quotes (Task P3.6.06).
    const sendTo = mode === 'pay' ? options.createBooking : options.requestQuotation;
    const result = await sendTo({
      packageSlug: wizardPackage.slug,
      booking,
      shownContact: shownContactOf(draft),
    });
    setIsBusy(false);
    answer(result);
  }

  return { notice, isAskedToReverify, setIsAskedToReverify, isBusy, send };
}
