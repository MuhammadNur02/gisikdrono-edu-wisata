import 'server-only';

import { z } from 'zod';

import { EXPORT_FILE_MAX_BYTES, type ExportFailureReason } from '@/config/exports';
import { DB_ENUMS } from '@/db/enums';
import { resultOf, type DatabaseClient } from '@/db/rpc-result';
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
import { withinRateLimits } from '@/lib/rate-limit';
// Why the service role (CLAUDE.md §6.1): the documents bucket has no policy for any API role (0006_storage.sql), so
// writing the file, recording its path on the exports row and signing its link need it, as security_events does for
// a repeat download and svc_fail_export does for an export that left no file. It never decides who may export what:
// rpc_create_export does, under the staff member's own session, and every service-role query below is keyed by the
// export_id that call returned (or that RLS just showed the same session) together with the requester's own id.
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { toCsv } from '@/lib/utils/csv';
import type { ExportRequest } from '@/lib/validations/export';
import type { StaffContext } from '@/server/auth/guards';
import { createDocumentSignedUrl } from '@/server/services/document-service';
import type { CreatedExport } from '@/types/export';

type ExportKind = Database['public']['Enums']['export_kind'];

const DOCUMENTS_BUCKET = 'documents';
// docs/Security.md §7.5: the database refuses an export past 50 000 rows with this hint (20261027080100), or answers
// it as {refused: 'EXPORT_TOO_LARGE'} once 20261028080000 is applied; the route answers 422 either way.
const TOO_LARGE_HINT = 'EXPORT_TOO_LARGE';
const RATE_LIMITED_HINT = 'RATE_LIMITED';
const INSUFFICIENT_PRIVILEGE = '42501';
const INVALID_PARAMETER = '22023';
// Storage answers 413 for an object past the bucket's file_size_limit.
const PAYLOAD_TOO_LARGE = '413';

export type ExportOutcome =
  { kind: 'ready'; created: CreatedExport } | { kind: 'too_large' } | { kind: 'file_too_large' };

const createdSchema = z.object({
  export_id: z.uuid(),
  watermark: z.string().min(1),
  row_count: z.number().int().nonnegative(),
  rows: z.array(z.json()),
});
const refusedSchema = z.object({ refused: z.literal(TOO_LARGE_HINT) });

type CreatedAnswer = z.infer<typeof createdSchema>;

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
  if (refusedSchema.safeParse(data).success) return { tooLarge: true } as const;
  return { tooLarge: false, created: createdSchema.parse(data) } as const;
}

async function renderFile(request: ExportRequest, created: CreatedAnswer): Promise<Buffer> {
  const columns = exportColumns(request.kind);
  const records = exportRowsOf(created.rows);
  return request.format === 'xlsx'
    ? toXlsx(columns, records, created.watermark)
    : Buffer.from(toCsv(columns, records, created.watermark), 'utf8');
}

function isPayloadTooLarge(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const status = 'statusCode' in error ? error.statusCode : 'status' in error ? error.status : null;
  return String(status) === PAYLOAD_TOO_LARGE;
}

// Review of PR #63, M1: rpc_create_export counted and recorded an export whose file never reached the bucket. This
// marks it failed, gives its hit on the hourly cap back and audits the failure (20261031080000_export_failures.sql).
function failExport(
  adminClient: DatabaseClient,
  ctx: StaffContext,
  exportId: string,
  reason: ExportFailureReason,
): Promise<boolean> {
  return resultOf(
    adminClient.rpc('svc_fail_export', {
      p_export_id: exportId,
      p_actor_id: ctx.userId,
      p_reason: reason,
    }),
  );
}

interface ExportFile {
  exportId: string;
  path: string;
  body: Buffer;
  contentType: string;
}

