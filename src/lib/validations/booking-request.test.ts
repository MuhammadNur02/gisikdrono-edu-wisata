import { describe, expect, it } from 'vitest';

import { bookingRequestSchema } from '@/lib/validations/booking';

// Review of PR #27, M1: the request names the contact the summary showed as verified, which the action compares with
// the gsk_phone cookie. It proves nothing itself.
describe('bookingRequestSchema', () => {
  const request = { mode: 'pay', packageSlug: 'paket-kombinasi', booking: {} };

  it('reads the shown contact in the spelling the proof uses', () => {
    const shown = { channel: 'email', phone: '0812-3456-7890', email: ' Ani@Sekolah.sch.id ' };
    expect(bookingRequestSchema.parse({ ...request, shownContact: shown }).shownContact).toEqual({
      channel: 'email',
      phone: '+6281234567890',
      email: 'ani@sekolah.sch.id',
    });
  });

  it('takes no shown contact as null, and refuses a request without the key or with another channel', () => {
    expect(bookingRequestSchema.parse({ ...request, shownContact: null }).shownContact).toBeNull();
    expect(bookingRequestSchema.safeParse(request).success).toBe(false);
    const sms = { channel: 'sms', phone: '081234567890', email: null };
    expect(bookingRequestSchema.safeParse({ ...request, shownContact: sms }).success).toBe(false);
  });
});
