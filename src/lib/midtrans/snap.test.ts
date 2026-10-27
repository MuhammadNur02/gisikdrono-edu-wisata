import { describe, expect, it } from 'vitest';

import { buildSnapPayload, type SnapBooking } from '@/lib/midtrans/snap';

const NOW = new Date('2026-10-24T02:30:00Z');
const BOOKING: SnapBooking = {
  bookingId: '0192f3a4-5b6c-7d8e-9f01-0000000000bb',
  bookingCode: 'GSK-7F3K9Q2M',
  orderId: 'GSK-7F3K9Q2M-01',
  totalAmount: 900000,
  packageName: 'Eduwisata Ecowastreme',
  packageQuantity: 20,
  packageUnitPrice: 30000,
  subtotalPackage: 600000,
  discountAmount: 0,
  picName: 'Ani Wulandari',
  picEmail: 'ani@sekolah.sch.id',
  picPhone: '+6281234567890',
  expiresAt: '2026-10-25T02:30:00Z',
};
const ADDON = {
  productId: '0192f3a4-5b6c-7d8e-9f01-0000000000a1',
  name: 'Kompos Uji',
  unitPrice: 15000,
  qty: 20,
  lineTotal: 300000,
};
const CONTEXT = { siteUrl: 'https://eduwisata.example.test', now: NOW };

describe('buildSnapPayload', () => {
  it('builds the whole request from the booking rows, and nothing else (Task P3.7.02)', () => {
    expect(buildSnapPayload(BOOKING, [ADDON], CONTEXT)).toEqual({
      transaction_details: { order_id: 'GSK-7F3K9Q2M-01', gross_amount: 900000 },
      item_details: [
        { id: 'package', name: 'Eduwisata Ecowastreme', price: 30000, quantity: 20 },
        { id: ADDON.productId, name: 'Kompos Uji', price: 15000, quantity: 20 },
      ],
      customer_details: {
        first_name: 'Ani Wulandari',
        email: 'ani@sekolah.sch.id',
        phone: '+6281234567890',
      },
      enabled_payments: ['qris', 'bca_va', 'bni_va', 'bri_va', 'permata_va', 'cimb_va', 'other_va'],
      expiry: { start_time: '2026-10-24 09:30:00 +0700', unit: 'minute', duration: 1440 },
      callbacks: { finish: 'https://eduwisata.example.test/reservasi/GSK-7F3K9Q2M' },
      custom_field1: BOOKING.bookingId,
    });
  });

  it('names the PIC only: no participant, address or other booker field travels (PAY-07)', () => {
    const payload = buildSnapPayload(BOOKING, [ADDON], CONTEXT);
    expect(Object.keys(payload.customer_details)).toEqual(['first_name', 'email', 'phone']);
    expect(JSON.stringify(payload)).not.toMatch(/participant|address|billing|shipping/);
  });

  it('closes the page when the hold does, in whole minutes', () => {
    const shortHold = { ...BOOKING, expiresAt: '2026-10-24T03:00:59Z' };
    expect(buildSnapPayload(shortHold, [ADDON], CONTEXT).expiry.duration).toBe(30);
    const ended = { ...BOOKING, expiresAt: '2026-10-24T02:30:30Z' };
    expect(() => buildSnapPayload(ended, [ADDON], CONTEXT)).toThrow(RangeError);
  });

  it('keeps one page at most 24 hours, however long an officer hold runs (A23 addendum)', () => {
    const longHold = { ...BOOKING, expiresAt: '2026-11-07T16:59:00Z' };
    expect(buildSnapPayload(longHold, [ADDON], CONTEXT).expiry.duration).toBe(1440);
  });

  it('sells a flat-priced group as one unit, and takes a discount off as its own line', () => {
    const flat = {
      ...BOOKING,
      packageQuantity: 1,
      packageUnitPrice: 750000,
      subtotalPackage: 750000,
      discountAmount: 50000,
      totalAmount: 700000,
    };
    expect(buildSnapPayload(flat, [], CONTEXT).item_details).toEqual([
      { id: 'package', name: 'Eduwisata Ecowastreme', price: 750000, quantity: 1 },
      { id: 'discount', name: 'Potongan harga', price: -50000, quantity: 1 },
    ]);
  });

  it('falls back to one package line when a tier priced the group differently', () => {
    const tiered = { ...BOOKING, packageUnitPrice: 28000, totalAmount: 600000 };
    expect(buildSnapPayload(tiered, [], CONTEXT).item_details).toEqual([
      { id: 'package', name: 'Eduwisata Ecowastreme', price: 600000, quantity: 1 },
    ]);
  });

  it('keeps names within Snap’s 50 characters, never splitting a character', () => {
    const longName = `${'Paket kunjungan edukasi sampah '.repeat(3)}🌱`;
    const [packageLine] = buildSnapPayload(
      { ...BOOKING, packageName: longName, picName: `${longName}${longName}` },
      [ADDON],
      CONTEXT,
    ).item_details;
    expect(Array.from(packageLine?.name ?? '')).toHaveLength(50);
  });

  it('stops at lines that do not add up to the total rather than sending them', () => {
    expect(() => buildSnapPayload({ ...BOOKING, totalAmount: 900001 }, [ADDON], CONTEXT)).toThrow(
      /add up/,
    );
  });
});
