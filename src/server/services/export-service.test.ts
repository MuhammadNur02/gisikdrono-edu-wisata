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

function adminClient() {
  const upload = vi.fn(() => Promise.resolve({ data: {}, error: null }));
  const createSignedUrl = vi.fn(() =>
    Promise.resolve({ data: { signedUrl: 'https://signed' }, error: null }),
  );
  const tables = new Map<string, ReturnType<typeof chain>>();
  const from = vi.fn((table: string) => {
    const query = chain({ data: null, error: null });
    tables.set(table, query);
    return query;
  });
  createSupabaseAdminClient.mockReturnValue({
    storage: { from: () => ({ upload, createSignedUrl }) },
    from,
  });
  return { upload, createSignedUrl, from, tables };
}

const ROWS = [{ booking_code: 'GSK-7F3K9Q2M', institution_name: '+cmd', booked_pax: 30, rw_id: 5 }];

beforeEach(() => {
  vi.mocked(createSupabaseServerClient).mockReset();
  createSupabaseAdminClient.mockReset();
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
    expect(path).toMatch(new RegExp(`^exports/${OFFICER.userId}/\\d{8}-\\d{6}-attendance\\.csv$`));
    expect(options).toEqual({ contentType: 'text/csv', upsert: false });
    const csv = body.toString('utf8');
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toContain("'+cmd");
    expect(csv).toContain(WATERMARK);
    expect(admin.createSignedUrl).toHaveBeenCalledWith(path, 300, {
      download: `ekspor-${path.split('/').at(-1) ?? ''}`,
    });
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
