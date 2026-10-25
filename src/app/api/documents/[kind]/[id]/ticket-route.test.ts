import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireDocumentReader } from '@/server/auth/document-access';
import {
  readTicketDocument,
  ticketDocumentFile,
  withinDocumentLimits,
} from '@/server/services/document-service';
import type { TicketDocument } from '@/server/services/ticket-documents';

import { GET } from './route';

vi.mock('@/lib/queries/booklets', () => ({ getBookletDownload: vi.fn() }));
vi.mock('@/server/auth/document-access', () => ({ requireDocumentReader: vi.fn() }));
vi.mock('@/server/services/document-service', () => ({
  countBookletDownload: vi.fn(),
  withinBookletDownloadLimit: vi.fn(),
  withinDocumentLimits: vi.fn(),
  readBookingDocument: vi.fn(),
  bookingDocumentFile: vi.fn(),
  readTicketDocument: vi.fn(),
  ticketDocumentFile: vi.fn(),
}));

const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const PDF = Buffer.from('%PDF-1.7 ticket');
const TICKETS: TicketDocument = {
  bookingId: BOOKING_ID,
  bookingCode: 'GSK-7F3K9Q2M',
  fileName: 'ticket-GSK-7F3K9Q2M.pdf',
  pdfPath: null,
  tickets: [],
};
const NOT_FOUND = { ok: false as const, error: { code: 'NOT_FOUND' as const, message: 'x' } };

function fetchTicket(id = BOOKING_ID) {
  const request = new Request(`http://localhost/api/documents/ticket/${id}`, {
    headers: { 'x-real-ip': '203.0.113.7' },
  });
  return GET(request, { params: Promise.resolve({ kind: 'ticket', id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(withinDocumentLimits).mockResolvedValue(true);
  vi.mocked(readTicketDocument).mockResolvedValue(TICKETS);
  vi.mocked(requireDocumentReader).mockResolvedValue({ ok: true, reader: 'guest' });
  vi.mocked(ticketDocumentFile).mockResolvedValue(PDF);
});

describe('GET /api/documents/ticket/[bookingId]', () => {
  it('streams the e-ticket inline to the booking guest, uncached, under its own name', async () => {
    const response = await fetchTicket();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe(
      'inline; filename="ticket-GSK-7F3K9Q2M.pdf"',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(requireDocumentReader).toHaveBeenCalledWith(
      'v_bookings_staff',
      BOOKING_ID,
      'GSK-7F3K9Q2M',
    );
    expect(ticketDocumentFile).toHaveBeenCalledWith(TICKETS, null);
  });

  it('names the staff reader the file is kept under', async () => {
    vi.mocked(requireDocumentReader).mockResolvedValue({
      ok: true,
      reader: 'staff',
      userId: 'u-1',
    });
    await fetchTicket();
    expect(ticketDocumentFile).toHaveBeenCalledWith(TICKETS, 'u-1');
  });

  it('answers the same 404 to a reader without the link, a booking without tickets and a booking past its limit', async () => {
    vi.mocked(requireDocumentReader).mockResolvedValueOnce(NOT_FOUND);
    expect((await fetchTicket()).status).toBe(404);
    vi.mocked(readTicketDocument).mockResolvedValueOnce(null);
    expect((await fetchTicket()).status).toBe(404);
    vi.mocked(withinDocumentLimits).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await fetchTicket()).status).toBe(404);
    expect(ticketDocumentFile).not.toHaveBeenCalled();
  });

  it('answers 429 past the per-IP limit before anything is looked up', async () => {
    vi.mocked(withinDocumentLimits).mockResolvedValueOnce(false);
    expect((await fetchTicket()).status).toBe(429);
    expect(readTicketDocument).not.toHaveBeenCalled();
  });
});
