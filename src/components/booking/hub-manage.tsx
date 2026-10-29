import { CloudRain, Share2 } from 'lucide-react';

import {
  CancelBookingDialog,
  type CancelBookingAction,
} from '@/components/booking/cancel-booking-dialog';
import { CopyValueButton } from '@/components/booking/copy-value-button';
import {
  QuotationConfirm,
  type QuotationConfirmProps,
} from '@/components/booking/quotation-confirm';
import { RevokeLinksButton } from '@/components/booking/revoke-links-button';
import {
  WeatherReschedule,
  type RescheduleBookingAction,
} from '@/components/booking/weather-reschedule';
import { Button } from '@/components/ui/button';
import { GUEST_BOOKING_PATH } from '@/config/guest';
import type { RefundQuote } from '@/db/rpc-terms';
import { bookingHubCopy } from '@/lib/copy/booking-hub';
import { formatIDR } from '@/lib/utils/currency';
import { formatClockTime, formatDateLong } from '@/lib/utils/dates';
import { buildWhatsAppShareUrl } from '@/lib/utils/whatsapp';
import type { ActionResult } from '@/types/action-result';
import type { StatusHubView, WeatherLeg, WeatherState } from '@/types/booking-hub';

const text = bookingHubCopy;
const CARD = 'space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6';
const CANCELLABLE: ReadonlySet<StatusHubView['booking']['status']> = new Set([
  'quoted',
  'pending_payment',
  'paid',
]);

// The Server Actions the manage link uses; the page hands them down, since components never import src/server.
export interface HubActions {
  cancel: CancelBookingAction;
  reschedule: RescheduleBookingAction;
  confirmQuotation: QuotationConfirmProps['confirmAction'];
  otp: QuotationConfirmProps['otpActions'];
  revoke: (input: unknown) => Promise<ActionResult<null>>;
}

function instantText(instant: string): string {
  return `${formatDateLong(instant)}, ${formatClockTime(instant)}`;
}

// docs/PRD.md FR-B2B-10: the pay link a PIC hands the treasurer, who pays from another phone.
export function TreasurerCard({ payUrl }: { payUrl: string }) {
  return (
    <section aria-labelledby="hub-treasurer" className={CARD}>
      <div className="space-y-1">
        <h2 id="hub-treasurer" className="text-h4 font-bold">
          {text.treasurer.title}
        </h2>
        <p className="text-body-sm text-ink-2">{text.treasurer.body}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted p-3">
        <p className="min-w-0 flex-1 truncate text-caption text-ink-2" title={payUrl}>
          <span className="sr-only">{text.treasurer.linkLabel}: </span>
          {payUrl}
        </p>
        <CopyValueButton
          value={payUrl}
          what={text.treasurer.what}
          label={text.copy}
          copiedLabel={text.copied}
          failedLabel={text.copyFailed}
        />
      </div>
      <Button asChild variant="outline" className="w-full">
        <a
          href={buildWhatsAppShareUrl(text.treasurer.message(payUrl))}
          target="_blank"
          rel="noopener"
        >
          <Share2 aria-hidden />
          {text.treasurer.send}
        </a>
      </Button>
    </section>
  );
}

export function QuotedConfirm({
  bookingCode,
  actions,
}: {
  bookingCode: string;
  actions: HubActions;
}) {
  return (
    <QuotationConfirm
      bookingCode={bookingCode}
      otpActions={actions.otp}
      confirmAction={actions.confirmQuotation}
      labels={text.quoted}
    />
  );
}

function cancelBody(view: StatusHubView, quote: RefundQuote | null): string {
  if (view.booking.status !== 'paid') return text.cancel.unpaidBody;
  if (!quote || quote.amount === 0) return text.cancel.paidNothing;
  // The add-on part only for a booking that holds add-ons (decision of 2026-10-29: none is sold any more).
  const breakdown =
    view.addons.length > 0
      ? text.cancel.breakdown(
          formatIDR(quote.packageRefund),
          quote.refundPct ?? 0,
          formatIDR(quote.addonRefund),
        )
      : text.cancel.packageBreakdown(formatIDR(quote.packageRefund), quote.refundPct ?? 0);
  return `${text.cancel.paidBody(formatIDR(quote.amount))} ${breakdown}`;
}

// docs/PRD.md FR-BOOK-23 (A16): the refund shown is the one the database computed for today, not a browser sum.
// Final review of PR #69, L-3: a cancellation the terms cannot book here goes through the kelurahan.
export function CancelSection(props: {
  view: StatusHubView;
  quote: RefundQuote | null;
  needsSuperadmin: boolean;
  actions: HubActions;
}) {
  if (!props.needsSuperadmin) return <CancelPanel {...props} />;
  return <p className="text-body-sm text-ink-2">{text.cancel.needsSuperadmin}</p>;
}

