import 'server-only';

import { createHash } from 'node:crypto';

import type { BookingQuote, BookingQuoteLine } from '@/types/booking';

// The fingerprint of the quote the summary step shows (decision of 2026-10-22, Q6). The visitor sends it back with the
// booking instead of any price, and internal.booking_quote_hash computes the same text from the rows internal.create_booking
// prices again, refusing the booking as PRICE_MISMATCH when the two differ. One line per priced line,
// `kind|id|unit_price|quantity|line_total`, the package line first and the add-ons in product-id order, then
// `total|<total>`: what a visitor pays, and nothing a name or label could change.

const PACKAGE_FIRST = '0';
const ADDONS_AFTER = '1';

function idOf(line: BookingQuoteLine): string {
  return line.kind === 'package' ? line.packageId : line.productId;
}

// The order Postgres sorts these keys in with collate "C": by code unit, as JavaScript compares strings.
function orderKey(line: BookingQuoteLine): string {
  return line.kind === 'package' ? PACKAGE_FIRST : `${ADDONS_AFTER}${line.productId}`;
}

function canonicalText(quote: BookingQuote): string {
  const lines = [...quote.lines]
    .sort((left, right) => (orderKey(left) < orderKey(right) ? -1 : 1))
    .map((line) =>
      [line.kind, idOf(line), line.unitPrice, line.quantity, line.lineTotal].join('|'),
    );
  return [...lines, `total|${String(quote.total)}`].join('\n');
}

export function bookingQuoteHash(quote: BookingQuote): string {
  return createHash('sha256').update(canonicalText(quote), 'utf8').digest('hex');
}
