import type { RwId } from '@/config/rw';

// Mirrors the bookings.booking_code CHECK: 'GSK-' + 8 Crockford base32 characters (no I, L, O or U).
export const BOOKING_CODE_PATTERN = /^GSK-[0-9A-HJKMNP-TV-Z]{8}$/;

const BOOKING_CODE_PREFIX = 'GSK';
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CROCKFORD_BASE = CROCKFORD_ALPHABET.length;
const BYTE_VALUES = 256;
// docs/Security.md BOOK-10, GUEST-01: 40 random bits, exactly eight characters of five bits each.
const BOOKING_CODE_BYTES = 5;
const BOOKING_CODE_LENGTH = 8;
// payments.order_id and tickets_qr.ticket_code end in two digits (their CHECKs).
const SUFFIX_DIGITS = 2;
const LARGEST_SUFFIX = 99;

// Crockford base32 reads look-alike letters as the digit people meant.
const CROCKFORD_LOOK_ALIKES: Record<string, string> = { O: '0', I: '1', L: '1' };

// Web Crypto rather than node:crypto, so the lookup and check-in forms can still import this file's readers.
export function generateBookingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(BOOKING_CODE_BYTES));
  let value = bytes.reduce((total, byte) => total * BYTE_VALUES + byte, 0);
  let body = '';
  for (let position = 0; position < BOOKING_CODE_LENGTH; position += 1) {
    body = CROCKFORD_ALPHABET.charAt(value % CROCKFORD_BASE) + body;
    value = Math.floor(value / CROCKFORD_BASE);
  }
  return `${BOOKING_CODE_PREFIX}-${body}`;
}

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

function withSuffix(bookingCode: string, suffix: number): string {
  if (!isBookingCode(bookingCode)) throw new RangeError('Not a booking code.');
  if (!Number.isInteger(suffix) || suffix < 1 || suffix > LARGEST_SUFFIX) {
    throw new RangeError('The suffix of a booking code runs from 01 to 99.');
  }
  return `${bookingCode}-${String(suffix).padStart(SUFFIX_DIGITS, '0')}`;
}

// One ticket per leg, named after the RW whose gate scans it: 'GSK-7F3K9Q2M-05' (docs/PRD.md §9.3).
export function buildTicketCode(bookingCode: string, rwId: RwId): string {
  return withSuffix(bookingCode, rwId);
}

// One Midtrans order per payment attempt: 'GSK-7F3K9Q2M-01', then -02 after a failed attempt (docs/Security.md §3.2).
export function buildOrderId(bookingCode: string, attemptNo: number): string {
  return withSuffix(bookingCode, attemptNo);
}
