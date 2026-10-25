import { ArrowRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { CopyValueButton } from '@/components/booking/copy-value-button';
import { HubCountdown } from '@/components/booking/hub-countdown';
import { HubPoller } from '@/components/booking/hub-poller';
import { Button } from '@/components/ui/button';
import { GUEST_BOOKING_PATH } from '@/config/guest';
import { bookingHubCopy } from '@/lib/copy/booking-hub';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatIDR } from '@/lib/utils/currency';
import { formatClockTime, formatDateLong } from '@/lib/utils/dates';
import type { BookingStatus, StatusHubView } from '@/types/booking-hub';

const text = bookingHubCopy;

const CHIP_TONE: Record<BookingStatus, string> = {
  quoted: 'bg-info-soft text-info-soft-foreground',
  pending_payment: 'bg-warning-soft text-warning-soft-foreground',
  paid: 'bg-success-soft text-success-soft-foreground',
  checked_in: 'bg-success-soft text-success-soft-foreground',
  completed: 'bg-success-soft text-success-soft-foreground',
  no_show: 'bg-muted text-ink-2',
  expired: 'bg-muted text-ink-2',
  cancelled: 'bg-danger-soft text-danger-soft-foreground',
  refunded: 'bg-muted text-ink-2',
};

// DESIGN-SPEC §2.3 status chip: a dot and the words, never colour alone.
function StatusChip({ view }: { view: StatusHubView }) {
  const { status, needsReview } = view.booking;
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-2 rounded-full px-3 text-caption font-semibold',
        needsReview ? CHIP_TONE.pending_payment : CHIP_TONE[status],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {needsReview ? text.needsReview : text.status[status]}
    </span>
  );
}

function deadlineText(instant: string): string {
  return `${formatDateLong(instant)}, ${formatClockTime(instant)}`;
}

type OpenPayment = NonNullable<StatusHubView['booking']['payment']>;

const COPY_LABELS = { label: text.copy, copiedLabel: text.copied, failedLabel: text.copyFailed };

function CopyableRow({ label, value, shown }: { label: string; value: string; shown: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
      <div className="min-w-0 space-y-1">
        <p className="text-caption text-muted-foreground">{label}</p>
        <p className="text-h3 font-display font-extrabold tracking-wide tabular-nums select-all">
          {shown}
        </p>
      </div>
      <CopyValueButton value={value} what={label.toLowerCase()} {...COPY_LABELS} />
    </div>
  );
}

function methodName(payment: OpenPayment): string {
  if (payment.method !== 'virtual_account' || !payment.vaBank) return text.payment.qris;
  const bank = copy.booking.payment.banks[payment.vaBank] ?? payment.vaBank;
  return text.payment.virtualAccount(bank.toUpperCase());
}

// The attempt in progress (DESIGN-SPEC §3.11): the method chosen at Midtrans, the Virtual Account and the amount, each
// with its copy button.
function PaymentDetails({ payment, totalAmount }: { payment: OpenPayment; totalAmount: number }) {
  return (
    <div className="rounded-2xl border border-border">
      <div className="space-y-1 p-4">
        <p className="text-caption text-muted-foreground">{text.payment.method}</p>
        <p className="text-label font-semibold">{methodName(payment)}</p>
      </div>
      {payment.method === 'virtual_account' && payment.vaNumber && (
        <CopyableRow
          label={text.payment.vaNumber}
          value={payment.vaNumber}
          shown={payment.vaNumber}
        />
      )}
      <CopyableRow
        label={text.payment.amount}
        value={String(totalAmount)}
        shown={formatIDR(totalAmount)}
      />
    </div>
  );
}

