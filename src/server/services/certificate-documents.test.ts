import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@/db/types';
import { renderCertificatePdf } from '@/lib/pdf/certificate';
import { splitPdfPages } from '@/lib/pdf/split-pages';
import {
  certificateFileName,
  certificatePdf,
  isServable,
  printsAPersonsName,
  rerenderBookingCertificates,
} from '@/server/services/certificate-documents';
import { loadCertificatePages, type CertificateRow } from '@/server/services/certificate-pages';

// The renderer and the splitter are proven on their own output in src/lib/pdf; the page input on the database.
vi.mock('@/lib/pdf/certificate', () => ({ renderCertificatePdf: vi.fn() }));
vi.mock('@/lib/pdf/split-pages', () => ({ splitPdfPages: vi.fn() }));
vi.mock('@/server/services/certificate-pages', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadCertificatePages: vi.fn(),
}));

const BOOKING_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000bb';
const STAFF_ID = '0192f3a4-5b6c-7d8e-9f01-0000000000aa';
const CONTEXT = { siteUrl: 'https://eduwisata.example.test', readerId: STAFF_ID };
const BUNDLE = Buffer.from('%PDF-1.7 bundle');

const certificate = (overrides: Partial<CertificateRow>): CertificateRow => ({
  id: '0192f3a4-5b6c-7d8e-9f01-000000000c01',
  bookingId: BOOKING_ID,
  kind: 'group',
  certificateNumber: 'SERT/GSK/2026/00031',
  status: 'issued',
  institutionName: 'SD Negeri Gisikdrono 01',
  releasedAt: '2026-11-06T03:00:00+00:00',
  purgedAt: null,
  pdfPath: null,
  ...overrides,
});

const GROUP = certificate({});
const ANI = certificate({
  id: '0192f3a4-5b6c-7d8e-9f01-000000000c02',
  kind: 'participant',
  certificateNumber: 'SERT/GSK/2026/00032',
});
const BUDI = certificate({
  id: '0192f3a4-5b6c-7d8e-9f01-000000000c03',
  kind: 'participant',
  certificateNumber: 'SERT/GSK/2026/00033',
});

const rowOf = (row: CertificateRow) => ({
  id: row.id,
  booking_id: row.bookingId,
  kind: row.kind,
  certificate_number: row.certificateNumber,
  status: row.status,
  institution_name: row.institutionName,
  released_at: row.releasedAt,
  purged_at: row.purgedAt,
  pdf_path: row.pdfPath,
});

// A typed client whose fetch plays PostgREST and Storage: the booking's certificates, the kept file, the uploads and
// the svc_record_document_pdf calls.
function fakeStack(options: { rows?: CertificateRow[]; stored?: Buffer; recordFails?: boolean }) {
  const calls: { method: string; path: string; body?: string }[] = [];
  const answer = (method: string, path: string): Response => {
    if (path.startsWith('/rest/v1/rpc/')) {
      return options.recordFails
        ? Response.json({ code: 'P0001', hint: 'STATE_INVALID', message: 'x' }, { status: 400 })
        : new Response(null, { status: 204 });
    }
    if (path.startsWith('/rest/v1/')) return Response.json((options.rows ?? []).map(rowOf));
    if (method === 'GET') {
      return options.stored
        ? new Response(new Uint8Array(options.stored))
        : Response.json({ error: 'not found' }, { status: 404 });
    }
    return Response.json({ Key: 'documents/x' });
  };
  const fakeFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ method, path: url.pathname, body });
    return Promise.resolve(answer(method, url.pathname));
  };
  const client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  });
  return { client, calls };
}

// The page input of whichever of the three certificates is asked for, and one page file per page, named by its number.
function answerPages() {
  vi.mocked(loadCertificatePages).mockImplementation((_client, ids) => {
    const rows = [GROUP, ANI, BUDI].filter((row) => ids.includes(row.id));
    return Promise.resolve({
      signatoryName: 'Budi Santoso, S.Sos.',
      signatoryTitle: 'Lurah Gisikdrono',
      ids: rows.map((row) => row.id),
      pages: rows.map((row) => ({
        kind: row.kind,
        certificateNumber: row.certificateNumber,
        recipientName: 'x',
        groupLabel: null,
        institutionName: row.institutionName,
        visitDate: '2026-11-06',
        rwNames: ['RW 05 Ecowastreme'],
        verifyUrl: 'https://eduwisata.example.test/verifikasi/7F3K9Q2M4A',
      })),
    });
  });
  vi.mocked(splitPdfPages).mockImplementation((_pdf, titles) =>
    Promise.resolve(titles.map((title) => Buffer.from(`%PDF-1.7 ${title}`))),
  );
}

