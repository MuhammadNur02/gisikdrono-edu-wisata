import { describe, expect, it } from 'vitest';

import { copy } from '@/lib/copy/id';
import { renderTicketPdf } from '@/lib/pdf/ticket';
import { qrSvgPath } from '@/lib/utils/qr-path';
import type { GuestTicket } from '@/types/ticket';

import { pdfText } from '../../../tests/fixtures/pdf-text';

const SLOW_MS = 30_000;

const ticket = (overrides: Partial<GuestTicket>): GuestTicket => ({
  ticketCode: 'GSK-7F3K9Q2M-05',
  rwName: 'RW 05 Ecowastreme',
  validOn: '2026-11-12',
  startTime: '09:05:00',
  endTime: '10:05:00',
  paxCount: 20,
  status: 'issued',
  qr: qrSvgPath('https://eduwisata.example.test/v/GSK.k1.abc.def'),
  ...overrides,
});

describe('the e-ticket', () => {
  it(
    'prints one page per RW with its code, day, session, group size, QR caption and rules, and no QR for a ticket no longer valid',
    async () => {
      const pdf = await renderTicketPdf({
        bookingCode: 'GSK-7F3K9Q2M',
        kelurahanAddress: 'Jl. Contoh No. 1, Semarang Barat',
        tickets: [
          ticket({}),
          ticket({
            ticketCode: 'GSK-7F3K9Q2M-13',
            rwName: 'RW 13 Kampung Budaya & Seni',
            status: 'suspended',
            qr: null,
          }),
        ],
      });
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      const { pageCount, text } = await pdfText(pdf);
      expect(pageCount).toBe(2);
      for (const expected of [
        copy.documents.ticket.title,
        'GSK-7F3K9Q2M-05',
        'GSK-7F3K9Q2M-13',
        'RW 05 Ecowastreme',
        'Kamis, 12 November 2026',
        '09.05–10.05 WIB',
        '20 orang',
        copy.documents.ticket.showAtGate,
        copy.documents.ticket.notValid,
        copy.documents.ticket.rules[0],
      ]) {
        expect(text).toContain(expected);
      }
    },
    SLOW_MS,
  );
});
