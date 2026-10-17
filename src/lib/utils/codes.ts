// Mirrors the bookings.booking_code CHECK: 'GSK-' + 8 Crockford base32 characters (no I, L, O or U).
export const BOOKING_CODE_PATTERN = /^GSK-[0-9A-HJKMNP-TV-Z]{8}$/;

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