const recordedPaths = (calls: { path: string; body?: string }[]) =>
  calls
    .filter((call) => call.path === '/rest/v1/rpc/svc_record_document_pdf')
    .map((call) => (JSON.parse(call.body ?? '{}') as { p_path: string }).p_path)
    .sort();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(renderCertificatePdf).mockResolvedValue(BUNDLE);
  answerPages();
});

describe('which certificates are handed out', () => {
  it('only an issued, released one that was not purged', () => {
    expect(isServable(GROUP)).toBe(true);
    expect(isServable(certificate({ releasedAt: null }))).toBe(false);
    expect(isServable(certificate({ status: 'revoked' }))).toBe(false);
    expect(isServable(certificate({ purgedAt: '2027-02-04T19:00:00+00:00' }))).toBe(false);
  });

  it('counts a participant’s, and an individual visit’s group certificate, as a person’s name', () => {
    expect(printsAPersonsName(ANI)).toBe(true);
    expect(printsAPersonsName(GROUP)).toBe(false);
    expect(printsAPersonsName(certificate({ institutionName: null }))).toBe(true);
  });

  it('names each file after its own kind and number, as purge_participants removes it', () => {
    expect(certificateFileName(GROUP)).toBe('group-SERT-GSK-2026-00031.pdf');
    expect(certificateFileName(ANI)).toBe('participant-SERT-GSK-2026-00032.pdf');
  });
});

describe('certificatePdf', () => {
  it('hands back the kept file without rendering', async () => {
    const kept = Buffer.from('%PDF-1.7 kept');
    const { client } = fakeStack({ stored: kept });
    const pdf = await certificatePdf(
      client,
      { ...GROUP, pdfPath: 'certificates/b/group.pdf' },
      CONTEXT,
    );
    expect(pdf).toEqual(kept);
    expect(renderCertificatePdf).not.toHaveBeenCalled();
  });

  it('renders the group certificate alone and keeps it under its own name and the reader', async () => {
    const { client, calls } = fakeStack({});
    await certificatePdf(client, GROUP, CONTEXT);
    expect(loadCertificatePages).toHaveBeenCalledWith(client, [GROUP.id], CONTEXT.siteUrl);
    expect(recordedPaths(calls)).toEqual([
      `certificates/${BOOKING_ID}/group-SERT-GSK-2026-00031.pdf`,
    ]);
    const record = calls.find((call) => call.path === '/rest/v1/rpc/svc_record_document_pdf');
    expect(JSON.parse(record?.body ?? '{}')).toMatchObject({
      p_kind: 'certificate',
      p_actor_id: STAFF_ID,
    });
  });

  it('renders the class once as one document and keeps every page as its own participant’s file', async () => {
    const { client, calls } = fakeStack({ rows: [GROUP, ANI, BUDI] });
    const pdf = await certificatePdf(client, BUDI, CONTEXT);
    expect(renderCertificatePdf).toHaveBeenCalledTimes(1);
    expect(loadCertificatePages).toHaveBeenCalledWith(client, [ANI.id, BUDI.id], CONTEXT.siteUrl);
    expect(pdf.toString()).toBe('%PDF-1.7 SERT/GSK/2026/00033');
    expect(recordedPaths(calls)).toEqual([
      `certificates/${BOOKING_ID}/participant-SERT-GSK-2026-00032.pdf`,
      `certificates/${BOOKING_ID}/participant-SERT-GSK-2026-00033.pdf`,
    ]);
  });

  it('refuses a certificate that is not handed out, and removes a file whose record was refused', async () => {
    const { client } = fakeStack({});
    await expect(
      certificatePdf(client, certificate({ status: 'revoked' }), CONTEXT),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const refused = fakeStack({ recordFails: true });
    await expect(certificatePdf(refused.client, GROUP, CONTEXT)).rejects.toMatchObject({
      code: 'P0001',
    });
    expect(refused.calls.some((call) => call.method === 'DELETE')).toBe(true);
  });
});

describe('rerenderBookingCertificates', () => {
  it('renders the group and the class again over their kept files', async () => {
    const { client, calls } = fakeStack({ rows: [GROUP, ANI, BUDI] });
    await expect(rerenderBookingCertificates(client, BOOKING_ID, CONTEXT)).resolves.toBe(3);
    expect(recordedPaths(calls)).toHaveLength(3);
  });
});
