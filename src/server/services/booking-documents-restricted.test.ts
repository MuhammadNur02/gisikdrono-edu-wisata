import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';

import { copy } from '@/lib/copy/id';
import { formatIDR } from '@/lib/utils/currency';
import type { BookingDocument } from '@/server/services/booking-documents';
import {
  restrictedDocumentPdf,
  restrictedFileName,
  restrictedInputOf,
} from '@/server/services/booking-documents-restricted';

import { schoolSnapshot } from '../../../tests/fixtures/document-snapshot';
import { pdfText } from '../../../tests/fixtures/pdf-text';

const SLOW_MS = 30_000;

// A combo-like snapshot with a discount, so every kind of money a document carries is present to be left out.
const snapshot = {
  ...schoolSnapshot,
  rw_names: ['RW 05 Ecowastreme', 'RW 13 Kampung Budaya & Seni'],
  discount_amount: 125_000,
  total_amount: 775_000,
};

const QUOTATION: BookingDocument = {
  kind: 'quotation',
  id: '0192f3a4-5b6c-7d8e-9f01-0000000000cc',
  bookingId: '0192f3a4-5b6c-7d8e-9f01-0000000000bb',
  bookingCode: 'GSK-7F3K9Q2M',
  snapshot,
  number: 'SP/GSK/2026/10/0007',
  verifyCode: '7F3K9Q2M4A',
  version: 1,
  issuedAt: '2026-10-23T02:00:00+00:00',
  status: 'issued',
  pdfPath: null,
};

// Every amount the snapshot holds, in each spelling a page could print it.
function amountSpellings(): string[] {
  const amounts = [
    ...snapshot.lines.flatMap((line) => [line.unit_price, line.line_total]),
    snapshot.subtotal_package,
    snapshot.subtotal_addons,
    snapshot.discount_amount,
    snapshot.total_amount,
  ];
  return amounts.flatMap((amount) => [
    formatIDR(amount),
    String(amount),
    amount.toLocaleString('id-ID'),
  ]);
}

// The document information dictionary, and whether an XMP metadata stream exists at all (react-pdf writes none).
async function pdfMetadata(pdf: Buffer): Promise<{ info: string; hasXmp: boolean }> {
  const loading = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true });
  const document = await loading.promise;
  const { info } = await document.getMetadata();
  await loading.destroy();
  return { info: JSON.stringify(info), hasXmp: pdf.toString('latin1').includes('/Metadata') };
}

describe('the RW admin’s restricted copy', () => {
  it(
    'prints the header and the withheld line, and no amount of the snapshot anywhere, metadata included',
    async () => {
      const pdf = await restrictedDocumentPdf(QUOTATION, 'Jl. Contoh No. 1, Semarang Barat');
      const { text } = await pdfText(pdf);
      const metadata = await pdfMetadata(pdf);
      for (const expected of [
        'SP/GSK/2026/10/0007',
        'SD Negeri Gisikdrono 01',
        'RW 05 Ecowastreme, RW 13 Kampung Budaya & Seni',
        copy.documents.restricted.mark,
        copy.documents.restricted.withheld,
      ]) {
        expect(text).toContain(expected);
      }
      expect(metadata.hasXmp).toBe(false);
      expect(metadata.info).toContain('SALINAN TERBATAS');
      for (const spelling of amountSpellings()) {
        expect(text).not.toContain(spelling);
        expect(metadata.info).not.toContain(spelling);
      }
      expect(text).not.toContain('Rp');
      expect(text).not.toContain('Kompos Uji');
      expect(text).not.toContain(copy.documents.discount);
    },
    SLOW_MS,
  );

  it('hands the page header facts only, never the snapshot', () => {
    const input = restrictedInputOf(QUOTATION, null);
    expect(Object.keys(input).sort()).toEqual(
      [
        'booker',
        'issuedAt',
        'kelurahanAddress',
        'number',
        'pax',
        'rwNames',
        'sessions',
        'stamp',
        'title',
        'visit',
      ].sort(),
    );
    expect(JSON.stringify(input)).not.toMatch(/775|900|125|600|300|30000|15000/);
  });

  it('is downloaded under a name of its own, never the kept file’s', () => {
    expect(restrictedFileName(QUOTATION)).toBe('quotation-SP-GSK-2026-10-0007-terbatas.pdf');
  });
});
