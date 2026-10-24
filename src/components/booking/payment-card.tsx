import type { ReactNode } from 'react';

import { AuthCard } from '@/components/auth/auth-card';
import { HoldCountdown } from '@/components/booking/hold-countdown';
import { PayButton, type StartPaymentAction } from '@/components/booking/pay-button';
import { FormAlert } from '@/components/forms/form-alert';
import { copy } from '@/lib/copy/id';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateLong, formatTimeRange } from '@/lib/utils/dates';
import type { PaymentPageView } from '@/types/payment';

const text = copy.booking.payment;
const PAID_STATUSES: ReadonlySet<PaymentPageView['status']> = new Set([
  'paid',
  'checked_in',
  'completed',
]);

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-caption font-medium text-muted-foreground">{label}</dt>
      <dd className="text-body-sm font-medium sm:text-right">{children}</dd>
    </div>
  );
}

function PaymentSummary({ view }: { view: PaymentPageView }) {
  return (
    <dl className="space-y-3 rounded-xl border border-border p-4">
      <Row label={text.bookingCode}>
        <span className="tabular-nums">{view.bookingCode}</span>
      </Row>
      <Row label={text.package}>{view.packageName}</Row>
      <Row label={text.schedule}>
        {view.sessions.map((session) => (
          <span key={`${session.rwName}-${session.sessionDate}`} className="block">
            {session.rwName}: {formatDateLong(session.sessionDate)},{' '}
            {formatTimeRange(session.startTime, session.endTime)}
          </span>
        ))}
      </Row>
      <Row label={text.pax}>{text.paxCount(view.paxCount)}</Row>
      <Row label={text.total}>
        <span className="text-h3 tabular-nums">{formatIDR(view.totalAmount)}</span>
      </Row>
    </dl>
  );
}

// What Midtrans told us of an attempt in progress: the Virtual Account to transfer to, or the QRIS to scan.
function PendingInstructions({ payment }: { payment: NonNullable<PaymentPageView['payment']> }) {
  const bank = payment.vaBank ? (text.banks[payment.vaBank] ?? text.otherBank) : text.otherBank;
  return (
    <div className="space-y-2 rounded-xl border border-border p-4">
      <p className="text-body-sm font-medium">{text.pending.title}</p>
      {payment.method === 'virtual_account' && payment.vaNumber ? (
        <>
          <p className="text-body-sm">{text.pending.virtualAccount(bank)}</p>
          <p className="text-caption text-muted-foreground">{text.pending.vaNumber}</p>
          <p className="text-h3 tabular-nums select-all">{payment.vaNumber}</p>
        </>
      ) : (
        <p className="text-body-sm">{text.pending.qris}</p>
      )}
      <p className="text-caption text-muted-foreground">{text.pending.afterPaying}</p>
    </div>
  );
}

// The state a visitor arrives to: pay, carry on paying, or the reason there is nothing to pay. Only a hold in
// pending_payment shows the button, and the server checks that again (create_payment_attempt).
function PaymentState({ view, action }: { view: PaymentPageView; action: StartPaymentAction }) {
  if (view.needsReview) return <FormAlert tone="info">{text.underReview}</FormAlert>;
  if (PAID_STATUSES.has(view.status)) return <FormAlert tone="info">{text.paid}</FormAlert>;
  if (view.status === 'expired') return <FormAlert tone="info">{text.expired}</FormAlert>;
  if (view.status !== 'pending_payment' || view.expiresAt === null) {
    return <FormAlert tone="info">{text.notAwaitingPayment}</FormAlert>;
  }
  const pendingPayment = view.payment?.status === 'pending' ? view.payment : null;
  return (
    <div className="space-y-4">
      <HoldCountdown expiresAt={view.expiresAt} />
      {pendingPayment && <PendingInstructions payment={pendingPayment} />}
      <PayButton
        bookingCode={view.bookingCode}
        label={pendingPayment ? text.continuePay : text.pay}
        action={action}
      />
      <p className="text-caption text-muted-foreground">{text.onlyThroughSystem}</p>
    </div>
  );
}

// /reservasi/[bookingCode]/bayar (docs/PRD.md FR-BOOK-10): the booking as it will be paid for, and one primary action.
export function PaymentCard({
  view,
  action,
}: {
  view: PaymentPageView;
  action: StartPaymentAction;
}) {
  return (
    <AuthCard title={text.title} description={text.description}>
      <PaymentSummary view={view} />
      <PaymentState view={view} action={action} />
    </AuthCard>
  );
}
