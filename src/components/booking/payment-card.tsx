import { ArrowRight, CircleCheck, Landmark, Lock, QrCode, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { CopyValueButton } from '@/components/booking/copy-value-button';
import { HoldCountdown } from '@/components/booking/hold-countdown';
import { PayButton, type StartPaymentAction } from '@/components/booking/pay-button';
import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { GUEST_BOOKING_PATH } from '@/config/guest';
import { bookingLayoutCopy } from '@/lib/copy/booking-layout';
import { copy } from '@/lib/copy/id';
import { layoutCopy } from '@/lib/copy/ui';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateShort, formatTimeRange } from '@/lib/utils/dates';
import type { PaymentPageView } from '@/types/payment';

const text = copy.booking.payment;
const layout = bookingLayoutCopy.payment;
const DOT = ' · ';
const PAID_STATUSES: ReadonlySet<PaymentPageView['status']> = new Set([
  'paid',
  'checked_in',
  'completed',
]);

function isAwaitingPayment(view: PaymentPageView): view is PaymentPageView & { expiresAt: string } {
  return !view.needsReview && view.status === 'pending_payment' && view.expiresAt !== null;
}

// "Eduwisata Ecowastreme · 28 Okt 2026 · 08.30–10.30 WIB · 30 orang", one session per RW for a combo.
function visitLine(view: PaymentPageView): string {
  const sessions = view.sessions.map((session) =>
    [
      view.sessions.length > 1 ? session.rwName : null,
      formatDateShort(session.sessionDate),
      formatTimeRange(session.startTime, session.endTime),
    ]
      .filter(Boolean)
      .join(DOT),
  );
  return [view.packageName, ...sessions, text.paxCount(view.paxCount)].join(DOT);
}

// DESIGN-SPEC §3.12: the booking code, the page's name as the eyebrow, the amount in the display face beside the hold's
// timer, and the visit in one line.
function PaymentHead({ view }: { view: PaymentPageView }) {
  return (
    <header className="space-y-3">
      <p className="text-meta-caps text-muted-foreground tabular-nums">
        {layout.bookingOf(view.bookingCode)}
      </p>
      <h1 className="text-eyebrow text-primary-ink">{text.title}</h1>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <p className="text-display font-display font-extrabold tabular-nums">
          <span className="sr-only">{text.total} </span>
          {formatIDR(view.totalAmount)}
        </p>
        {isAwaitingPayment(view) && <HoldCountdown expiresAt={view.expiresAt} />}
      </div>
      <p className="text-body text-pretty text-ink-2">{visitLine(view)}</p>
    </header>
  );
}

function MethodRow(props: { icon: ReactNode; title: string; hint: string; children?: ReactNode }) {
  return (
    <div className="flex gap-4 rounded-xl bg-muted p-4">
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground"
      >
        {props.icon}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="text-label font-semibold text-foreground">{props.title}</p>
        <p className="text-body-sm text-ink-2">{props.hint}</p>
        {props.children}
      </div>
    </div>
  );
}

// The methods Midtrans will offer (DESIGN-SPEC §3.12): QRIS and the Virtual Accounts, chosen on Midtrans' own page.
function MethodsCard() {
  const methods = layout.methods;
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-7">
      <h2 className="text-h4 font-bold">{methods.title}</h2>
      <MethodRow
        icon={<QrCode className="size-5" />}
        title={methods.qris}
        hint={methods.qrisHint}
      />
      <MethodRow
        icon={<Landmark className="size-5" />}
        title={methods.virtualAccount}
        hint={methods.virtualAccountHint}
      >
        <ul className="flex flex-wrap gap-1.5 pt-1.5">
          {methods.banks.map((bank) => (
            <li
              key={bank}
              className="inline-flex h-7 items-center rounded-full border border-border bg-card px-3 text-caption font-semibold text-ink-2"
            >
              {bank}
            </li>
          ))}
        </ul>
      </MethodRow>
      <p className="flex gap-2.5 text-caption text-ink-2">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-rw05" />
        {methods.secure}
      </p>
    </section>
  );
}

