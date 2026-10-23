import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import { renderQuotationPdf } from '@/lib/pdf/quotation';
import {
  bookingDocumentPdf,
  documentFileName,
  isFinalState,
  loadBookingDocument,
  lookupVerifyCode,
  type BookingDocument,
} from '@/server/services/booking-documents';

import { schoolSnapshot } from '../../../tests/fixtures/document-snapshot';

// The renderers are proven on their own output in src/lib/pdf; here they stand in for a few bytes.
vi.mock('@/lib/pdf/quotation', () => ({ renderQuotationPdf: vi.fn() }));
vi.mock('@/lib/pdf/invoice', () => ({ renderInvoicePdf: vi.fn() }));
vi.mock('@/lib/pdf/receipt', () => ({ renderReceiptPdf: vi.fn() }));

const QUOTATION_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000cc';
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const RENDERED = Buffer.from('%PDF-1.7 rendered');
const STORED = Buffer.from('%PDF-1.7 stored');
const CONTEXT = {
  kelurahanAddress: null,
  siteUrl: 'https://eduwisata.example.test',
  readerId: null,
};

const quotationRow = {
  id: QUOTATION_ID,
  booking_id: BOOKING_ID,
  quotation_number: 'SP/GSK/2026/10/0007',
  verify_code: '7F3K9Q2M4A',
  version: 1,
  status: 'issued',
  issued_at: '2026-10-23T02:00:00+00:00',
  snapshot: schoolSnapshot,
  pdf_path: null as string | null,
  bookings: { booking_code: 'GSK-7F3K9Q2M' },
};

// A typed client whose fetch plays PostgREST and Storage: the row read, the file download and upload, the path update.
function fakeStack(options: { row?: unknown; stored?: Buffer | null } = {}) {
  const calls: { method: string; path: string }[] = [];
  const restAnswer = (method: string) =>
    method === 'GET'
      ? Response.json(options.row === undefined ? null : options.row, { status: 200 })
      : new Response(null, { status: 204 });
  const storageAnswer = (method: string) => {
    if (method !== 'GET') return Response.json({ Key: 'documents/x' }, { status: 200 });
    return options.stored
      ? new Response(new Uint8Array(options.stored), { status: 200 })
      : Response.json({ error: 'not found' }, { status: 404 });
  };
  const fakeFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? 'GET';
    calls.push({ method, path: url.pathname });
    const isRest = url.pathname.startsWith('/rest/v1/');
    return Promise.resolve(isRest ? restAnswer(method) : storageAnswer(method));
  };
  const client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  });
  return { client, calls };
}

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

describe('loadBookingDocument', () => {
  it("reads a quotation with its booking's code and parses the snapshot by the document shape", async () => {
    const { client } = fakeStack({ row: quotationRow });
    await expect(loadBookingDocument(client, 'quotation', QUOTATION_ID)).resolves.toEqual(
      QUOTATION,
    );
  });

  it('answers null for a row that does not exist', async () => {
    const { client } = fakeStack({ row: null });
    await expect(loadBookingDocument(client, 'quotation', QUOTATION_ID)).resolves.toBeNull();
  });

  it('refuses a snapshot outside the document shape rather than printing it', async () => {
    const { client } = fakeStack({
      row: { ...quotationRow, snapshot: { ...schoolSnapshot, pic_phone: '+6281234567890' } },
    });
    await expect(loadBookingDocument(client, 'quotation', QUOTATION_ID)).rejects.toThrow();
  });

  it('has no receipt for an invoice that is not paid yet', async () => {
    const { client } = fakeStack({
      row: {
        id: QUOTATION_ID,
        booking_id: BOOKING_ID,
        invoice_number: 'INV/GSK/2026/10/0012',
        receipt_number: null,
        status: 'issued',
        issued_at: '2026-10-23T02:00:00+00:00',
        snapshot: schoolSnapshot,
        pdf_path: null,
        receipt_pdf_path: null,
        bookings: { booking_code: 'GSK-7F3K9Q2M' },
      },
    });
    await expect(loadBookingDocument(client, 'receipt', QUOTATION_ID)).resolves.toBeNull();
  });
});

describe('bookingDocumentPdf', () => {
  // Review of PR #33, finding 1: the path is recorded through svc_record_document_pdf, which names the reader as the
  // actor the audit trigger asks for (tests/integration/documents.test.ts runs it against the real stack).
  it('renders an issued quotation once, keeps it under its booking and records the path through the RPC', async () => {
    vi.mocked(renderQuotationPdf).mockResolvedValue(RENDERED);
    const { client, calls } = fakeStack();
    await expect(bookingDocumentPdf(client, QUOTATION, CONTEXT)).resolves.toEqual(RENDERED);
    expect(calls).toEqual([
      {
        method: 'POST',
        path: `/storage/v1/object/documents/bookings/${BOOKING_ID}/quotation-SP-GSK-2026-10-0007.pdf`,
      },
      { method: 'POST', path: '/rest/v1/rpc/svc_record_document_pdf' },
    ]);
  });

  it('serves the stored file of a final document without rendering again', async () => {
    vi.mocked(renderQuotationPdf).mockClear();
    const { client, calls } = fakeStack({ stored: STORED });
    const kept = {
      ...QUOTATION,
      pdfPath: `bookings/${BOOKING_ID}/quotation-SP-GSK-2026-10-0007.pdf`,
    };
    await expect(bookingDocumentPdf(client, kept, CONTEXT)).resolves.toEqual(STORED);
    expect(renderQuotationPdf).not.toHaveBeenCalled();
    expect(calls.map((call) => call.method)).toEqual(['GET']);
  });

  it('renders a superseded quotation as it stands now and keeps nothing', async () => {
    vi.mocked(renderQuotationPdf).mockResolvedValue(RENDERED);
    const { client, calls } = fakeStack({ stored: STORED });
    const superseded = {
      ...QUOTATION,
      status: 'superseded' as const,
      pdfPath: 'bookings/x/old.pdf',
    };
    await expect(bookingDocumentPdf(client, superseded, CONTEXT)).resolves.toEqual(RENDERED);
    expect(calls).toEqual([]);
  });
});

describe('the document file name and state', () => {
  it('turns the number into a file name and knows which states are final', () => {
    expect(documentFileName(QUOTATION)).toBe('quotation-SP-GSK-2026-10-0007.pdf');
    expect(isFinalState(QUOTATION)).toBe(true);
    expect(isFinalState({ ...QUOTATION, status: 'accepted' })).toBe(false);
  });
});

describe('lookupVerifyCode', () => {
  it('names a quotation by its code with the school, validity, version and status', async () => {
    const { client } = fakeStack({
      row: {
        quotation_number: 'SP/GSK/2026/10/0007',
        version: 2,
        valid_until: '2026-11-06',
        status: 'superseded',
        bookings: { institution_name: 'SD Negeri Gisikdrono 01' },
      },
    });
    await expect(lookupVerifyCode(client, '7F3K9Q2M4A')).resolves.toEqual({
      kind: 'quotation',
      number: 'SP/GSK/2026/10/0007',
      institutionName: 'SD Negeri Gisikdrono 01',
      version: 2,
      validUntil: '2026-11-06',
      status: 'superseded',
    });
  });

  it('answers null for a code no document carries, after asking both tables', async () => {
    const { client, calls } = fakeStack({ row: null });
    await expect(lookupVerifyCode(client, 'ZZZZZZZZZZ')).resolves.toBeNull();
    expect(calls.map((call) => call.path)).toEqual([
      '/rest/v1/quotations',
      '/rest/v1/certificates',
    ]);
  });
});
