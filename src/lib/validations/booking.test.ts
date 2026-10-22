import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { BOOKING_LIMITS, MAX_PACKAGE_LEGS } from '@/config/booking';
import { copy } from '@/lib/copy/id';
import { createBookingSchema, picPhoneSchema } from '@/lib/validations/booking';

const MAX_PAX = 500;
const schema = createBookingSchema(MAX_PAX);
const messages = copy.booking.validation;

const PACKAGE_ID = '0192f3a4-5b6c-7d8e-9f01-23456789abcd';
const SESSION_RW05 = '0192f3a4-5b6c-7d8e-9f01-000000000005';
const SESSION_RW08 = '0192f3a4-5b6c-7d8e-9f01-000000000008';
const KERIPIK = '0192f3a4-5b6c-7d8e-9f01-0000000000a1';
const KOMPOS = '0192f3a4-5b6c-7d8e-9f01-0000000000a2';
// The UUID the wizard draws once per mount; in capitals here, to see the schema store it lower-cased.
const WIZARD_MOUNT = '7D444840-9DC0-11D1-B245-5FFDCE74FAD2';

const SCHOOL_BOOKING = {
  packageId: PACKAGE_ID,
  visitSessionIds: [SESSION_RW05, SESSION_RW08],
  visitDate: '2026-11-12',
  pax: 40,
  bookerType: 'school',
  institutionName: 'SD Negeri Gisikdrono 01',
  picName: 'Ani Lestari, S.Pd.',
  picEmail: 'Ani.Lestari@Sekolah.sch.id',
  notes: '',
  addons: [{ productId: KERIPIK, qty: 40, notes: 'Tanpa sambal untuk 5 porsi' }],
  participants: [
    { fullName: 'Budi Santoso', groupLabel: 'Kelas 5A', roleLabel: 'student' },
    { fullName: 'Rina Wati', groupLabel: '' },
  ],
  guardianConsent: true,
  consentVersion: '2026-10-18',
  marketingOptIn: false,
  idempotencyKey: WIZARD_MOUNT,
  turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
};

function fieldErrorsOf(input: unknown): Record<string, string[] | undefined> {
  const parsed = schema.safeParse(input);
  expect(parsed.success).toBe(false);
  return parsed.error ? z.flattenError(parsed.error).fieldErrors : {};
}

