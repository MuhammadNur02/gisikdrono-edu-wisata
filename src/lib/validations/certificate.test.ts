import { describe, expect, it } from 'vitest';

import {
  certificateBookingSchema,
  revokeCertificateSchema,
  waiveCertificatesSchema,
} from '@/lib/validations/certificate';

const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const CERTIFICATE_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000cc';

describe('the certificate schemas', () => {
  it('take a booking id and nothing else', () => {
    expect(certificateBookingSchema.safeParse({ bookingId: BOOKING_ID }).success).toBe(true);
    expect(certificateBookingSchema.safeParse({ bookingId: 'GSK-7F3K9Q2M' }).success).toBe(false);
    expect(certificateBookingSchema.safeParse({ bookingId: BOOKING_ID, rwId: 5 }).success).toBe(
      false,
    );
  });

  it('hold a reason to 3–300 characters, trimmed, without contact details', () => {
    const waive = (reason: string) =>
      waiveCertificatesSchema.safeParse({ bookingId: BOOKING_ID, reason });
    expect(waive('  Dua pendamping sudah membayar tunai  ').data?.reason).toBe(
      'Dua pendamping sudah membayar tunai',
    );
    expect(waive('  ab ').success).toBe(false);
    expect(waive('x'.repeat(301)).success).toBe(false);
    expect(waive('Hubungi 081234567890').success).toBe(false);
  });

  it('revoke one certificate by its id with a reason', () => {
    expect(
      revokeCertificateSchema.safeParse({ certificateId: CERTIFICATE_ID, reason: 'Nama salah' })
        .success,
    ).toBe(true);
    expect(
      revokeCertificateSchema.safeParse({
        certificateId: CERTIFICATE_ID,
        reason: 'Nama salah',
        status: 'issued',
      }).success,
    ).toBe(false);
  });
});