function CancelPanel(props: {
  view: StatusHubView;
  quote: RefundQuote | null;
  actions: HubActions;
}) {
  const { view, quote, actions } = props;
  if (view.booking.needsReview || !CANCELLABLE.has(view.booking.status)) return null;
  if (view.booking.status === 'paid' && !quote) return null;
  const isPaid = view.booking.status === 'paid';
  return (
    <div className="space-y-1">
      <CancelBookingDialog
        bookingCode={view.booking.bookingCode}
        kind="cancellation"
        refundAmount={isPaid && quote ? quote.amount : 0}
        refundPct={isPaid && quote ? quote.refundPct : null}
        action={actions.cancel}
        trigger={text.cancel.open}
        title={text.cancel.dialogTitle}
        body={cancelBody(view, quote)}
        confirm={text.cancel.confirm}
        keep={text.cancel.keep}
      />
      <p className="text-caption text-muted-foreground">
        {isPaid ? text.cancel.paidHint : text.cancel.unpaidHint}
      </p>
    </div>
  );
}

function WeatherRefund(props: {
  bookingCode: string;
  quote: RefundQuote | null;
  needsSuperadmin: boolean;
  actions: HubActions;
}) {
  const { quote } = props;
  if (props.needsSuperadmin) {
    return <p className="text-body-sm text-ink-2">{text.weather.refundNeedsSuperadmin}</p>;
  }
  if (!quote) return <p className="text-body-sm text-ink-2">{text.weather.refundUnavailable}</p>;
  const body = text.weather.refundBody(formatIDR(quote.amount), formatIDR(quote.feeAmount));
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-label font-semibold">{text.weather.refundTitle}</p>
      <p className="text-body-sm text-ink-2">{body}</p>
      <CancelBookingDialog
        bookingCode={props.bookingCode}
        kind="weather"
        refundAmount={quote.amount}
        refundPct={quote.refundPct}
        action={props.actions.cancel}
        trigger={text.weather.refund}
        triggerVariant="outline"
        title={text.weather.refundConfirmTitle}
        body={body}
        confirm={text.cancel.confirm}
        keep={text.cancel.keep}
      />
    </div>
  );
}

function WeatherNotice({
  weather,
  needsSuperadmin,
}: {
  weather: WeatherState;
  needsSuperadmin: boolean;
}) {
  const until = instantText(weather.openUntil);
  return (
    <div className="flex gap-3">
      <CloudRain aria-hidden className="mt-0.5 size-5 shrink-0 text-warning-soft-foreground" />
      <div className="space-y-1 text-warning-soft-foreground">
        <h2 id="hub-weather" className="text-h4 font-bold">
          {text.weather.title}
        </h2>
        <p className="text-body-sm">
          {needsSuperadmin ? text.weather.bodyNeedsSuperadmin(until) : text.weather.body(until)}
        </p>
        {weather.reason && <p className="text-body-sm italic">{weather.reason}</p>}
      </div>
    </div>
  );
}

// One stopped leg: its moves left and where it may go (decision of 2026-10-25 on the weather, rules 1 and 3).
function WeatherLegMove(props: { bookingCode: string; leg: WeatherLeg; actions: HubActions }) {
  const { leg } = props;
  return (
    <div className="space-y-3">
      <p className="text-body-sm font-medium">
        {leg.movesLeft > 0
          ? text.weather.movesLeft(leg.rwName, leg.movesLeft)
          : text.weather.noMovesLeft(leg.rwName)}
      </p>
      {leg.movesLeft > 0 && (
        <WeatherReschedule
          bookingCode={props.bookingCode}
          options={leg.options}
          action={props.actions.reschedule}
          labels={{
            pickDay: text.weather.pickDay,
            pickSession: text.weather.pickSession(leg.rwName),
            noOptions: text.weather.noOptions,
            move: text.weather.move,
            moved: text.weather.moved,
          }}
        />
      )}
    </div>
  );
}

// docs/PRD.md FR-BOOK-24, FR-BOOK-25 (A17): after a weather notice the manage link moves the stopped leg, up to the
// cap, or takes the weather refund, both until the window closes; with no choice by then the refund comes on its own.
export function WeatherPanel(props: {
  bookingCode: string;
  weather: WeatherState;
  refund: RefundQuote | null;
  refundNeedsSuperadmin: boolean;
  actions: HubActions;
}) {
  const { weather, bookingCode, actions } = props;
  return (
    <section aria-labelledby="hub-weather" className="space-y-4 rounded-2xl bg-warning-soft p-5">
      <WeatherNotice weather={weather} needsSuperadmin={props.refundNeedsSuperadmin} />
      <div className="space-y-4 rounded-xl bg-card p-4">
        {weather.legs.map((leg) => (
          <WeatherLegMove key={leg.rwName} bookingCode={bookingCode} leg={leg} actions={actions} />
        ))}
        <WeatherRefund
          bookingCode={bookingCode}
          quote={props.refund}
          needsSuperadmin={props.refundNeedsSuperadmin}
          actions={actions}
        />
      </div>
    </section>
  );
}

export function RevokePanel({
  bookingCode,
  actions,
}: {
  bookingCode: string;
  actions: HubActions;
}) {
  return (
    <div className="space-y-1">
      <RevokeLinksButton
        bookingCode={bookingCode}
        action={actions.revoke}
        afterPath={`${GUEST_BOOKING_PATH}/cari`}
        labels={{ ...text.revoke, body: text.revoke.hint }}
      />
    </div>
  );
}