describe('createBookingSchema', () => {
  it('takes a school booking and parses its own output again unchanged', () => {
    const once = schema.parse(SCHOOL_BOOKING);
    expect(once).toMatchObject({
      picEmail: 'ani.lestari@sekolah.sch.id',
      notes: null,
      idempotencyKey: WIZARD_MOUNT.toLowerCase(),
      participants: [
        { fullName: 'Budi Santoso', groupLabel: 'Kelas 5A', roleLabel: 'student' },
        { fullName: 'Rina Wati', groupLabel: null, roleLabel: null },
      ],
    });
    expect(schema.parse(once)).toEqual(once);
  });

  it('takes an individual visitor without an institution, add-ons or participants', () => {
    const parsed = schema.parse({
      ...SCHOOL_BOOKING,
      visitSessionIds: [SESSION_RW05],
      bookerType: 'individual',
      institutionName: null,
      addons: [],
      participants: [],
      guardianConsent: false,
      marketingOptIn: undefined,
    });
    expect(parsed).toMatchObject({ institutionName: null, marketingOptIn: false });
  });

  it.each([
    ['price', { price: 25000 }],
    ['total', { total: 1 }],
    ['discount', { discountAmount: 1000000 }],
    ['phone', { picPhone: '+6281234567890' }],
    ['status', { status: 'paid' }],
  ])('refuses a %s key, which only the server decides', (_name, extra) => {
    expect(schema.safeParse({ ...SCHOOL_BOOKING, ...extra }).success).toBe(false);
  });

  it('refuses prices hidden inside an add-on or a participant line', () => {
    const pricedAddon = { productId: KERIPIK, qty: 1, unitPrice: 1 };
    const participantWithId = { fullName: 'Budi Santoso', nik: '3374010101010001' };
    expect(schema.safeParse({ ...SCHOOL_BOOKING, addons: [pricedAddon] }).success).toBe(false);
    expect(schema.safeParse({ ...SCHOOL_BOOKING, participants: [participantWithId] }).success).toBe(
      false,
    );
  });

  it('keeps pax between 1 and booking.max_pax', () => {
    expect(schema.safeParse({ ...SCHOOL_BOOKING, pax: MAX_PAX }).success).toBe(true);
    expect(fieldErrorsOf({ ...SCHOOL_BOOKING, pax: MAX_PAX + 1 }).pax).toEqual([
      messages.pax(MAX_PAX),
    ]);
    expect(fieldErrorsOf({ ...SCHOOL_BOOKING, pax: 0 }).pax).toEqual([messages.pax(MAX_PAX)]);
    expect(fieldErrorsOf({ ...SCHOOL_BOOKING, pax: 2.5 }).pax).toEqual([messages.pax(MAX_PAX)]);
    expect(createBookingSchema(20).safeParse(SCHOOL_BOOKING).success).toBe(false);
  });

  it('wants one session per RW visited, at most one per leg a package may have, never the same one twice', () => {
    const fourLegs = [SESSION_RW05, SESSION_RW08, KERIPIK, KOMPOS];
    expect(fourLegs).toHaveLength(MAX_PACKAGE_LEGS);
    expect(schema.safeParse({ ...SCHOOL_BOOKING, visitSessionIds: fourLegs }).success).toBe(true);
    const tooMany = [...fourLegs, PACKAGE_ID];
    expect(fieldErrorsOf({ ...SCHOOL_BOOKING, visitSessionIds: [] }).visitSessionIds).toEqual([
      messages.sessions,
    ]);
    expect(fieldErrorsOf({ ...SCHOOL_BOOKING, visitSessionIds: tooMany }).visitSessionIds).toEqual([
      messages.sessions,
    ]);
    expect(
      fieldErrorsOf({ ...SCHOOL_BOOKING, visitSessionIds: [SESSION_RW05, SESSION_RW05] })
        .visitSessionIds,
    ).toEqual([messages.sessions]);
  });

  it.each(['2026-02-30', '2026-13-01', '12-11-2026', '2026-11-12T08:00'])(
    'refuses %s as a visit date',
    (visitDate) => {
      expect(fieldErrorsOf({ ...SCHOOL_BOOKING, visitDate }).visitDate).toEqual([
        messages.visitDate,
      ]);
    },
  );

  it('asks a school for its name, but not an individual', () => {
    expect(fieldErrorsOf({ ...SCHOOL_BOOKING, institutionName: '  ' }).institutionName).toEqual([
      messages.institutionName,
    ]);
  });

  it('keeps links and phone numbers out of the names and notes that reach messages', () => {
    const errors = fieldErrorsOf({
      ...SCHOOL_BOOKING,
      picName: 'Ani wa.me/6281234567890',
      institutionName: 'bayar di gisik-bayar.top',
      notes: 'hubungi 0812-3456-7890',
    });
    expect(errors.picName).toEqual([copy.validation.freeText]);
    expect(errors.institutionName).toEqual([copy.validation.freeText]);
    expect(errors.notes).toEqual([copy.validation.freeText]);
  });

  it('holds the lengths the database holds', () => {
    const longest = 'a'.repeat(BOOKING_LIMITS.institutionName);
    expect(schema.safeParse({ ...SCHOOL_BOOKING, institutionName: longest }).success).toBe(true);
    expect(
      fieldErrorsOf({ ...SCHOOL_BOOKING, institutionName: `${longest}a` }).institutionName,
    ).toEqual([messages.tooLong(BOOKING_LIMITS.institutionName)]);
    expect(fieldErrorsOf({ ...SCHOOL_BOOKING, picName: '' }).picName).toEqual([messages.picName]);
  });

  it('caps the add-on list at 20 distinct products with sensible quantities', () => {
    const lines = Array.from({ length: BOOKING_LIMITS.addonLines + 1 }, (_line, index) => ({
      productId: `0192f3a4-5b6c-7d8e-9f01-${String(index).padStart(12, '0')}`,
      qty: 1,
    }));
    expect(schema.safeParse({ ...SCHOOL_BOOKING, addons: lines.slice(0, -1) }).success).toBe(true);
    expect(fieldErrorsOf({ ...SCHOOL_BOOKING, addons: lines }).addons).toEqual([
      messages.addonLines(BOOKING_LIMITS.addonLines),
    ]);
    const twice = [
      { productId: KERIPIK, qty: 1 },
      { productId: KERIPIK, qty: 2 },
    ];
    expect(fieldErrorsOf({ ...SCHOOL_BOOKING, addons: twice }).addons).toEqual([
      messages.addonRepeated,
    ]);
    expect(
      schema.safeParse({ ...SCHOOL_BOOKING, addons: [{ productId: KOMPOS, qty: 0 }] }).success,
    ).toBe(false);
  });

  it('caps the participant list at 300 names and at the number of visitors', () => {
    const names = Array.from({ length: BOOKING_LIMITS.participants + 1 }, (_row, index) => ({
      fullName: `Peserta ${String(index)}`,
    }));
    const pax = MAX_PAX;
    expect(
      schema.safeParse({ ...SCHOOL_BOOKING, pax, participants: names.slice(0, -1) }).success,
    ).toBe(true);
    expect(fieldErrorsOf({ ...SCHOOL_BOOKING, pax, participants: names }).participants).toEqual([
      messages.participants(BOOKING_LIMITS.participants),
    ]);
    expect(fieldErrorsOf({ ...SCHOOL_BOOKING, pax: 1 }).participants).toEqual([
      messages.participantsOverPax,
    ]);
  });

  it('wants participant names of 2 to 120 characters', () => {
    const named = (fullName: string) => ({ ...SCHOOL_BOOKING, participants: [{ fullName }] });
    expect(schema.safeParse(named('Al')).success).toBe(true);
    expect(schema.safeParse(named('A')).success).toBe(false);
    expect(schema.safeParse(named('a'.repeat(121))).success).toBe(false);
  });

  it("needs the guardian's consent once participants are listed", () => {
    expect(fieldErrorsOf({ ...SCHOOL_BOOKING, guardianConsent: false }).guardianConsent).toEqual([
      messages.guardianConsent,
    ]);
    expect(
      schema.safeParse({ ...SCHOOL_BOOKING, participants: [], guardianConsent: false }).success,
    ).toBe(true);
  });

  it('refuses a consent version that is not a short identifier', () => {
    expect(schema.safeParse({ ...SCHOOL_BOOKING, consentVersion: '' }).success).toBe(false);
    expect(schema.safeParse({ ...SCHOOL_BOOKING, consentVersion: '<v1>' }).success).toBe(false);
    expect(schema.safeParse({ ...SCHOOL_BOOKING, consentVersion: 'v'.repeat(33) }).success).toBe(
      false,
    );
  });
});

describe('picPhoneSchema', () => {
  it.each([
    ['081234567890', '+6281234567890'],
    ['6281234567890', '+6281234567890'],
    ['+62 812-3456-7890', '+6281234567890'],
    ['+6281234567890', '+6281234567890'],
  ])('reads %s as %s', (input, expected) => {
    expect(picPhoneSchema.parse(input)).toBe(expected);
  });

  it.each(['024 7612345', '+62 24 7612345', '+60 12 345 6789', '+1 415 555 0100', '0812', ''])(
    'refuses %s with the note for groups from abroad',
    (input) => {
      const parsed = picPhoneSchema.safeParse(input);
      expect(parsed.error?.issues[0]?.message).toBe(messages.phone);
    },
  );
});
