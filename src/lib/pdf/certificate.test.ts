import { describe, expect, it } from 'vitest';

import {
  certificateVerifyUrl,
  renderCertificatePdf,
  type CertificatePageInput,
} from '@/lib/pdf/certificate';
import { splitPdfPages } from '@/lib/pdf/split-pages';

import { pdfText } from '../../../tests/fixtures/pdf-text';

const SLOW_MS = 30_000;
const SITE = 'https://eduwisata.example.test';

const page = (overrides: Partial<CertificatePageInput>): CertificatePageInput => ({
  kind: 'group',
  certificateNumber: 'SERT/GSK/2026/00031',
  recipientName: 'SD Negeri Gisikdrono 01',
  groupLabel: null,
  institutionName: 'SD Negeri Gisikdrono 01',
  visitDate: '2026-11-06',
  rwNames: ['RW 05 Ecowastreme', 'RW 13 Kampung Budaya & Seni'],
  verifyUrl: certificateVerifyUrl(SITE, '7F3K9Q2M4A'),
  ...overrides,
});

const INPUT = {
  signatoryName: 'Budi Santoso, S.Sos.',
  signatoryTitle: 'Lurah Gisikdrono',
  pages: [
    page({}),
    page({
      kind: 'participant',
      certificateNumber: 'SERT/GSK/2026/00032',
      recipientName: 'Ani Murid',
      groupLabel: 'Kelas 5A',
      verifyUrl: certificateVerifyUrl(SITE, '8G4M1R3N5B'),
    }),
  ],
};

describe('the e-certificate', () => {
  it(
    'prints one landscape page per certificate with its number, recipient, class, RWs, date, signatory and verify URL',
    async () => {
      const pdf = await renderCertificatePdf(INPUT);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      const { pageCount, text } = await pdfText(pdf);
      expect(pageCount).toBe(2);
      for (const expected of [
        'Nomor: SERT/GSK/2026/00031',
        'Nomor: SERT/GSK/2026/00032',
        'Diberikan kepada',
        'Ani Murid',
        'Kelas 5A · SD Negeri Gisikdrono 01',
        'ke RW 05 Ecowastreme dan RW 13 Kampung Budaya & Seni, Kelurahan Gisikdrono',
        'Jumat, 6 November 2026',
        'Semarang, 6 November 2026',
        'Lurah Gisikdrono',
        'Budi Santoso, S.Sos.',
        'https://eduwisata.example.test/verifikasi/7F3K9Q2M4A',
        'https://eduwisata.example.test/verifikasi/8G4M1R3N5B',
      ]) {
        expect(text).toContain(expected);
      }
    },
    SLOW_MS,
  );

  it(
    'splits the participants’ document into one file per page, each with only its own certificate',
    async () => {
      const pages = await splitPdfPages(await renderCertificatePdf(INPUT), [
        'Sertifikat SERT/GSK/2026/00031',
        'Sertifikat SERT/GSK/2026/00032',
      ]);
      expect(pages).toHaveLength(2);
      const [first, second] = await Promise.all(pages.map((file) => pdfText(file)));
      expect(first?.pageCount).toBe(1);
      expect(first?.text).toContain('SERT/GSK/2026/00031');
      expect(first?.text).not.toContain('Ani Murid');
      expect(second?.pageCount).toBe(1);
      expect(second?.text).toContain('Ani Murid');
    },
    SLOW_MS,
  );

  it('builds the verify URL from the site and the code only', () => {
    expect(certificateVerifyUrl(SITE, '7F3K9Q2M4A')).toBe(`${SITE}/verifikasi/7F3K9Q2M4A`);
  });
});
