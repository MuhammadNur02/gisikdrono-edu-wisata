'use client';

import { Lock } from 'lucide-react';
import { useState, useTransition } from 'react';

import { PhoneOtpField } from '@/components/booking/phone-otp-field';
import { Button } from '@/components/ui/button';
import type { PhoneOtpActions } from '@/hooks/use-phone-otp';
import type { ActionResult } from '@/types/action-result';

export type ConfirmQuotationAction = (
  input: unknown,
) => Promise<ActionResult<{ redirectUrl: string }>>;

export interface QuotationConfirmProps {
  bookingCode: string;
  otpActions: Pick<PhoneOtpActions, 'requestAction' | 'verifyAction'>;
  confirmAction: ConfirmQuotationAction;
  labels: { title: string; body: string; confirm: string; redirecting: string };
}

function useConfirm(bookingCode: string, confirmAction: ConfirmQuotationAction) {
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await confirmAction({ bookingCode });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setIsRedirecting(true);
      window.location.assign(result.data.redirectUrl);
    });
  };
  return { error, isBusy: isPending || isRedirecting, isRedirecting, confirm };
}

// docs/PRD.md §9.2 quoted → pending_payment ("Konfirmasi & Bayar", Task P3.12.02): the visitor proves the booking's
// WhatsApp number with a code, then the first attempt reserves the seats and the browser opens Midtrans' page.
export function QuotationConfirm({
  bookingCode,
  otpActions,
  confirmAction,
  labels,
}: QuotationConfirmProps) {
  const [isVerified, setIsVerified] = useState(false);
  const { error, isBusy, isRedirecting, confirm } = useConfirm(bookingCode, confirmAction);
  return (
    <section
      aria-labelledby="hub-confirm"
      className="space-y-4 rounded-2xl border border-border bg-muted/50 p-5"
    >
      <div className="space-y-1">
        <h2 id="hub-confirm" className="text-h4 font-bold">
          {labels.title}
        </h2>
        <p className="text-body-sm text-ink-2">{labels.body}</p>
      </div>
      <PhoneOtpField
        {...otpActions}
        onVerified={() => {
          setIsVerified(true);
        }}
        onContactChange={() => {
          setIsVerified(false);
        }}
      />
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-danger-soft p-3 text-body-sm text-danger-soft-foreground"
        >
          {error}
        </p>
      )}
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!isVerified}
        loading={isBusy}
        onClick={confirm}
      >
        {isRedirecting ? labels.redirecting : labels.confirm}
        <Lock aria-hidden />
      </Button>
    </section>
  );
}
