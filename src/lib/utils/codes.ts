// The database makes every booking code, order id and ticket code (internal.create_booking, create_payment_attempt,
// apply_payment_event); the application only reads them, so this file holds their formats and nothing that draws one.

// Mirrors the bookings.booking_code CHECK: 'GSK-' + 8 Crockford base32 characters (no I, L, O or U).
export const BOOKING_CODE_PATTERN = /^GSK-[0-9A-HJKMNP-TV-Z]{8}$/;

// Mirrors the payments.order_id CHECK: the booking code and the payment attempt in two digits, 'GSK-7F3K9Q2M-01'.
const ORDER_ID_PATTERN = /^GSK-[0-9A-HJKMNP-TV-Z]{8}-[0-9]{2}$/;

// A ticket code is the booking code and its RW in two digits, 'GSK-7F3K9Q2M-05' (CLAUDE.md Appendix A.1).
export const TICKET_CODE_PATTERN = /^GSK-[0-9A-HJKMNP-TV-Z]{8}-[0-9]{2}$/;

const BOOKING_CODE_PREFIX = 'GSK';

// Crockford base32 reads look-alike letters as the digit people meant.
const CROCKFORD_LOOK_ALIKES: Record<string, string> = { O: '0', I: '1', L: '1' };

// What a visitor or an officer types: 'gsk 7f3k-9q2m', '7F3K9Q2M', 'GSK-7F3K9Q2O'. Returns the
// canonical code, or null when it cannot be one. Codes are matched exactly afterwards, never searched.
export function normalizeBookingCode(input: string): string | null {
  let body = input.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (body.startsWith(BOOKING_CODE_PREFIX)) body = body.slice(BOOKING_CODE_PREFIX.length);
  const decoded = body.replace(/[OIL]/g, (letter) => CROCKFORD_LOOK_ALIKES[letter] ?? letter);
  const code = `${BOOKING_CODE_PREFIX}-${decoded}`;
  return BOOKING_CODE_PATTERN.test(code) ? code : null;
}

export function isBookingCode(value: string): boolean {
  return BOOKING_CODE_PATTERN.test(value);
}

// docs/Security.md §3.3 step 8: the Midtrans webhook alerts on an order it does not know only when the id has our
// shape, so junk posts cannot page the team.
export function isOrderId(value: string): boolean {
  return ORDER_ID_PATTERN.test(value);
}