function CopyRow({ label, value, shown }: { label: string; value: string; shown: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 first:border-0 first:pt-0">
      <div className="min-w-0 space-y-1">
        <p className="text-caption text-muted-foreground">{label}</p>
        <p className="text-h3 font-display font-extrabold tracking-wide tabular-nums select-all">
          {shown}
        </p>
      </div>
      <CopyValueButton
        value={value}
        label={layout.copy}
        copiedLabel={layout.copied}
        failedLabel={layout.copyFailed}
        what={label.toLowerCase()}
      />
    </div>
  );
}

// What Midtrans told us of an attempt in progress: the Virtual Account to transfer to, or the QRIS to scan.
function PendingInstructions({
  payment,
  totalAmount,
}: {
  payment: NonNullable<PaymentPageView['payment']>;
  totalAmount: number;
}) {
  const bank = payment.vaBank ? (text.banks[payment.vaBank] ?? text.otherBank) : text.otherBank;
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-7">
      <p className="text-h4 font-bold">{text.pending.title}</p>
      {payment.method === 'virtual_account' && payment.vaNumber ? (
        <div className="space-y-4">
          <p className="text-body-sm text-ink-2">{text.pending.virtualAccount(bank)}</p>
          <CopyRow
            label={text.pending.vaNumber}
            value={payment.vaNumber}
            shown={payment.vaNumber}
          />
          <CopyRow
            label={layout.amountDue}
            value={String(totalAmount)}
            shown={formatIDR(totalAmount)}
          />
        </div>
      ) : (
        <p className="text-body-sm text-ink-2">{text.pending.qris}</p>
      )}
      <p className="text-caption text-muted-foreground">{text.pending.afterPaying}</p>
    </section>
  );
}

function PaidState({ bookingCode }: { bookingCode: string }) {
  return (
    <div className="space-y-5">
      <p className="flex gap-3 rounded-2xl bg-success-soft p-5 text-body text-success-soft-foreground">
        <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
        {text.paid}
      </p>
      <Button asChild size="lg" className="w-full">
        <Link href={`${GUEST_BOOKING_PATH}/${bookingCode}/tiket`}>
          {text.seeTickets}
          <ArrowRight aria-hidden data-icon="trailing" />
        </Link>
      </Button>
    </div>
  );
}

// The state a visitor arrives to: pay, carry on paying, or the reason there is nothing to pay. Only a hold in
// pending_payment shows the button, and the server checks that again (create_payment_attempt).
function PaymentState({ view, action }: { view: PaymentPageView; action: StartPaymentAction }) {
  if (view.needsReview) return <FormAlert tone="info">{text.underReview}</FormAlert>;
  if (PAID_STATUSES.has(view.status)) return <PaidState bookingCode={view.bookingCode} />;
  if (view.status === 'expired') return <FormAlert tone="info">{text.expired}</FormAlert>;
  if (!isAwaitingPayment(view)) return <FormAlert tone="info">{text.notAwaitingPayment}</FormAlert>;
  const pendingPayment = view.payment?.status === 'pending' ? view.payment : null;
  return (
    <div className="space-y-6">
      {pendingPayment ? (
        <PendingInstructions payment={pendingPayment} totalAmount={view.totalAmount} />
      ) : (
        <MethodsCard />
      )}
      <PayButton
        bookingCode={view.bookingCode}
        label={pendingPayment ? text.continuePay : text.pay}
        action={action}
      />
    </div>
  );
}

// /reservasi/[bookingCode]/bayar (docs/PRD.md FR-BOOK-10, DESIGN-SPEC §3.12): the booking as it will be paid for, one
// primary action, and the promise that payment goes only through the system.
export function PaymentCard({
  view,
  action,
}: {
  view: PaymentPageView;
  action: StartPaymentAction;
}) {
  return (
    <div className="space-y-7 md:space-y-8">
      <PaymentHead view={view} />
      <PaymentState view={view} action={action} />
      <p className="flex gap-3 rounded-xl bg-rw05-tint p-4 text-body-sm text-rw05-strong">
        <ShieldCheck aria-hidden className="mt-0.5 size-4.5 shrink-0" />
        {layoutCopy.paymentTrust}
      </p>
    </div>
  );
}
