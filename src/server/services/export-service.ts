import 'server-only';

import { z } from 'zod';

import { DB_ENUMS } from '@/db/enums';
import type { Database, Json } from '@/db/types';
import { AppError, raisedHintOf } from '@/lib/errors';
import { exportColumns, exportRowsOf } from '@/lib/exports/columns';
import {
  exportContentType,
  exportDownloadName,
  exportFileName,
  exportStoragePath,
} from '@/lib/exports/file';
import { toXlsx } from '@/lib/exports/xlsx';
// Why the service role (CLAUDE.md §6.1): the documents bucket has no policy for any API role (0006_storage.sql), so
// writing the file, recording its path on the exports row and signing its link need it, as security_events does for
// a repeat download. It never decides who may export what: rpc_create_export does, under the staff member's own
// session, and every service-role query below is keyed by the export_id that call returned (or that RLS just showed
// the same session) together with the requester's own id.
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { toCsv } from '@/lib/utils/csv';
import { allowedValues, pageRange, searchPattern, type ListQuery } from '@/lib/utils/list-query';
import type { ExportRequest } from '@/lib/validations/export';
import type { StaffContext } from '@/server/auth/guards';
import { createDocumentSignedUrl } from '@/server/services/document-service';
import type { ListResult } from '@/types/data-table';
import type { CreatedExport, ExportListItem } from '@/types/export';

type ExportKind = Database['public']['Enums']['export_kind'];

const DOCUMENTS_BUCKET = 'documents';
// docs/Security.md §7.5: the database refuses an export past 50 000 rows with this hint; the route answers 422.
const TOO_LARGE_HINT = 'EXPORT_TOO_LARGE';
const RATE_LIMITED_HINT = 'RATE_LIMITED';
const INSUFFICIENT_PRIVILEGE = '42501';
const INVALID_PARAMETER = '22023';

export type ExportOutcome = { kind: 'ready'; created: CreatedExport } | { kind: 'too_large' };

const createdSchema = z.object({
  export_id: z.uuid(),
  watermark: z.string().min(1),
  row_count: z.number().int().nonnegative(),
  rows: z.array(z.json()),
});

function codeOf(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

// The RPC's refusals as the app's: the hourly cap, a kind the role may not export, and a request the database reads
// as malformed (the schema already checked it, so this is a second line). Anything else stays the error it was.
function appErrorOf(error: unknown): Error {
  if (raisedHintOf(error) === RATE_LIMITED_HINT) return new AppError('RATE_LIMITED');
  const code = codeOf(error);
  if (code === INSUFFICIENT_PRIVILEGE) return new AppError('FORBIDDEN');
  if (code === INVALID_PARAMETER) return new AppError('VALIDATION');
  return error instanceof Error ? error : new Error('export_failed', { cause: error });
}

function filtersOf(request: ExportRequest): Json {
  return request.rwId === null
    ? { from: request.from, to: request.to }
    : { from: request.from, to: request.to, rw_id: request.rwId };
}

async function callCreateExport(request: ExportRequest) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('rpc_create_export', {
    p_kind: request.kind,
    p_format: request.format,
    p_filters: filtersOf(request),
    p_reason: request.purpose,
  });
  if (error) {
    if (raisedHintOf(error) === TOO_LARGE_HINT) return { tooLarge: true } as const;
    throw appErrorOf(error);
  }
  return { tooLarge: false, created: createdSchema.parse(data) } as const;
}

async function renderFile(
  kind: ExportKind,
  format: ExportRequest['format'],
  rows: Json[],
  watermark: string,
): Promise<Buffer> {
  const columns = exportColumns(kind);
  const records = exportRowsOf(rows);
  return format === 'xlsx'
    ? toXlsx(columns, records, watermark)
    : Buffer.from(toCsv(columns, records, watermark), 'utf8');
}

// The file goes into the requester's own folder, and the row learns where it is; only a row of theirs whose path is
// still unset is written, so nothing here can point another export at this file.
async function storeFile(
  ctx: StaffContext,
  exportId: string,
  path: string,
  body: Buffer,
  contentType: string,
) {
  const adminClient = createSupabaseAdminClient();
  const upload = await adminClient.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, body, { contentType, upsert: false });
  if (upload.error) throw upload.error;
  const { error } = await adminClient
    .from('exports')
    .update({ storage_path: path, downloaded_at: new Date().toISOString() })
    .eq('id', exportId)
    .eq('requested_by', ctx.userId)
    .is('storage_path', null);
  if (error) throw error;
  return adminClient;
}

// Task P4.6.02 (docs/Security.md §7.5, DATA-06): the export is decided and recorded by rpc_create_export under the
// staff member's session (role, AAL2, RW, caps, rate limit, the exports row, export_downloaded, the audit row); this
// renders its rows as CSV or XLSX with the watermark, stores the file for 24 hours and hands back a 300-second link.
export async function createExport(
  ctx: StaffContext,
  request: ExportRequest,
): Promise<ExportOutcome> {
  const answer = await callCreateExport(request);
  if (answer.tooLarge) return { kind: 'too_large' };
  const { export_id: exportId, watermark, row_count: rowCount, rows } = answer.created;
  const path = exportStoragePath(
    ctx.userId,
    exportFileName(request.kind, request.format, new Date()),
  );
  const body = await renderFile(request.kind, request.format, rows, watermark);
  const adminClient = await storeFile(ctx, exportId, path, body, exportContentType(request.format));
  const url = await createDocumentSignedUrl(adminClient, path, 'export', exportDownloadName(path));
  return { kind: 'ready', created: { exportId, rowCount, url } };
}

