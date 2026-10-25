import { describe, expect, it } from 'vitest';

import {
  addonFulfillmentSchema,
  adminNotesSchema,
  revealContactSchema,
} from '@/lib/validations/booking-admin';

const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const ADDON_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000cc';

describe('the booking detail schemas', () => {
  it('hold a reveal reason to 3–300 characters without contact details', () => {
    const reveal = (reason: string) =>
      revealContactSchema.safeParse({ bookingId: BOOKING_ID, reason });
    expect(reveal('Konfirmasi jadwal kedatangan').success).toBe(true);
    expect(reveal(' ab ').success).toBe(false);
    expect(reveal('x'.repeat(301)).success).toBe(false);
    expect(reveal('Telepon 081234567890').success).toBe(false);
  });

  it('accept an empty staff note, which clears it, and parse their own output again', () => {
    const parsed = adminNotesSchema.parse({ bookingId: BOOKING_ID, adminNotes: '  ' });
    expect(parsed.adminNotes).toBe('');
    expect(adminNotesSchema.parse(parsed)).toEqual(parsed);
    expect(
      adminNotesSchema.safeParse({ bookingId: BOOKING_ID, adminNotes: 'https://contoh.test' })
        .success,
    ).toBe(false);
  });

  it('let a kitchen mark a line prepared or handed over, but never cancel it', () => {
    const mark = (status: string) =>
      addonFulfillmentSchema.safeParse({ bookingId: BOOKING_ID, addonId: ADDON_ID, status });
    expect(mark('prepared').success).toBe(true);
    expect(mark('handed_over').success).toBe(true);
    expect(mark('cancelled').success).toBe(false);
    expect(
      addonFulfillmentSchema.safeParse({
        bookingId: BOOKING_ID,
        addonId: ADDON_ID,
        status: 'prepared',
        qty: 2,
      }).success,
    ).toBe(false);
  });
});
