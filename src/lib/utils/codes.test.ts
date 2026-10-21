import { describe, expect, it } from 'vitest';

import { isBookingCode, isOrderId, normalizeBookingCode } from './codes';

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

describe('isOrderId', () => {
  it.each(['GSK-7F3K9Q2M-01', 'GSK-00000000-99', 'GSK-ZZZZZZZZ-12'])(
    'accepts %s, a booking code and a two-digit attempt',
    (orderId) => {
      expect(isOrderId(orderId)).toBe(true);
    },
  );

  it.each([
    'GSK-7F3K9Q2M',
    'GSK-7F3K9Q2M-1',
    'GSK-7F3K9Q2M-001',
    'gsk-7f3k9q2m-01',
    'GSK-7F3K9Q2U-01',
    'ORDER-12345',
    ' GSK-7F3K9Q2M-01',
  ])('refuses %s', (orderId) => {
    expect(isOrderId(orderId)).toBe(false);
  });
});