const storedExportSchema = z.object({
  id: z.uuid(),
  kind: z.enum(DB_ENUMS.export_kind),
  format: z.string(),
  rw_id: z.number().nullable(),
  storage_path: z.string().nullable(),
  expires_at: z.string(),
  deleted_at: z.string().nullable(),
});

type StoredExport = z.infer<typeof storedExportSchema>;

// An export the session may see (exports_staff_read: its own, or the superadmin's all), of this kind, whose file is
// still there and whose 24 hours have not run out.
async function readOwnExport(kind: ExportKind, exportId: string): Promise<StoredExport | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('exports')
    .select('id, kind, format, rw_id, storage_path, expires_at, deleted_at')
    .eq('id', exportId)
    .maybeSingle();
  if (error) throw error;
  const row = data === null ? null : storedExportSchema.parse(data);
  const isLive = row !== null && row.deleted_at === null && Date.parse(row.expires_at) > Date.now();
  return isLive && row.kind === kind && row.storage_path !== null ? row : null;
}

async function recordRepeatDownload(ctx: StaffContext, row: StoredExport): Promise<void> {
  const adminClient = createSupabaseAdminClient();
  const [update, event] = await Promise.all([
    adminClient
      .from('exports')
      .update({ downloaded_at: new Date().toISOString() })
      .eq('id', row.id),
    adminClient.from('security_events').insert({
      event_type: 'export_downloaded',
      severity: 'info',
      actor_id: ctx.userId,
      actor_role: ctx.role,
      rw_id: row.rw_id,
      entity_type: 'exports',
      entity_id: row.id,
      details: { kind: row.kind, format: row.format, repeat: true },
    }),
  ]);
  if (update.error) throw update.error;
  if (event.error) throw event.error;
}

// Task P4.6.03: a repeat download of an export until its expiry, logged as export_downloaded like the first; NULL when
// the session may not see it or it is gone.
export async function exportDownloadUrl(
  ctx: StaffContext,
  kind: ExportKind,
  exportId: string,
): Promise<string | null> {
  const row = await readOwnExport(kind, exportId);
  if (row === null || row.storage_path === null) return null;
  await recordRepeatDownload(ctx, row);
  return createDocumentSignedUrl(
    createSupabaseAdminClient(),
    row.storage_path,
    'export',
    exportDownloadName(row.storage_path),
  );
}

const HISTORY_COLUMNS =
  'id, kind, format, filters, rw_id, row_count, reason, requested_by, storage_path, expires_at, deleted_at, created_at';

const historyRowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(DB_ENUMS.export_kind),
  format: z.enum(['csv', 'xlsx', 'pdf']),
  filters: z.object({ from: z.string().nullish(), to: z.string().nullish() }).loose(),
  rw_id: z.number().nullable(),
  row_count: z.number().nullable(),
  reason: z.string().nullable(),
  requested_by: z.uuid(),
  storage_path: z.string().nullable(),
  expires_at: z.string(),
  deleted_at: z.string().nullable(),
  created_at: z.string(),
});

type HistoryRow = z.infer<typeof historyRowSchema>;

function toListItem(
  row: HistoryRow,
  names: ReadonlyMap<string, string>,
  now: number,
): ExportListItem {
  return {
    id: row.id,
    kind: row.kind,
    format: row.format,
    periodFrom: row.filters.from ?? null,
    periodTo: row.filters.to ?? null,
    rwId: row.rw_id,
    rowCount: row.row_count,
    purpose: row.reason,
    requestedByName: names.get(row.requested_by) ?? null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    isAvailable:
      row.deleted_at === null && row.storage_path !== null && Date.parse(row.expires_at) > now,
  };
}

async function requesterNamesOf(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', [...new Set(ids)]);
  if (error) throw error;
  return new Map(data.flatMap((row) => (row.full_name ? [[row.id, row.full_name] as const] : [])));
}

// Task P4.6.03: the history of /dashboard/exports under RLS (exports_staff_read: an RW admin's own, the superadmin's
// all), newest first, `?q=` on the purpose, `?status=` on the kind and, for the superadmin, `?rw=`.
export async function listExports(
  query: ListQuery,
  rw: number | null,
): Promise<ListResult<ExportListItem>> {
  const supabase = await createSupabaseServerClient();
  const { from, to } = pageRange(query.page, query.per);
  const kinds = allowedValues(query.status, DB_ENUMS.export_kind);
  const pattern = searchPattern(query.q);
  let request = supabase.from('exports').select(HISTORY_COLUMNS, { count: 'exact' });
  if (kinds.length > 0) request = request.in('kind', kinds);
  if (rw !== null) request = request.eq('rw_id', rw);
  if (pattern !== null) request = request.ilike('reason', pattern);
  const { data, error, count } = await request
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);
  if (error) throw error;
  const rows = z.array(historyRowSchema).parse(data);
  const names = await requesterNamesOf(rows.map((row) => row.requested_by));
  const now = Date.now();
  return { rows: rows.map((row) => toListItem(row, names, now)), total: count ?? rows.length };
}
