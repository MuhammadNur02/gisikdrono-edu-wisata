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
import type { StatusHubView, WeatherState } from '@/types/booking-hub';

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
  const breakdown = text.cancel.breakdown(
    formatIDR(quote.packageRefund),
    quote.refundPct ?? 0,
    formatIDR(quote.addonRefund),
  );
  return `${text.cancel.paidBody(formatIDR(quote.amount))} ${breakdown}`;
}

// docs/PRD.md FR-BOOK-23 (A16): the refund shown is the one the database computed for today, not a browser sum.
export function CancelPanel(props: {
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
  actions: HubActions;
}) {
  const { quote } = props;
  if (!quote) return <p className="text-body-sm text-ink-2">{text.weather.refundUnavailable}</p>;
  const body = text.weather.refundBody(formatIDR(quote.amount), formatIDR(quote.feeAmount));
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-label font-semibold">{text.weather.refundTitle}</p>
      <p className="text-body-sm text-ink-2">{body}</p>
      <CancelBookingDialog
        bookingCode={props.bookingCode}
        kind="weather"
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

function WeatherNotice({ weather }: { weather: WeatherState }) {
  return (
    <div className="flex gap-3">
      <CloudRain aria-hidden className="mt-0.5 size-5 shrink-0 text-warning-soft-foreground" />
      <div className="space-y-1 text-warning-soft-foreground">
        <h2 id="hub-weather" className="text-h4 font-bold">
          {text.weather.title}
        </h2>
        <p className="text-body-sm">{text.weather.body(instantText(weather.openUntil))}</p>
        {weather.reason && <p className="text-body-sm italic">{weather.reason}</p>}
      </div>
    </div>
  );
}

function rescheduleLabels(weather: WeatherState) {
  return {
    pickDay: text.weather.pickDay,
    pickSession: weather.legs.map((leg) => text.weather.pickSession(leg.rwName)),
    noOptions: text.weather.noOptions,
    move: text.weather.move,
    moved: text.weather.moved,
  };
}

// docs/PRD.md FR-BOOK-24, FR-BOOK-25 (A17): after a weather notice the manage link picks a new day or the refund.
export function WeatherPanel(props: {
  bookingCode: string;
  weather: WeatherState;
  refund: RefundQuote | null;
  actions: HubActions;
}) {
  const { weather, bookingCode, actions } = props;
  const canMove = weather.movesLeft > 0;
  return (
    <section aria-labelledby="hub-weather" className="space-y-4 rounded-2xl bg-warning-soft p-5">
      <WeatherNotice weather={weather} />
      <div className="space-y-4 rounded-xl bg-card p-4">
        <p className="text-body-sm font-medium">
          {canMove ? text.weather.movesLeft(weather.movesLeft) : text.weather.noMovesLeft}
        </p>
        {canMove && (
          <WeatherReschedule
            bookingCode={bookingCode}
            legs={weather.legs}
            action={actions.reschedule}
            labels={rescheduleLabels(weather)}
          />
        )}
        <WeatherRefund bookingCode={bookingCode} quote={props.refund} actions={actions} />
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
