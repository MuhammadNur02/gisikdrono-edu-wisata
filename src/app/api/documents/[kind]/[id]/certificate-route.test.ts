import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireCertificateReader } from '@/server/auth/document-access';
import type { CertificateRow } from '@/server/services/certificate-pages';
import {
  certificateDocumentFile,
  readCertificateDocument,
  withinDocumentLimits,
} from '@/server/services/document-service';

import { GET } from './route';

vi.mock('@/lib/queries/booklets', () => ({ getBookletDownload: vi.fn() }));
vi.mock('@/server/auth/document-access', () => ({
  requireDocumentReader: vi.fn(),
  requireCertificateReader: vi.fn(),
}));
vi.mock('@/server/services/document-service', () => ({
  countBookletDownload: vi.fn(),
  withinBookletDownloadLimit: vi.fn(),
  withinDocumentLimits: vi.fn(),
  readBookingDocument: vi.fn(),
  bookingDocumentFile: vi.fn(),
  readTicketDocument: vi.fn(),
  ticketDocumentFile: vi.fn(),
  readCertificateDocument: vi.fn(),
  certificateDocumentFile: vi.fn(),
}));

const CERTIFICATE_ID = '0192f3a4-5b6c-7d8e-9f01-000000000c02';
const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const PDF = Buffer.from('%PDF-1.7 certificate');
const PARTICIPANT: CertificateRow = {
  id: CERTIFICATE_ID,
  bookingId: BOOKING_ID,
  kind: 'participant',
  certificateNumber: 'SERT/GSK/2026/00032',
  status: 'issued',
  institutionName: 'SD Negeri Gisikdrono 01',
  releasedAt: '2026-11-06T03:00:00+00:00',
  purgedAt: null,
  pdfPath: null,
};
const NOT_FOUND = { ok: false as const, error: { code: 'NOT_FOUND' as const, message: 'x' } };

function fetchCertificate(id = CERTIFICATE_ID) {
  const request = new Request(`http://localhost/api/documents/certificate/${id}`, {
    headers: { 'x-real-ip': '203.0.113.7' },
  });
  return GET(request, { params: Promise.resolve({ kind: 'certificate', id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(withinDocumentLimits).mockResolvedValue(true);
  vi.mocked(readCertificateDocument).mockResolvedValue(PARTICIPANT);
  vi.mocked(requireCertificateReader).mockResolvedValue({
    ok: true,
    reader: 'staff',
    userId: 'u-1',
  });
  vi.mocked(certificateDocumentFile).mockResolvedValue(PDF);
});

describe('GET /api/documents/certificate/[id]', () => {
  it('streams a participant certificate inline to staff past the personal-data gate, under its own name', async () => {
    const response = await fetchCertificate();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe(
      'inline; filename="participant-SERT-GSK-2026-00032.pdf"',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(requireCertificateReader).toHaveBeenCalledWith(CERTIFICATE_ID, BOOKING_ID, true);
    expect(certificateDocumentFile).toHaveBeenCalledWith(PARTICIPANT, 'u-1');
  });

  it('answers one 404 to a held, revoked or purged certificate and to a reader refused', async () => {
    for (const changed of [
      { releasedAt: null },
      { status: 'revoked' as const },
      { purgedAt: '2027-02-04T19:00:00+00:00' },
    ]) {
      vi.mocked(readCertificateDocument).mockResolvedValueOnce({ ...PARTICIPANT, ...changed });
      expect((await fetchCertificate()).status).toBe(404);
    }
    vi.mocked(requireCertificateReader).mockResolvedValueOnce(NOT_FOUND);
    expect((await fetchCertificate()).status).toBe(404);
    expect(requireCertificateReader).toHaveBeenCalledTimes(1);
    expect(certificateDocumentFile).not.toHaveBeenCalled();
  });

  it('answers 429 past the per-IP limit before anything is looked up', async () => {
    vi.mocked(withinDocumentLimits).mockResolvedValueOnce(false);
    expect((await fetchCertificate()).status).toBe(429);
    expect(readCertificateDocument).not.toHaveBeenCalled();
  });
});