// The row learns where its file is: only a row of the requester's whose path is still unset is written, so nothing
// here can point another export at this file. A file the row could not learn about is removed again (review of
// PR #63, M2), so no file outlives its export unseen.
async function recordFile(adminClient: DatabaseClient, ctx: StaffContext, file: ExportFile) {
  const { error } = await adminClient
    .from('exports')
    .update({ storage_path: file.path, downloaded_at: new Date().toISOString() })
    .eq('id', file.exportId)
    .eq('requested_by', ctx.userId)
    .is('storage_path', null);
  if (!error) return;
  await adminClient.storage.from(DOCUMENTS_BUCKET).remove([file.path]);
  await failExport(adminClient, ctx, file.exportId, 'record_failed');
  throw error;
}

// The file goes into the requester's own folder. False when it is too big for the bucket, measured first or refused
// by Storage; any other refusal fails the export and is passed on.
async function storeFile(
  adminClient: DatabaseClient,
  ctx: StaffContext,
  file: ExportFile,
): Promise<boolean> {
  if (file.body.byteLength > EXPORT_FILE_MAX_BYTES) {
    await failExport(adminClient, ctx, file.exportId, 'too_large');
    return false;
  }
  const upload = await adminClient.storage
    .from(DOCUMENTS_BUCKET)
    .upload(file.path, file.body, { contentType: file.contentType, upsert: false });
  if (upload.error) {
    const isTooLarge = isPayloadTooLarge(upload.error);
    await failExport(adminClient, ctx, file.exportId, isTooLarge ? 'too_large' : 'upload_failed');
    if (isTooLarge) return false;
    throw upload.error;
  }
  await recordFile(adminClient, ctx, file);
  return true;
}

async function renderOrFail(
  adminClient: DatabaseClient,
  ctx: StaffContext,
  request: ExportRequest,
  created: CreatedAnswer,
): Promise<Buffer> {
  try {
    return await renderFile(request, created);
  } catch (error) {
    await failExport(adminClient, ctx, created.export_id, 'render_failed');
    throw error;
  }
}

// Task P4.6.02 (docs/Security.md §7.5, DATA-06): the export is decided and recorded by rpc_create_export under the
// staff member's session (role, AAL2, RW, caps, rate limit, the exports row, export_downloaded, the audit row); this
// renders its rows as CSV or XLSX with the watermark, stores the file for 24 hours and hands back a 300-second link.
// A file that cannot be stored fails the export (svc_fail_export) instead of leaving it counted and recorded.
export async function createExport(
  ctx: StaffContext,
  request: ExportRequest,
): Promise<ExportOutcome> {
  const answer = await callCreateExport(request);
  if (answer.tooLarge) return { kind: 'too_large' };
  const { export_id: exportId, row_count: rowCount } = answer.created;
  const adminClient = createSupabaseAdminClient();
  const body = await renderOrFail(adminClient, ctx, request, answer.created);
  const path = exportStoragePath(
    ctx.userId,
    exportFileName(request.kind, request.format, new Date(), exportId),
  );
  const contentType = exportContentType(request.format);
  if (!(await storeFile(adminClient, ctx, { exportId, path, body, contentType })))
    return { kind: 'file_too_large' };
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

async function recordRepeatDownload(
  adminClient: DatabaseClient,
  ctx: StaffContext,
  row: StoredExport,
): Promise<void> {
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
// the session may not see it or it is gone. Counted per staff member before anything is read or written (review of
// PR #63, Low), so a loop over the link cannot flood security_events.
export async function exportDownloadUrl(
  ctx: StaffContext,
  kind: ExportKind,
  exportId: string,
): Promise<string | null> {
  const adminClient = createSupabaseAdminClient();
  const limit = { name: 'export_download:user', subject: ctx.userId } as const;
  if (!(await withinRateLimits(adminClient, [limit]))) throw new AppError('RATE_LIMITED');
  const row = await readOwnExport(kind, exportId);
  if (row === null || row.storage_path === null) return null;
  await recordRepeatDownload(adminClient, ctx, row);
  return createDocumentSignedUrl(
    adminClient,
    row.storage_path,
    'export',
    exportDownloadName(row.storage_path),
  );
}
