import { describe, expect, it } from 'vitest';

import {
  formatPhone,
  INTERNATIONAL_PHONE_PATTERN,
  lastFourDigits,
  localDigits,
  maskPhone,
  normalizePhone,
  PHONE_PATTERN,
} from './phone';

describe('normalizePhone', () => {
  it.each([
    ['081234567890', '+6281234567890'],
    ['0812-3456-7890', '+6281234567890'],
    ['81234567890', '+6281234567890'],
    ['6281234567890', '+6281234567890'],
    ['+62 812 3456 7890', '+6281234567890'],
    ['+62 (812) 3456-7890', '+6281234567890'],
  ])('reads %s as %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    '',
    '0812',
    '+1 415 555 0100',
    '+44 7911 123456',
    '0014155550100',
    '+62 0812 3456 7890',
    '08123456789012345',
    'nomor saya',
  ])('refuses %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('accepts the shortest and longest numbers the database allows', () => {
    expect(normalizePhone('0' + '8'.repeat(8))).toBe('+62' + '8'.repeat(8));
    expect(normalizePhone('0' + '8'.repeat(13))).toBe('+62' + '8'.repeat(13));
    expect(normalizePhone('0' + '8'.repeat(14))).toBeNull();
  });

  it('always returns something the bookings.pic_phone CHECK accepts', () => {
    const phone = normalizePhone('0812 3456 7890');
    expect(phone && PHONE_PATTERN.test(phone)).toBe(true);
  });
});

describe('display helpers', () => {
  it('formats a number in groups of 3-4-rest', () => {
    expect(formatPhone('+6281234567890')).toBe('+62 812-3456-7890');
    expect(formatPhone('+62812345678')).toBe('+62 812-3456-78');
    expect(formatPhone('+628123')).toBe('+62 812-3');
  });

  it('masks the middle digits for staff lists', () => {
    expect(maskPhone('+6281234567890')).toBe('+62 812-••••-7890');
  });

  it('gives the digits after +62 and the last four', () => {
    expect(localDigits('+6281234567890')).toBe('81234567890');
    expect(localDigits('0812')).toBe('0812');
    expect(lastFourDigits('+6281234567890')).toBe('7890');
  });
});

// Task P4.3.10: a group from abroad, registered by an officer, keeps its number as written in E.164.
describe('numbers from abroad', () => {
  it('match the CHECK of an officer booking, never the +62 one', () => {
    expect(INTERNATIONAL_PHONE_PATTERN.test('+447700900123')).toBe(true);
    expect(INTERNATIONAL_PHONE_PATTERN.test('+6281234567890')).toBe(true);
    expect(INTERNATIONAL_PHONE_PATTERN.test('+0447700900123')).toBe(false);
    expect(INTERNATIONAL_PHONE_PATTERN.test('+1234567')).toBe(false);
    expect(INTERNATIONAL_PHONE_PATTERN.test('+1234567890123456')).toBe(false);
    expect(PHONE_PATTERN.test('+447700900123')).toBe(false);
  });

  it('are shown in E.164 and masked to their country code and at most half the digits', () => {
    expect(formatPhone('+447700900123')).toBe('+447700900123');
    expect(maskPhone('+447700900123')).toBe('+44 ••••0123');
    expect(maskPhone('+14155550100')).toBe('+1 ••••0100');
    expect(maskPhone('+35312345678')).toBe('+353 ••••78');
    expect(lastFourDigits('+447700900123')).toBe('0123');
  });
});
