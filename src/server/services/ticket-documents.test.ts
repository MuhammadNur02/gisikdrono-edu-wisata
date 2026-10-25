import { beforeEach, describe, expect, it, vi } from 'vitest';

import { svcRecordDocumentPdf } from '@/db/rpc-documents';
import type { DatabaseClient } from '@/db/rpc-result';
import { renderTicketPdf } from '@/lib/pdf/ticket';
import {
  isKeepable,
  keptTicketPdfPath,
  ticketDocumentPdf,
  type TicketDocument,
} from '@/server/services/ticket-documents';
import { getTicketsForBooking } from '@/server/services/ticket-service';
import type { GuestTicket } from '@/types/ticket';

vi.mock('@/db/rpc-documents', () => ({ svcRecordDocumentPdf: vi.fn() }));
vi.mock('@/lib/pdf/ticket', () => ({ renderTicketPdf: vi.fn() }));
vi.mock('@/server/services/ticket-service', () => ({ getTicketsForBooking: vi.fn() }));

const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const RENDERED = Buffer.from('%PDF-1.7 rendered');
const STORED = Buffer.from('%PDF-1.7 stored');
const PATH = `bookings/${BOOKING_ID}/ticket-GSK-7F3K9Q2M.pdf`;

const ticket = (overrides: Partial<GuestTicket> = {}): GuestTicket => ({
  ticketCode: 'GSK-7F3K9Q2M-05',
  rwName: 'RW 05 Ecowastreme',
  validOn: '2026-11-12',
  startTime: '09:05:00',
  endTime: '10:05:00',
  paxCount: 20,
  status: 'issued',
  qr: { size: 25, path: 'M0 0h1v1h-1z' },
  ...overrides,
});

const documentWith = (overrides: Partial<TicketDocument> = {}): TicketDocument => ({
  bookingId: BOOKING_ID,
  bookingCode: 'GSK-7F3K9Q2M',
  fileName: 'ticket-GSK-7F3K9Q2M.pdf',
  pdfPath: null,
  tickets: [ticket()],
  ...overrides,
});

// A service-role client whose storage keeps what is uploaded, and whose bookings row is the one given.
function fakeClient(row: { ticket_pdf_path: string | null } | null) {
  const upload = vi.fn(() => Promise.resolve({ data: { path: PATH }, error: null }));
  const download = vi.fn(() =>
    Promise.resolve({ data: new Blob([new Uint8Array(STORED)]), error: null }),
  );
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: () =>
      Promise.resolve({
        data: row && { id: BOOKING_ID, booking_code: 'GSK-7F3K9Q2M', ...row },
        error: null,
      }),
  };
  const client = {
    from: () => query,
    storage: { from: () => ({ upload, download }) },
  } as unknown as DatabaseClient;
  return { client, upload, download };
}

beforeEach(() => {
  vi.mocked(renderTicketPdf).mockReset().mockResolvedValue(RENDERED);
  vi.mocked(svcRecordDocumentPdf).mockReset().mockResolvedValue(undefined);
  vi.mocked(getTicketsForBooking).mockReset().mockResolvedValue([ticket()]);
});

describe('isKeepable', () => {
  it('keeps a file only while every ticket in it may be scanned and has its QR', () => {
    expect(isKeepable(documentWith())).toBe(true);
    expect(isKeepable(documentWith({ tickets: [ticket(), ticket({ status: 'used' })] }))).toBe(
      true,
    );
    expect(isKeepable(documentWith({ tickets: [ticket({ status: 'suspended' })] }))).toBe(false);
    expect(isKeepable(documentWith({ tickets: [ticket({ qr: null })] }))).toBe(false);
  });
});

describe('ticketDocumentPdf', () => {
  const context = { kelurahanAddress: null, readerId: null };

  it('renders a ticket file on first need, keeps it and records its path', async () => {
    const { client, upload } = fakeClient(null);
    await expect(ticketDocumentPdf(client, documentWith(), context)).resolves.toBe(RENDERED);
    expect(upload).toHaveBeenCalledWith(PATH, RENDERED, {
      contentType: 'application/pdf',
      upsert: true,
    });
    expect(svcRecordDocumentPdf).toHaveBeenCalledWith(client, {
      kind: 'ticket',
      documentId: BOOKING_ID,
      path: PATH,
      readerId: null,
    });
  });

  it('serves the kept file after that', async () => {
    const { client, upload } = fakeClient(null);
    const pdf = await ticketDocumentPdf(client, documentWith({ pdfPath: PATH }), context);
    expect(pdf.equals(STORED)).toBe(true);
    expect(renderTicketPdf).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('renders a file with a ticket no longer valid as it stands, and keeps nothing', async () => {
    const { client, upload } = fakeClient(null);
    const suspended = documentWith({ pdfPath: PATH, tickets: [ticket({ status: 'suspended' })] });
    await expect(ticketDocumentPdf(client, suspended, context)).resolves.toBe(RENDERED);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('keptTicketPdfPath', () => {
  it('names the recorded file without rendering it again', async () => {
    const { client } = fakeClient({ ticket_pdf_path: PATH });
    await expect(keptTicketPdfPath(client, BOOKING_ID, null)).resolves.toBe(PATH);
    expect(renderTicketPdf).not.toHaveBeenCalled();
  });

  it('renders and keeps the file when none is recorded yet', async () => {
    const { client } = fakeClient({ ticket_pdf_path: null });
    await expect(keptTicketPdfPath(client, BOOKING_ID, null)).resolves.toBe(PATH);
    expect(svcRecordDocumentPdf).toHaveBeenCalledTimes(1);
  });

  it('gives no file for a booking without tickets, or with one no longer valid', async () => {
    vi.mocked(getTicketsForBooking).mockResolvedValueOnce([]);
    await expect(
      keptTicketPdfPath(fakeClient({ ticket_pdf_path: null }).client, BOOKING_ID, null),
    ).resolves.toBeNull();
    vi.mocked(getTicketsForBooking).mockResolvedValueOnce([
      ticket({ status: 'revoked', qr: null }),
    ]);
    await expect(
      keptTicketPdfPath(fakeClient({ ticket_pdf_path: PATH }).client, BOOKING_ID, null),
    ).resolves.toBeNull();
  });
});
