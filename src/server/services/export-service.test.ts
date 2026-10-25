import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { UTF8_BOM } from '@/lib/utils/csv';
import type { ExportRequest } from '@/lib/validations/export';
import type { StaffContext } from '@/server/auth/guards';

import { createExport, exportDownloadUrl } from './export-service';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));
const createSupabaseAdminClient = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient }));
const withinRateLimits = vi.hoisted(() => vi.fn());
vi.mock('@/lib/rate-limit', () => ({ withinRateLimits }));
// The bucket's 50 MB, made small enough for a test to pass it.
const fileLimit = vi.hoisted(() => ({ bytes: 50 * 1024 * 1024 }));
vi.mock('@/config/exports', async (importOriginal) =>
  Object.defineProperty({ ...(await importOriginal<object>()) }, 'EXPORT_FILE_MAX_BYTES', {
    enumerable: true,
    get: () => fileLimit.bytes,
  }),
);

const EXPORT_ID = '0192f3a4-5b6c-4d8e-9f01-00000000e001';
const OFFICER: StaffContext = {
  userId: '00000000-0000-4000-8000-000000000005',
  role: 'admin_rw',
  rwId: 5,
  isAal2: true,
  totpVerifiedAt: null,
  claimsVersion: 1,
};
const REQUEST: ExportRequest = {
  kind: 'attendance',
  format: 'csv',
  from: '2026-10-01',
  to: '2026-10-31',
  rwId: null,
  purpose: 'Rekap kehadiran bulanan RW',
};
const WATERMARK = 'Diekspor oleh Admin 25-10-2026 09:30 WIB - Dokumen rahasia Kelurahan Gisikdrono';

function chain(result: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ['update', 'eq', 'is', 'select', 'insert'])
    query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn(() => Promise.resolve(result));
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return query;
}

function sessionClient(rpcAnswer: { data: unknown; error: unknown }, exportRow: unknown = null) {
  const rpc = vi.fn(() => Promise.resolve(rpcAnswer));
  const from = vi.fn(() => chain({ data: exportRow, error: null }));
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc, from } as never);
  return { rpc, from };
}

function adminClient(options: { uploadError?: unknown; recordError?: unknown } = {}) {
  const upload = vi.fn(() => Promise.resolve({ data: {}, error: options.uploadError ?? null }));
  const remove = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const createSignedUrl = vi.fn(() =>
    Promise.resolve({ data: { signedUrl: 'https://signed' }, error: null }),
  );
  const rpc = vi.fn(() => Promise.resolve({ data: true, error: null }));
  const tables = new Map<string, ReturnType<typeof chain>>();
  const from = vi.fn((table: string) => {
    const query = chain({ data: null, error: options.recordError ?? null });
    tables.set(table, query);
    return query;
  });
  createSupabaseAdminClient.mockReturnValue({
    storage: { from: () => ({ upload, remove, createSignedUrl }) },
    from,
    rpc,
  });
  return { upload, remove, createSignedUrl, rpc, from, tables };
}

const READY = {
  data: { export_id: EXPORT_ID, watermark: WATERMARK, row_count: 1, rows: [] as unknown[] },
  error: null,
};

function failedAs(reason: string) {
  return [
    'svc_fail_export',
    { p_export_id: EXPORT_ID, p_actor_id: OFFICER.userId, p_reason: reason },
  ] as const;
}

const ROWS = [{ booking_code: 'GSK-7F3K9Q2M', institution_name: '+cmd', booked_pax: 30, rw_id: 5 }];

beforeEach(() => {
  vi.mocked(createSupabaseServerClient).mockReset();
  createSupabaseAdminClient.mockReset();
  withinRateLimits.mockReset().mockResolvedValue(true);
  fileLimit.bytes = 50 * 1024 * 1024;
});