function PayInstructions({ isVa }: { isVa: boolean }) {
  return (
    <details className="group rounded-2xl border border-border px-4" open>
      <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between gap-3 text-label font-semibold">
        {text.instructions.title}
        <span
          aria-hidden
          className="text-h4 leading-none transition-transform duration-200 group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <ol className="space-y-2.5 pb-4">
        {(isVa ? text.instructions.virtualAccount : text.instructions.qris).map((step, index) => (
          <li key={step} className="flex gap-3 text-body-sm text-ink-2">
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-caption font-semibold text-foreground"
            >
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </details>
  );
}

function PendingPayment({ view }: { view: StatusHubView }) {
  const payment = view.booking.payment?.status === 'pending' ? view.booking.payment : null;
  return (
    <div className="space-y-4">
      {payment && <PaymentDetails payment={payment} totalAmount={view.booking.totalAmount} />}
      <HubPoller label={text.payment.polling} />
      {payment && <PayInstructions isVa={payment.method === 'virtual_account'} />}
      <Button asChild size="lg" className="w-full sm:w-auto">
        <Link href={`${GUEST_BOOKING_PATH}/${view.booking.bookingCode}/bayar`}>
          {payment ? text.payment.continuePay : text.payment.pay}
          <ExternalLink aria-hidden />
        </Link>
      </Button>
    </div>
  );
}

function PaidBody({ view }: { view: StatusHubView }) {
  return (
    <div className="space-y-4">
      {view.ticketCount > 0 && (
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href={`${GUEST_BOOKING_PATH}/${view.booking.bookingCode}/tiket`}>
            {text.documents.seeTickets}
            <ArrowRight aria-hidden data-icon="trailing" />
          </Link>
        </Button>
      )}
      <div className="space-y-2 rounded-2xl bg-muted/60 p-4">
        <p className="text-label font-semibold">{text.paid.visitTitle}</p>
        <ul className="list-disc space-y-1 pl-5 text-body-sm text-ink-2">
          {text.paid.visit.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RefundNote({ view }: { view: StatusHubView }) {
  const refund = view.refund;
  if (!refund) return null;
  const amount = formatIDR(refund.amount);
  return (
    <div className="space-y-1 rounded-2xl bg-info-soft p-4 text-body-sm text-info-soft-foreground">
      <p>
        {refund.status === 'recorded'
          ? text.refund.recorded(amount)
          : text.refund.requested(amount)}
      </p>
      {refund.status !== 'recorded' && refund.method === 'virtual_account' && (
        <p>{text.refund.manual}</p>
      )}
    </div>
  );
}

function StateBody({ view, children }: { view: StatusHubView; children?: ReactNode }) {
  const { status, needsReview, expiresAt } = view.booking;
  if (needsReview) return <p className="text-body text-ink-2">{text.underReview}</p>;
  return (
    <div className="space-y-5">
      {status === 'pending_payment' && expiresAt && (
        <HubCountdown
          expiresAt={expiresAt}
          deadlineText={deadlineText(expiresAt)}
          labels={{
            ...text.countdown,
            spokenHours: text.countdown.hours,
            spokenMinutes: text.countdown.minutes,
          }}
        />
      )}
      {status === 'pending_payment' && <PendingPayment view={view} />}
      {status === 'paid' && <PaidBody view={view} />}
      {(status === 'cancelled' || status === 'refunded') && <RefundNote view={view} />}
      {children}
    </div>
  );
}

// DESIGN-SPEC §3.11 status card: the code with its copy button and the status chip, the state's headline and what to
// do now. children are the manage link's own panels for the state (confirming a quotation, the weather choices).
export function HubStatusCard({ view, children }: { view: StatusHubView; children?: ReactNode }) {
  const { bookingCode, status, needsReview } = view.booking;
  return (
    <section
      aria-labelledby="hub-headline"
      className="space-y-5 rounded-2xl border border-border bg-card p-5 md:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-meta-caps text-muted-foreground tabular-nums">
            {text.reservation(bookingCode)}
          </p>
        </div>
        <StatusChip view={view} />
      </div>
      <div className="space-y-2">
        <h1 id="hub-headline" className="text-h2 text-balance md:text-h1">
          {needsReview ? text.needsReview : text.headline[status]}
        </h1>
        {!needsReview && <p className="text-body text-pretty text-ink-2">{text.lead[status]}</p>}
      </div>
      <StateBody view={view}>{children}</StateBody>
    </section>
  );
}
