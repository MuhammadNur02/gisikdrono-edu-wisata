import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { copy } from '@/lib/copy/id';
import {
  lookupBookingSchema,
  requestPhoneOtpSchema,
  verifyPhoneOtpSchema,
} from '@/lib/validations/guest';

const OTP_ID = '0192F3A4-5B6C-7D8E-9F01-0000000000AA';

describe('requestPhoneOtpSchema', () => {
  it('takes a WhatsApp request and parses its own output again', () => {
    const once = requestPhoneOtpSchema.parse({ phone: '0812-3456-7890', turnstileToken: 't' });
    expect(once).toEqual({
      channel: 'whatsapp',
      phone: '+6281234567890',
      email: null,
      turnstileToken: 't',
    });
    expect(requestPhoneOtpSchema.parse(once)).toEqual(once);
  });

  it('needs an address for the email fallback', () => {
    const parsed = requestPhoneOtpSchema.safeParse({
      channel: 'email',
      phone: '081234567890',
      turnstileToken: 't',
    });
    expect(parsed.error && z.flattenError(parsed.error).fieldErrors.email).toEqual([
      copy.auth.validation.email,
    ]);
  });

  it('refuses a price or any key it does not name', () => {
    expect(
      requestPhoneOtpSchema.safeParse({ phone: '081234567890', turnstileToken: 't', code: '1' })
        .success,
    ).toBe(false);
  });
});

describe('verifyPhoneOtpSchema', () => {
  it('names the contact the code was sent to and wants exactly six digits', () => {
    const once = verifyPhoneOtpSchema.parse({ code: ' 482913 ', phone: '081234567890' });
    expect(once).toEqual({
      channel: 'whatsapp',
      phone: '+6281234567890',
      email: null,
      code: '482913',
    });
    expect(verifyPhoneOtpSchema.parse(once)).toEqual(once);
    for (const code of ['48291', '4829134', 'abcdef']) {
      expect(verifyPhoneOtpSchema.safeParse({ code, phone: '081234567890' }).success).toBe(false);
    }
  });

  it('needs the address for an email code', () => {
    const parsed = verifyPhoneOtpSchema.safeParse({
      channel: 'email',
      code: '482913',
      phone: '081234567890',
    });
    expect(parsed.error && z.flattenError(parsed.error).fieldErrors.email).toEqual([
      copy.auth.validation.email,
    ]);
  });

  // Review of PR #20, M1: the browser no longer learns or sends an OTP id; its cookie names its code.
  it('refuses an OTP id from the browser', () => {
    expect(
      verifyPhoneOtpSchema.safeParse({ otpId: OTP_ID, code: '482913', phone: '081234567890' })
        .success,
    ).toBe(false);
  });
});

describe('lookupBookingSchema', () => {
  it.each([
    ['gsk 7f3k-9q2m', '0812 3456 7890', 'GSK-7F3K9Q2M', '+6281234567890'],
    ['GSK-7F3K9Q2O', ' Ani.Lestari@Sekolah.SCH.id ', 'GSK-7F3K9Q20', 'ani.lestari@sekolah.sch.id'],
    ['7f3k9q2m', '024 7612345', 'GSK-7F3K9Q2M', '+62247612345'],
  ])(
    'reads %s and %s in the spelling the database compares',
    (bookingCode, contact, code, canonical) => {
      const once = lookupBookingSchema.parse({ bookingCode, contact, turnstileToken: 't' });
      expect(once).toEqual({ bookingCode: code, contact: canonical, turnstileToken: 't' });
      expect(lookupBookingSchema.parse(once)).toEqual(once);
    },
  );

  it('explains a code or a contact that cannot be one', () => {
    const parsed = lookupBookingSchema.safeParse({
      bookingCode: 'GSK-123',
      contact: 'siapa',
      turnstileToken: 't',
    });
    expect(parsed.error && z.flattenError(parsed.error).fieldErrors).toEqual({
      bookingCode: [copy.booking.lookup.invalidCode],
      contact: [copy.booking.lookup.invalidContact],
    });
  });
});
