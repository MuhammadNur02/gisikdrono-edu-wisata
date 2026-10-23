import { describe, expect, it } from 'vitest';

import { copy } from '@/lib/copy/id';
import { quotationStampLabel, quotationVerifyUrl, renderQuotationPdf } from '@/lib/pdf/quotation';

import { schoolSnapshot } from '../../../tests/fixtures/document-snapshot';
import { pdfText } from '../../../tests/fixtures/pdf-text';

const SLOW_MS = 30_000;
const INPUT = {
  snapshot: schoolSnapshot,
  quotationNumber: 'SP/GSK/2026/10/0007',
  verifyCode: '7F3K9Q2M4A',
  version: 1,
  issuedAt: '2026-10-23T02:00:00+00:00',
  status: 'issued' as const,
  kelurahanAddress: 'Jl. Contoh No. 1, Semarang Barat',
  siteUrl: 'https://eduwisata.example.test',
};

describe('the Surat Penawaran', () => {
  it(
    'prints the number, the school, the lines, the validity, the fixed payment line and the verify URL',
    async () => {
      const pdf = await renderQuotationPdf(INPUT);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      const { pageCount, text } = await pdfText(pdf);
      expect(pageCount).toBe(1);
      for (const expected of [
        'Surat Penawaran',
        'SP/GSK/2026/10/0007',
        'SD Negeri Gisikdrono 01',
        'Eduwisata Ecowastreme',
        'Kompos Uji',
        'Rp 900.000',
        'Jumat, 6 November 2026',
        copy.documents.paymentNotice,
        'https://eduwisata.example.test/verifikasi/7F3K9Q2M4A',
        'Lurah Gisikdrono',
        'Budi Santoso, S.Sos.',
      ]) {
        expect(text).toContain(expected);
      }
    },
    SLOW_MS,
  );

  it(
    'stamps a quotation that no longer stands as issued',
    async () => {
      const { text } = await pdfText(await renderQuotationPdf({ ...INPUT, status: 'superseded' }));
      expect(text).toContain('DIGANTI VERSI BARU');
      expect(quotationStampLabel('issued')).toBeNull();
      expect(quotationStampLabel('void')).toBe('DIBATALKAN');
    },
    SLOW_MS,
  );

  it('builds the verify URL from the site and the code only', () => {
    expect(quotationVerifyUrl('https://eduwisata.example.test', '7F3K9Q2M4A')).toBe(
      'https://eduwisata.example.test/verifikasi/7F3K9Q2M4A',
    );
  });
});