describe('createExport', () => {
  it('asks rpc_create_export under the session, stores the file in the requester’s folder and signs a download link', async () => {
    const session = sessionClient({
      data: { export_id: EXPORT_ID, watermark: WATERMARK, row_count: 1, rows: ROWS },
      error: null,
    });
    const admin = adminClient();

    const outcome = await createExport(OFFICER, REQUEST);

    expect(session.rpc).toHaveBeenCalledWith('rpc_create_export', {
      p_kind: 'attendance',
      p_format: 'csv',
      p_filters: { from: '2026-10-01', to: '2026-10-31' },
      p_reason: REQUEST.purpose,
    });
    expect(outcome).toEqual({
      kind: 'ready',
      created: { exportId: EXPORT_ID, rowCount: 1, url: 'https://signed' },
    });
    const [path, body, options] = admin.upload.mock.calls[0] as unknown as [string, Buffer, object];
    expect(path).toMatch(
      new RegExp(`^exports/${OFFICER.userId}/\\d{8}-\\d{6}-attendance-${EXPORT_ID}\\.csv$`),
    );
    expect(options).toEqual({ contentType: 'text/csv', upsert: false });
    const csv = body.toString('utf8');
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toContain("'+cmd");
    expect(csv).toContain(WATERMARK);
    const [signedPath, ttl, signOptions] = admin.createSignedUrl.mock.calls[0] as unknown as [
      string,
      number,
      { download: string },
    ];
    expect([signedPath, ttl]).toEqual([path, 300]);
    expect(signOptions.download).toMatch(/^ekspor-\d{8}-\d{6}-attendance\.csv$/);
    expect(admin.rpc).not.toHaveBeenCalled();
    const update = admin.tables.get('exports');
    expect(update?.eq).toHaveBeenCalledWith('id', EXPORT_ID);
    expect(update?.eq).toHaveBeenCalledWith('requested_by', OFFICER.userId);
    expect(update?.is).toHaveBeenCalledWith('storage_path', null);
  });

  it('passes the superadmin’s RW to the RPC', async () => {
    const session = sessionClient({
      data: { export_id: EXPORT_ID, watermark: WATERMARK, row_count: 0, rows: [] },
      error: null,
    });
    adminClient();
    await createExport(
      { ...OFFICER, role: 'superadmin', rwId: null },
      { ...REQUEST, kind: 'visits', rwId: 13 },
    );
    expect(session.rpc).toHaveBeenCalledWith(
      'rpc_create_export',
      expect.objectContaining({ p_filters: { from: '2026-10-01', to: '2026-10-31', rw_id: 13 } }),
    );
  });

  it('answers too_large past 50 000 rows and writes nothing', async () => {
    sessionClient({ data: null, error: { code: 'P0001', hint: 'EXPORT_TOO_LARGE', message: 'x' } });
    const admin = adminClient();
    expect(await createExport(OFFICER, REQUEST)).toEqual({ kind: 'too_large' });
    expect(admin.upload).not.toHaveBeenCalled();
  });

  it('answers too_large when the database answers the refusal instead of raising it', async () => {
    sessionClient({ data: { refused: 'EXPORT_TOO_LARGE', row_count: 50001 }, error: null });
    const admin = adminClient();
    expect(await createExport(OFFICER, REQUEST)).toEqual({ kind: 'too_large' });
    expect(admin.upload).not.toHaveBeenCalled();
  });

  it('fails an export whose file is too big for the bucket before uploading it', async () => {
    sessionClient(READY);
    const admin = adminClient();
    fileLimit.bytes = 16;
    expect(await createExport(OFFICER, REQUEST)).toEqual({ kind: 'file_too_large' });
    expect(admin.upload).not.toHaveBeenCalled();
    expect(admin.rpc).toHaveBeenCalledWith(...failedAs('too_large'));
  });

  it('fails an export whose file Storage refuses as too big', async () => {
    sessionClient(READY);
    const admin = adminClient({ uploadError: { statusCode: '413', message: 'too big' } });
    expect(await createExport(OFFICER, REQUEST)).toEqual({ kind: 'file_too_large' });
    expect(admin.rpc).toHaveBeenCalledWith(...failedAs('too_large'));
    expect(admin.createSignedUrl).not.toHaveBeenCalled();
  });

  it('fails an export whose upload breaks, and passes the error on', async () => {
    sessionClient(READY);
    const uploadError = { statusCode: '500', message: 'down' };
    const admin = adminClient({ uploadError });
    await expect(createExport(OFFICER, REQUEST)).rejects.toBe(uploadError);
    expect(admin.rpc).toHaveBeenCalledWith(...failedAs('upload_failed'));
  });

  it('removes a stored file whose path the row could not learn, and fails the export', async () => {
    sessionClient(READY);
    const recordError = { code: '57014', message: 'canceled' };
    const admin = adminClient({ recordError });
    await expect(createExport(OFFICER, REQUEST)).rejects.toBe(recordError);
    const [path] = admin.upload.mock.calls[0] as unknown as [string];
    expect(admin.remove).toHaveBeenCalledWith([path]);
    expect(admin.rpc).toHaveBeenCalledWith(...failedAs('record_failed'));
    expect(admin.createSignedUrl).not.toHaveBeenCalled();
  });

  it('reads the database refusals as the app errors the route maps to 403, 429 and 400', async () => {
    sessionClient({ data: null, error: { code: '42501', message: 'x' } });
    adminClient();
    await expect(createExport(OFFICER, REQUEST)).rejects.toEqual(new AppError('FORBIDDEN'));

    sessionClient({ data: null, error: { code: 'P0001', hint: 'RATE_LIMITED', message: 'x' } });
    await expect(createExport(OFFICER, REQUEST)).rejects.toEqual(new AppError('RATE_LIMITED'));

    sessionClient({ data: null, error: { code: '22023', message: 'x' } });
    await expect(createExport(OFFICER, REQUEST)).rejects.toEqual(new AppError('VALIDATION'));
  });
});

