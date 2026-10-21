import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BOOKING_CODE_PATTERN,
  buildOrderId,
  buildTicketCode,
  generateBookingCode,
  isBookingCode,
  normalizeBookingCode,
} from './codes';

const CROCKFORD_SYMBOLS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
// With 5,000 codes a symbol misses a position by chance with odds of about (31/32)^5000, far below 1e-60.
const SAMPLE_SIZE = 5000;

function withRandomBytes(bytes: number[]): void {
  vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
    if (array instanceof Uint8Array) array.set(bytes);
    return array;
  });
}

describe('generateBookingCode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes 40 random bits as eight Crockford base32 characters', () => {
    withRandomBytes([0x01, 0x23, 0x45, 0x67, 0x89]);
    expect(generateBookingCode()).toBe('GSK-04HMASW9');
  });

  it('spans the whole alphabet, from all zero bits to all one bits', () => {
    withRandomBytes([0, 0, 0, 0, 0]);
    expect(generateBookingCode()).toBe('GSK-00000000');
    withRandomBytes([0xff, 0xff, 0xff, 0xff, 0xff]);
    expect(generateBookingCode()).toBe('GSK-ZZZZZZZZ');
  });

  it('always satisfies the bookings.booking_code CHECK and the readers of this file', () => {
    for (let index = 0; index < 1000; index += 1) {
      const code = generateBookingCode();
      expect(code).toMatch(BOOKING_CODE_PATTERN);
      expect(normalizeBookingCode(code)).toBe(code);
    }
  });

  it('uses every symbol in every position and does not repeat a code', () => {
    const codes = Array.from({ length: SAMPLE_SIZE }, generateBookingCode);
    expect(new Set(codes).size).toBe(SAMPLE_SIZE);
    for (let position = 0; position < 8; position += 1) {
      const symbols = new Set(codes.map((code) => code.charAt('GSK-'.length + position)));
      expect([...symbols].sort().join('')).toBe(CROCKFORD_SYMBOLS);
    }
  });
});

describe('buildTicketCode', () => {
  it('names the ticket after the RW whose gate scans it', () => {
    expect(buildTicketCode('GSK-7F3K9Q2M', 5)).toBe('GSK-7F3K9Q2M-05');
    expect(buildTicketCode('GSK-7F3K9Q2M', 8)).toBe('GSK-7F3K9Q2M-08');
  });

  it('refuses anything that is not a canonical booking code', () => {
    expect(() => buildTicketCode('gsk-7f3k9q2m', 5)).toThrow(RangeError);
  });
});

describe('buildOrderId', () => {
  it('numbers the payment attempts from 01 to 99', () => {
    expect(buildOrderId('GSK-7F3K9Q2M', 1)).toBe('GSK-7F3K9Q2M-01');
    expect(buildOrderId('GSK-7F3K9Q2M', 12)).toBe('GSK-7F3K9Q2M-12');
    expect(buildOrderId('GSK-7F3K9Q2M', 99)).toBe('GSK-7F3K9Q2M-99');
  });

  it.each([0, 100, 1.5, -1])(
    'refuses attempt number %s, which the order_id CHECK cannot hold',
    (attemptNo) => {
      expect(() => buildOrderId('GSK-7F3K9Q2M', attemptNo)).toThrow(RangeError);
    },
  );

  it('matches the grammar the Midtrans webhook recognises', () => {
    expect(buildOrderId(generateBookingCode(), 3)).toMatch(/^GSK-[0-9A-HJKMNP-TV-Z]{8}-[0-9]{2}$/);
  });
});

describe('normalizeBookingCode', () => {
  it.each([
    ['GSK-7F3K9Q2M', 'GSK-7F3K9Q2M'],
    ['gsk-7f3k9q2m', 'GSK-7F3K9Q2M'],
    ['gsk 7f3k 9q2m', 'GSK-7F3K9Q2M'],
    ['7F3K9Q2M', 'GSK-7F3K9Q2M'],
    ['GSK-7F3K-9Q2M', 'GSK-7F3K9Q2M'],
  ])('reads %s as %s', (input, expected) => {
    expect(normalizeBookingCode(input)).toBe(expected);
  });

  it('reads the look-alike letters O, I and L as 0 and 1', () => {
    expect(normalizeBookingCode('GSK-7F3KOQIL')).toBe('GSK-7F3K0Q11');
  });

  it.each(['', 'GSK-', 'GSK-7F3K9Q2', 'GSK-7F3K9Q2MX', 'GSK-7F3K9Q2U', 'INV/GSK/2026/10/0001'])(
    'refuses %s',
    (input) => {
      expect(normalizeBookingCode(input)).toBeNull();
    },
  );
});

describe('isBookingCode', () => {
  it('accepts only the canonical form', () => {
    expect(isBookingCode('GSK-7F3K9Q2M')).toBe(true);
    expect(isBookingCode('gsk-7f3k9q2m')).toBe(false);
    expect(isBookingCode('GSK-7F3K9Q2M-05')).toBe(false);
  });
});
