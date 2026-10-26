import 'server-only';

import { randomUUID } from 'node:crypto';

import type { DatabaseClient } from '@/db/rpc-result';
import {
  svcFlagCancellationForSuperadmin,
  svcRefundPreview,
  type RefundKind,
  type RefundQuote,
} from '@/db/rpc-terms';
import { raisedHintOf } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { manageRightsOf, statusHubOf } from '@/server/services/booking-hub-reads';
import { weatherStateOf } from '@/server/services/booking-weather-reads';
import type { StatusHubView, WeatherState } from '@/types/booking-hub';

// The status hub's data (Task P3.12.01, P3.12.02; docs/PRD.md §13.1 A16–A20), assembled on the service-role client
// booking-service.ts hands in, keyed by the booking id a verified guest link gave.

export interface StatusHubData {
  view: StatusHubView;
  // What a cancellation would give back now (FR-BOOK-23), for the manage link of a paid booking.
  cancellation: RefundQuote | null;
  // The cancellation is the superadmin's to finish (final review of PR #69, L-3): the hub says to call the kelurahan.
  cancellationNeedsSuperadmin: boolean;
  // After a weather notice: the moves and the weather refund the manage link may choose (FR-BOOK-24, FR-BOOK-25).
  weather: WeatherState | null;
  weatherRefund: RefundQuote | null;
  // The pay link a manage holder may hand the treasurer (FR-B2B-10): /reservasi/<code>/bayar?t=…, 24 h.
  payLinkToken: string | null;
}

type QuoteAnswer = { quote: RefundQuote | null; needsSuperadmin: boolean };

const NO_QUOTE: QuoteAnswer = { quote: null, needsSuperadmin: false };

// A refund the terms cannot give now (a past visit, an unset fee) is no option. One the kelurahan and RW shares cannot
// keep (CANCEL_NEEDS_SUPERADMIN) raises the superadmin's alert and says so; any other failure is logged and the hub
// shows no option rather than an error page (review of PR #69, L-3). The cancel asks the database again anyway.
async function quoteOf(
  adminClient: DatabaseClient,
  bookingId: string,
  kind: RefundKind,
): Promise<QuoteAnswer> {
  try {
    return {
      quote: await svcRefundPreview(adminClient, { bookingId, kind }),
      needsSuperadmin: false,
    };
  } catch (error) {
    const hint = raisedHintOf(error);
    if (hint === 'CANCEL_NEEDS_SUPERADMIN') {
      await svcFlagCancellationForSuperadmin(adminClient, bookingId);
      return { quote: null, needsSuperadmin: true };
    }
    if (hint !== 'STATE_INVALID') {
      createLogger(randomUUID()).error('internal_error', {
        step: 'refund_preview',
        bookingId,
        kind,
      });
    }
    return NO_QUOTE;
  }
}

export async function statusHubDataOf(
  adminClient: DatabaseClient,
  guest: { bookingId: string; scope: Parameters<typeof manageRightsOf>[0]['scope'] },
  mintPayLink: () => Promise<string>,
): Promise<StatusHubData> {
  const view = await statusHubOf(adminClient, guest.bookingId);
  const rights = manageRightsOf(guest, view);
  const weather = rights.hasWeather ? await weatherStateOf(adminClient, guest.bookingId) : null;
  const cancellation = rights.canCancelPaid
    ? await quoteOf(adminClient, guest.bookingId, 'cancellation')
    : NO_QUOTE;
  const weatherRefund = weather ? await quoteOf(adminClient, guest.bookingId, 'weather') : NO_QUOTE;
  return {
    view,
    cancellation: cancellation.quote,
    cancellationNeedsSuperadmin: cancellation.needsSuperadmin,
    weather,
    weatherRefund: weatherRefund.quote,
    payLinkToken: rights.canPassPayLink ? await mintPayLink() : null,
  };
}