describe('exportDownloadUrl', () => {
  const LIVE_ROW = {
    id: EXPORT_ID,
    kind: 'attendance',
    format: 'csv',
    rw_id: 5,
    storage_path: `exports/${OFFICER.userId}/20261025-093000-attendance.csv`,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    deleted_at: null,
  };

  it('signs a fresh link for a live export of that kind and logs the repeat download', async () => {
    sessionClient({ data: null, error: null }, LIVE_ROW);
    const admin = adminClient();
    expect(await exportDownloadUrl(OFFICER, 'attendance', EXPORT_ID)).toBe('https://signed');
    expect(admin.tables.get('security_events')?.insert).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'export_downloaded', entity_id: EXPORT_ID }),
    );
  });

  it('refuses past its hourly limit before reading or logging anything', async () => {
    withinRateLimits.mockResolvedValueOnce(false);
    const session = sessionClient({ data: null, error: null }, LIVE_ROW);
    const admin = adminClient();
    await expect(exportDownloadUrl(OFFICER, 'attendance', EXPORT_ID)).rejects.toEqual(
      new AppError('RATE_LIMITED'),
    );
    expect(withinRateLimits).toHaveBeenCalledWith(expect.anything(), [
      { name: 'export_download:user', subject: OFFICER.userId },
    ]);
    expect(session.from).not.toHaveBeenCalled();
    expect(admin.tables.has('security_events')).toBe(false);
  });

  it('gives nothing for another kind, an expired or deleted export, or one RLS does not show', async () => {
    adminClient();
    sessionClient({ data: null, error: null }, LIVE_ROW);
    expect(await exportDownloadUrl(OFFICER, 'finance', EXPORT_ID)).toBeNull();
    sessionClient({ data: null, error: null }, { ...LIVE_ROW, expires_at: '2026-01-01T00:00:00Z' });
    expect(await exportDownloadUrl(OFFICER, 'attendance', EXPORT_ID)).toBeNull();
    sessionClient({ data: null, error: null }, { ...LIVE_ROW, deleted_at: '2026-10-25T00:00:00Z' });
    expect(await exportDownloadUrl(OFFICER, 'attendance', EXPORT_ID)).toBeNull();
    sessionClient({ data: null, error: null }, null);
    expect(await exportDownloadUrl(OFFICER, 'attendance', EXPORT_ID)).toBeNull();
  });
});
