import { describe, expect, it } from 'vitest';

import { copy } from '@/lib/copy/id';
import { invoiceStampLabel, paymentMethodLabel, renderInvoicePdf } from '@/lib/pdf/invoice';
import { renderReceiptPdf } from '@/lib/pdf/receipt';

import { schoolSnapshot } from '../../../tests/fixtures/document-snapshot';
import { pdfText } from '../../../tests/fixtures/pdf-text';

const SLOW_MS = 30_000;
const PAID = {
  ...schoolSnapshot,
  valid_until: null,
  due_date: '2026-10-24',
  payment: {
    method: 'virtual_account',
    va_bank: 'bca',
    order_id: 'GSK-7F3K9Q2M-01',
    paid_at: '2026-10-23T03:15:00+00:00',
    amount_paid: 900000,
  },
};
const INVOICE = {
  snapshot: PAID,
  invoiceNumber: 'INV/GSK/2026/10/0012',
  status: 'paid' as const,
  issuedAt: '2026-10-23T03:15:00+00:00',
  kelurahanAddress: 'Jl. Contoh No. 1, Semarang Barat',
  kind: 'invoice' as const,
};

describe('the invoice', () => {
  it(
    'prints the number, the bill-to, the lines, how it was paid, LUNAS and the fixed payment line',
    async () => {
      const { pageCount, text } = await pdfText(await renderInvoicePdf(INVOICE));
      expect(pageCount).toBe(1);
      for (const expected of [
        'Invoice',
        'INV/GSK/2026/10/0012',
        'SD Negeri Gisikdrono 01',
        'Kompos Uji',
        'Rp 900.000',
        'LUNAS',
        'Virtual Account',
        'GSK-7F3K9Q2M-01',
        copy.documents.paymentNotice,
      ]) {
        expect(text).toContain(expected);
      }
    },
    SLOW_MS,
  );

  it(
    'tells an unpaid invoice how to pay, through the system only, with no stamp',
    async () => {
      const unpaid = {
        ...INVOICE,
        status: 'issued' as const,
        snapshot: { ...PAID, payment: null },
      };
      const { text } = await pdfText(await renderInvoicePdf(unpaid));
      expect(text).toContain('Cara pembayaran');
      expect(text).not.toContain('LUNAS');
      expect(invoiceStampLabel(unpaid)).toBeNull();
      expect(invoiceStampLabel({ ...unpaid, status: 'void' })).toBe('BATAL');
    },
    SLOW_MS,
  );

  it(
    'prints the credit note of a refunded invoice',
    async () => {
      const refunded = {
        ...INVOICE,
        status: 'void' as const,
        kind: 'credit_note' as const,
        snapshot: {
          ...PAID,
          credit_note: {
            number: 'CN/GSK/2026/0003',
            issued_at: '2026-10-25T01:00:00+00:00',
            amount: 810000,
          },
        },
      };
      const { text } = await pdfText(await renderInvoicePdf(refunded));
      expect(text).toContain('Nota Kredit');
      expect(text).toContain('CN/GSK/2026/0003');
      expect(text).toContain('Rp 810.000');
      expect(text).toContain('Pengembalian atas invoice INV/GSK/2026/10/0012');
      expect(text).not.toContain('BATAL');
    },
    SLOW_MS,
  );

  it('names a payment method in Indonesian and leaves an unknown one as it is', () => {
    expect(paymentMethodLabel('qris')).toBe('QRIS');
    expect(paymentMethodLabel('cash')).toBe('tunai (dicatat petugas)');
    expect(paymentMethodLabel('gopay')).toBe('gopay');
    expect(paymentMethodLabel(null)).toBeNull();
  });
});

describe('the kwitansi', () => {
  it(
    'prints the receipt number, the payer, the sum, the invoice it settles and LUNAS',
    async () => {
      const { pageCount, text } = await pdfText(
        await renderReceiptPdf({
          snapshot: PAID,
          receiptNumber: 'KW/GSK/2026/10/0012',
          invoiceNumber: 'INV/GSK/2026/10/0012',
          kelurahanAddress: null,
        }),
      );
      expect(pageCount).toBe(1);
      for (const expected of [
        'Kwitansi',
        'KW/GSK/2026/10/0012',
        'SD Negeri Gisikdrono 01',
        'Rp 900.000',
        'Untuk pembayaran invoice INV/GSK/2026/10/0012',
        'LUNAS',
      ]) {
        expect(text).toContain(expected);
      }
    },
    SLOW_MS,
  );
});
