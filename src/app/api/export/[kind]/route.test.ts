import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, fail } from '@/lib/errors';
import { requireAal2, type StaffContext } from '@/server/auth/guards';
import { createExport, exportDownloadUrl } from '@/server/services/export-service';

import { GET, POST } from './route';

vi.mock('@/server/services/export-service', () => ({
  createExport: vi.fn(),
  exportDownloadUrl: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  requestIdFrom: () => 'request-1',
}));
vi.mock('next/headers', () => ({ headers: () => Promise.reject(new Error('outside a request')) }));
vi.mock('@/server/auth/guards', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireAal2: vi.fn(),
}));

const SITE = 'http://127.0.0.1:3000';
const EXPORT_ID = '0192f3a4-5b6c-4d8e-9f01-00000000e001';
const SIGNED_URL = 'http://127.0.0.1:54321/storage/v1/object/sign/documents/exports/x?token=t';

const SUPERADMIN: StaffContext = {
  userId: '00000000-0000-4000-8000-000000000001',
  role: 'superadmin',
  rwId: null,
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
};
const ADMIN_RW05: StaffContext = {
  ...SUPERADMIN,
  userId: '00000000-0000-4000-8000-000000000005',
  role: 'admin_rw',
  rwId: 5,
};

const BODY = {
  format: 'csv',
  from: '2026-10-01',
  to: '2026-10-31',
  purpose: 'Rekap kunjungan bulanan kelurahan',
};

function context(kind: string) {
  return { params: Promise.resolve({ kind }) };
}

function postExport(kind: string, body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request(`${SITE}/api/export/${kind}`, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        origin: SITE,
        host: '127.0.0.1:3000',
        ...headers,
      },
    }),
    context(kind),
  );
}

function getExport(kind: string, id: string | null) {
  const query = id === null ? '' : `?id=${id}`;
  return GET(new Request(`${SITE}/api/export/${kind}${query}`), context(kind));
}

beforeEach(() => {
  vi.mocked(requireAal2).mockReset().mockResolvedValue({ ok: true, ctx: SUPERADMIN });
  vi.mocked(createExport)
    .mockReset()
    .mockResolvedValue({
      kind: 'ready',
      created: { exportId: EXPORT_ID, rowCount: 3, url: SIGNED_URL },
    });
  vi.mocked(exportDownloadUrl).mockReset().mockResolvedValue(SIGNED_URL);
});

describe('POST /api/export/[kind]', () => {
  it('creates the export and answers its 300-second link, uncached', async () => {
    const response = await postExport('visits', BODY);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      ok: true,
      data: { exportId: EXPORT_ID, rowCount: 3, url: SIGNED_URL },
    });
    expect(createExport).toHaveBeenCalledWith(SUPERADMIN, { ...BODY, kind: 'visits', rwId: null });
  });

  it('takes the kind from the address, never from the body', async () => {
    await postExport('attendance', { ...BODY, kind: 'finance', rwId: 13 });
    expect(createExport).toHaveBeenCalledWith(SUPERADMIN, {
      ...BODY,
      kind: 'attendance',
      rwId: 13,
    });
  });

  it('answers 404 for an unknown kind, before any guard', async () => {
    const response = await postExport('participants', BODY);
    expect(response.status).toBe(404);
    expect(requireAal2).not.toHaveBeenCalled();
  });

  it('refuses another origin and a request without one', async () => {
    expect((await postExport('visits', BODY, { origin: 'https://evil.example' })).status).toBe(403);
    const noOrigin = await POST(
      new Request(`${SITE}/api/export/visits`, { method: 'POST', body: JSON.stringify(BODY) }),
      context('visits'),
    );
    expect(noOrigin.status).toBe(403);
    expect(createExport).not.toHaveBeenCalled();
  });

  it('answers 401 without a session and 403 without AAL2', async () => {
    vi.mocked(requireAal2).mockResolvedValueOnce(fail('UNAUTHENTICATED'));
    expect((await postExport('visits', BODY)).status).toBe(401);
    vi.mocked(requireAal2).mockResolvedValueOnce(fail('FORBIDDEN'));
    expect((await postExport('visits', BODY)).status).toBe(403);
    expect(createExport).not.toHaveBeenCalled();
  });

  it('lets an RW admin export attendance only', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: ADMIN_RW05 });
    for (const kind of ['visits', 'finance', 'audit']) {
      expect((await postExport(kind, BODY)).status).toBe(403);
    }
    expect(createExport).not.toHaveBeenCalled();
    expect((await postExport('attendance', BODY)).status).toBe(200);
    expect(createExport).toHaveBeenCalledWith(ADMIN_RW05, {
      ...BODY,
      kind: 'attendance',
      rwId: null,
    });
  });

  it('rejects an extra field, a short purpose and a period past 12 months', async () => {
    expect((await postExport('visits', { ...BODY, columns: ['pic_phone'] })).status).toBe(400);
    expect((await postExport('visits', { ...BODY, purpose: 'Rekap' })).status).toBe(400);
    const tooLong = await postExport('visits', { ...BODY, from: '2025-10-01', to: '2026-10-01' });
    expect(tooLong.status).toBe(400);
    expect(createExport).not.toHaveBeenCalled();
  });

  it('refuses the audit log as XLSX', async () => {
    expect((await postExport('audit', { ...BODY, format: 'xlsx' })).status).toBe(400);
  });

  it('refuses a body past its cap', async () => {
    const response = await postExport('visits', { ...BODY, purpose: 'a'.repeat(4096) });
    expect(response.status).toBe(413);
  });

  it('answers 422 past 50 000 rows, with the words for the period', async () => {
    vi.mocked(createExport).mockResolvedValueOnce({ kind: 'too_large' });
    const response = await postExport('visits', BODY);
    expect(response.status).toBe(422);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { to: [expect.any(String)] } },
    });
  });

  it('answers 429 past 10 exports an hour, as the database raises it', async () => {
    vi.mocked(createExport).mockRejectedValueOnce({
      code: 'P0001',
      hint: 'RATE_LIMITED',
      message: 'x',
    });
    expect((await postExport('visits', BODY)).status).toBe(429);
  });

  it('answers 403 when the database refuses the role', async () => {
    vi.mocked(createExport).mockRejectedValueOnce(new AppError('FORBIDDEN'));
    expect((await postExport('attendance', BODY)).status).toBe(403);
  });
});

describe('GET /api/export/[kind]?id=', () => {
  it('redirects to a fresh link of an export within its 24 hours', async () => {
    const response = await getExport('visits', EXPORT_ID);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(SIGNED_URL);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(exportDownloadUrl).toHaveBeenCalledWith(SUPERADMIN, 'visits', EXPORT_ID);
  });

  it('answers 404 for a gone or unseen export and for a malformed id', async () => {
    vi.mocked(exportDownloadUrl).mockResolvedValueOnce(null);
    expect((await getExport('visits', EXPORT_ID)).status).toBe(404);
    expect((await getExport('visits', 'not-an-id')).status).toBe(404);
    expect((await getExport('visits', null)).status).toBe(404);
  });

  it('keeps an RW admin to attendance downloads', async () => {
    vi.mocked(requireAal2).mockResolvedValue({ ok: true, ctx: ADMIN_RW05 });
    expect((await getExport('finance', EXPORT_ID)).status).toBe(403);
    expect((await getExport('attendance', EXPORT_ID)).status).toBe(303);
  });
});
