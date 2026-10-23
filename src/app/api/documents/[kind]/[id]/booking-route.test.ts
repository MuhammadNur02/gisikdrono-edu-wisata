import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireDocumentReader } from '@/server/auth/document-access';
import type { BookingDocument } from '@/server/services/booking-documents';
import {
  bookingDocumentFile,
  readBookingDocument,
  withinDocumentLimits,
} from '@/server/services/document-service';

import { GET } from './route';
import { schoolSnapshot } from '../../../../../../tests/fixtures/document-snapshot';

vi.mock('@/lib/queries/booklets', () => ({ getBookletDownload: vi.fn() }));
vi.mock('@/server/auth/document-access', () => ({ requireDocumentReader: vi.fn() }));
vi.mock('@/server/services/document-service', () => ({
  countBookletDownload: vi.fn(),
  withinBookletDownloadLimit: vi.fn(),
  withinDocumentLimits: vi.fn(),
  readBookingDocument: vi.fn(),
  bookingDocumentFile: vi.fn(),
}));

const QUOTATION_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000cc';
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const PDF = Buffer.from('%PDF-1.7 quotation');
const QUOTATION: BookingDocument = {
  kind: 'quotation',
  id: QUOTATION_ID,
  bookingId: BOOKING_ID,
  bookingCode: 'GSK-7F3K9Q2M',
  snapshot: schoolSnapshot,
  number: 'SP/GSK/2026/10/0007',
  verifyCode: '7F3K9Q2M4A',
  version: 1,
  issuedAt: '2026-10-23T02:00:00+00:00',
  status: 'issued',
  pdfPath: null,
};
const NOT_FOUND = { ok: false as const, error: { code: 'NOT_FOUND' as const, message: 'x' } };

function fetchDocument(kind: string, id: string) {
  const request = new Request(`http://localhost/api/documents/${kind}/${id}`, {
    headers: { 'x-real-ip': '203.0.113.7' },
  });
  return GET(request, { params: Promise.resolve({ kind, id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(withinDocumentLimits).mockResolvedValue(true);
  vi.mocked(readBookingDocument).mockResolvedValue(QUOTATION);
  vi.mocked(requireDocumentReader).mockResolvedValue({ ok: true, reader: 'guest' });
  vi.mocked(bookingDocumentFile).mockResolvedValue(PDF);
});

describe('GET /api/documents/quotation/[id]', () => {
  it('streams the PDF inline to an authorised reader, uncached, under its own file name', async () => {
    const response = await fetchDocument('quotation', QUOTATION_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe(
      'inline; filename="quotation-SP-GSK-2026-10-0007.pdf"',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PDF);
    expect(requireDocumentReader).toHaveBeenCalledWith('quotations', QUOTATION_ID, 'GSK-7F3K9Q2M');
  });

  it('counts the IP before the row is looked up, and the booking once it is known', async () => {
    await fetchDocument('quotation', QUOTATION_ID);
    expect(vi.mocked(withinDocumentLimits).mock.calls).toEqual([
      ['203.0.113.7', null],
      ['203.0.113.7', BOOKING_ID],
    ]);
  });

  it('answers 429 past the per-IP limit without looking anything up', async () => {
    vi.mocked(withinDocumentLimits).mockResolvedValue(false);
    const response = await fetchDocument('invoice', QUOTATION_ID);
    expect(response.status).toBe(429);
    expect(readBookingDocument).not.toHaveBeenCalled();
  });

  it.each([
    ['a row that does not exist', () => vi.mocked(readBookingDocument).mockResolvedValue(null)],
    [
      'a reader without the right',
      () => vi.mocked(requireDocumentReader).mockResolvedValue(NOT_FOUND),
    ],
  ])('answers the same 404 for %s and renders nothing', async (_case, arrange) => {
    arrange();
    const response = await fetchDocument('quotation', QUOTATION_ID);
    expect(response.status).toBe(404);
    expect(bookingDocumentFile).not.toHaveBeenCalled();
  });

  it('answers 404 for a kind it does not serve', async () => {
    const response = await fetchDocument('certificate', QUOTATION_ID);
    expect(response.status).toBe(404);
    expect(withinDocumentLimits).not.toHaveBeenCalled();
  });

  it('answers 503 when the renderer fails', async () => {
    vi.mocked(bookingDocumentFile).mockRejectedValue(new Error('font missing'));
    const response = await fetchDocument('receipt', QUOTATION_ID);
    expect(response.status).toBe(503);
  });
});
