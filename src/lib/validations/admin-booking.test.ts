import { describe, expect, it } from 'vitest';

import { adminPicPhoneSchema, createAdminBookingSchema, picPhoneSchema } from './booking';
import { recordCashFormSchema, recordCashSchema, walkInQuoteSchema } from './walk-in';

// Task P4.3.10: the officer's booking at the counter (BOOK-05, BOOK-11; docs/PRD.md §13.1 A13).

const MAX_PAX = 500;
const schema = createAdminBookingSchema(MAX_PAX);
const BOOKING = {
  packageId: '0192f3a4-5b6c-7d8e-9f01-0000000000a1',
  visitSessionIds: ['0192f3a4-5b6c-7d8e-9f01-0000000000b1'],
  pax: 4,
  bookerType: 'individual',
  institutionName: '',
  picName: 'John Walker',
  picPhone: '+44 7700 900123',
  picEmail: 'john.walker@example.test',
  notes: '',
  isPhoneConfirmed: true,
  isCashOnTheSpot: true,
  consentAttested: true,
  idempotencyKey: '0192F3A4-5B6C-7D8E-9F01-0000000000C1',
  quoteHash: 'a'.repeat(64),
};

describe('createAdminBookingSchema', () => {
  it("takes a number from abroad, returned in E.164, and the officer's two ticks", () => {
    const parsed = schema.parse(BOOKING);
    expect(parsed.picPhone).toBe('+447700900123');
    expect(parsed.institutionName).toBeNull();
    expect(parsed.idempotencyKey).toBe('0192f3a4-5b6c-7d8e-9f01-0000000000c1');
    expect(parsed).toMatchObject({ isPhoneConfirmed: true, isCashOnTheSpot: true });
  });

  it('takes an Indonesian landline too, which the web refuses', () => {
    expect(schema.parse({ ...BOOKING, picPhone: '024 7612345' }).picPhone).toBe('+62247612345');
    expect(picPhoneSchema.safeParse('024 7612345').success).toBe(false);
    expect(picPhoneSchema.safeParse('+44 7700 900123').success).toBe(false);
  });

  it('refuses a number that is no E.164, a foreign one without its +', () => {
    expect(adminPicPhoneSchema.safeParse('0044 7700 900123').success).toBe(false);
    expect(adminPicPhoneSchema.safeParse('+0 7700 900123').success).toBe(false);
  });

  it("needs the officer's attestation of the PIC's consent", () => {
    expect(schema.safeParse({ ...BOOKING, consentAttested: false }).success).toBe(false);
  });

  it('names the institution of a group', () => {
    const result = schema.safeParse({ ...BOOKING, bookerType: 'school' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['institutionName']);
  });

  it('takes no price, total, add-on or participant list from the browser', () => {
    expect(schema.safeParse({ ...BOOKING, total: 1 }).success).toBe(false);
    expect(schema.safeParse({ ...BOOKING, addons: [] }).success).toBe(false);
    expect(schema.safeParse({ ...BOOKING, participants: [] }).success).toBe(false);
  });

  it('keeps the group within booking.max_pax and needs a session and the quote', () => {
    expect(schema.safeParse({ ...BOOKING, pax: MAX_PAX + 1 }).success).toBe(false);
    expect(schema.safeParse({ ...BOOKING, visitSessionIds: [] }).success).toBe(false);
    expect(schema.safeParse({ ...BOOKING, quoteHash: '' }).success).toBe(false);
  });
});

describe('the walk-in reads and the cash', () => {
  it('quote a package by id and a whole group size', () => {
    expect(walkInQuoteSchema.safeParse({ packageId: BOOKING.packageId, pax: 3 }).success).toBe(
      true,
    );
    expect(walkInQuoteSchema.safeParse({ packageId: BOOKING.packageId, pax: 2.5 }).success).toBe(
      false,
    );
    expect(walkInQuoteSchema.safeParse({ packageSlug: 'x', pax: 3 }).success).toBe(false);
  });

  it('take the cash as a whole amount with an optional receipt reference of at most 100 characters', () => {
    const cash = {
      bookingId: '0192f3a4-5b6c-7d8e-9f01-0000000000d1',
      amount: 120000,
      reference: ' ',
      attendeeCount: null,
    };
    expect(recordCashSchema.parse(cash).reference).toBe('');
    expect(recordCashSchema.safeParse({ ...cash, amount: 1200.5 }).success).toBe(false);
    expect(recordCashSchema.safeParse({ ...cash, reference: 'x'.repeat(101) }).success).toBe(false);
    expect(recordCashSchema.safeParse({ ...cash, method: 'manual_transfer' }).success).toBe(false);
    const form = { ...cash, code: '123456', isPresent: false };
    expect(recordCashFormSchema(false, 8).safeParse(form).success).toBe(true);
  });

  // Delta review of PR #91, L-3: after the session started, the group is confirmed here and counted in.
  it('ask, once the session started, for the group to be here and counted, up to twice its size', () => {
    const form = {
      bookingId: '0192f3a4-5b6c-7d8e-9f01-0000000000d1',
      amount: 120000,
      reference: '',
      code: '123456',
    };
    const started = recordCashFormSchema(true, 8);
    expect(started.safeParse({ ...form, isPresent: true, attendeeCount: 4 }).success).toBe(true);
    expect(started.safeParse({ ...form, isPresent: false, attendeeCount: 4 }).success).toBe(false);
    expect(started.safeParse({ ...form, isPresent: true, attendeeCount: null }).success).toBe(
      false,
    );
    expect(started.safeParse({ ...form, isPresent: true, attendeeCount: 9 }).success).toBe(false);
    expect(recordCashSchema.safeParse({ ...form, attendeeCount: 0 }).success).toBe(false);
  });
});
