import { describe, expect, it } from 'vitest';

import {
  closeDsrSchema,
  confirmDsrSchema,
  downloadDsrSchema,
  dsrFinishSchema,
  openDsrSchema,
  requestDsrCodeSchema,
} from './dsr';

const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const REQUEST_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000d5';
const CODE = 'GSK-7F3K9Q2M';

describe('the superadmin’s schemas', () => {
  it('bound the reason and the note to 10–2000 characters, trimmed', () => {
    const open = { bookingId: BOOKING_ID, requestType: 'erasure', reason: '   Hapus data saya   ' };
    expect(openDsrSchema.parse(open).reason).toBe('Hapus data saya');
    expect(openDsrSchema.safeParse({ ...open, reason: '  pendek  ' }).success).toBe(false);
    expect(openDsrSchema.safeParse({ ...open, reason: 'x'.repeat(2001) }).success).toBe(false);
    const finish = { bookingId: BOOKING_ID, requestId: REQUEST_ID, note: 'x'.repeat(2000) };
    expect(dsrFinishSchema.safeParse(finish).success).toBe(true);
    expect(dsrFinishSchema.safeParse({ ...finish, note: 'x'.repeat(9) }).success).toBe(false);
  });

  it('take no kind, outcome or field the migration does not know', () => {
    const open = {
      bookingId: BOOKING_ID,
      requestType: 'portability',
      reason: 'Diminta lewat email',
    };
    expect(openDsrSchema.safeParse(open).success).toBe(false);
    const close = { bookingId: BOOKING_ID, requestId: REQUEST_ID, note: 'Ditolak, data tidak ada' };
    expect(closeDsrSchema.safeParse({ ...close, outcome: 'rejected_other' }).success).toBe(true);
    expect(closeDsrSchema.safeParse({ ...close, outcome: 'exported' }).success).toBe(false);
    expect(
      closeDsrSchema.safeParse({ ...close, outcome: 'rectified', phone: '+628120000' }).success,
    ).toBe(false);
  });
});

describe('the guest’s schemas', () => {
  it('take the booking code and never a phone number', () => {
    expect(requestDsrCodeSchema.safeParse({ bookingCode: CODE, turnstileToken: 't' }).success).toBe(
      true,
    );
    expect(
      requestDsrCodeSchema.safeParse({ bookingCode: CODE, turnstileToken: 't', phone: '+62812' })
        .success,
    ).toBe(false);
    expect(
      requestDsrCodeSchema.safeParse({ bookingCode: 'GSK-1', turnstileToken: 't' }).success,
    ).toBe(false);
  });

  it('take a code of six digits and a JSON or PDF file', () => {
    expect(confirmDsrSchema.safeParse({ bookingCode: CODE, code: ' 123456 ' }).success).toBe(true);
    expect(confirmDsrSchema.safeParse({ bookingCode: CODE, code: '12345a' }).success).toBe(false);
    expect(downloadDsrSchema.safeParse({ bookingCode: CODE, format: 'pdf' }).success).toBe(true);
    expect(downloadDsrSchema.safeParse({ bookingCode: CODE, format: 'xlsx' }).success).toBe(false);
  });
});
