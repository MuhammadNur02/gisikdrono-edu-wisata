'use client';

import { useState } from 'react';

import type { QuotePreviewState } from '@/hooks/use-quote-preview';
import { copy } from '@/lib/copy/id';
import { bookingToSend, type BookingDraft } from '@/lib/utils/booking-wizard';
import type { BookingMode } from '@/lib/validations/booking';
import type { ActionFailure } from '@/types/action-result';
import type { BookingSubmitAnswer, WizardActions, WizardPackage } from '@/types/booking';

// The summary's send (Task P3.5.04): the booking assembled from the draft with the hash of the quote shown, and what
// the visitor is told for every answer that made no booking. pay_to_confirm and resent are answers, not errors.

const text = copy.booking.wizard.summary;

export interface SubmitNotice {
  tone: 'info' | 'danger';
  message: string;
  // A full session, or one already half held unpaid: the visitor may pick another, keeping the rest of the draft.
  offersOtherSession: boolean;
}

function noticeOf(
  answer: Extract<BookingSubmitAnswer, { kind: 'pay_to_confirm' | 'resent' }>,
): SubmitNotice {
  return answer.kind === 'pay_to_confirm'
    ? { tone: 'info', message: text.payToConfirm, offersOtherSession: true }
    : { tone: 'info', message: text.resent, offersOtherSession: false };
}

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
  onBooked: (nextUrl: string) => void;
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
    options.renewCaptcha();
    if (!result.ok) {
      if (result.error.code === 'PRICE_MISMATCH') options.refreshPreview();
      setNotice(failureNotice(result.error));
    } else if (result.data.kind === 'reverify') setIsAskedToReverify(true);
    else if (result.data.kind !== 'created') setNotice(noticeOf(result.data));
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
    const result = await options.createBooking({ mode, packageSlug: wizardPackage.slug, booking });
    setIsBusy(false);
    answer(result);
  }

  return { notice, isAskedToReverify, setIsAskedToReverify, isBusy, send };
}
