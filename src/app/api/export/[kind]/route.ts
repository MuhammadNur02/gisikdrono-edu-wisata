import { z } from 'zod';

import { EXPORT_REQUEST_BODY_LIMIT_BYTES } from '@/config/exports';
import { DB_ENUMS } from '@/db/enums';
import { exportsCopy } from '@/lib/copy/exports';
import { fail, mapError, ok, resultResponse } from '@/lib/errors';
import { isSameOriginRequest } from '@/lib/utils/same-origin';
import { readStaffRequest } from '@/lib/utils/staff-request';
import { exportBodySchemaFor } from '@/lib/validations/export';
import { requireAal2, type GuardResult } from '@/server/auth/guards';
import { createExport, exportDownloadUrl } from '@/server/services/export-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// CLAUDE.md §5.4: an export renders up to 50 000 rows.
export const maxDuration = 60;

const NOT_FOUND = 404;
const FORBIDDEN = 403;
const SEE_OTHER = 303;
const UNPROCESSABLE = 422;
const NO_STORE = 'private, no-store';

const kindSchema = z.enum(DB_ENUMS.export_kind);
const exportIdSchema = z.uuid();

type ExportKind = z.infer<typeof kindSchema>;

interface ExportRouteContext {
  params: Promise<{ kind: string }>;
}

function plainStatus(status: number): Response {
  return new Response(null, { status, headers: { 'Cache-Control': NO_STORE } });
}

// docs/Security.md §7.5: a staff session at AAL2; the superadmin exports every kind, an RW admin the attendance of
// their own RW only. rpc_create_export checks the same again in the database.
async function requireExporter(kind: ExportKind): Promise<GuardResult> {
  const guard = await requireAal2();
  if (!guard.ok) return guard;
  if (guard.ctx.role === 'superadmin' || kind === 'attendance') return guard;
  return fail('FORBIDDEN');
}

// 422 for a period past 50 000 rows, with the words the form shows under the period.
function tooLargeResponse(): Response {
  const result = fail('VALIDATION', { to: [exportsCopy.tooLarge] }, exportsCopy.tooLarge);
  return Response.json(result, { status: UNPROCESSABLE, headers: { 'Cache-Control': NO_STORE } });
}

// Task P4.6.02 (CLAUDE.md §5.4, Export row; DATA-06, AUD-04, REC-07): a new export. Same Origin, the exporter's session,
// a capped body under the strict schema, then export-service.ts, whose RPC records it; the answer carries the
// 300-second link to the file and nothing keeps it. 429 past 10 an hour, 422 past 50 000 rows.
export async function POST(request: Request, context: ExportRouteContext): Promise<Response> {
  const kind = kindSchema.safeParse((await context.params).kind);
  if (!kind.success) return plainStatus(NOT_FOUND);
  if (!isSameOriginRequest(request)) return plainStatus(FORBIDDEN);
  const guard = await requireExporter(kind.data);
  if (!guard.ok) return resultResponse(guard);
  const read = await readStaffRequest(
    request,
    exportBodySchemaFor(kind.data),
    EXPORT_REQUEST_BODY_LIMIT_BYTES,
  );
  if (!read.ok) return read.response;

  try {
    const outcome = await createExport(guard.ctx, read.input);
    return outcome.kind === 'too_large' ? tooLargeResponse() : resultResponse(ok(outcome.created));
  } catch (error) {
    return resultResponse(await mapError(error));
  }
}

// Task P4.6.03: the history's "Unduh lagi", `?id=<export id>`, a 303 to a fresh 300-second link while the export is
// within its 24 hours; 404 for one the session may not see or that is gone.
export async function GET(request: Request, context: ExportRouteContext): Promise<Response> {
  const kind = kindSchema.safeParse((await context.params).kind);
  if (!kind.success) return plainStatus(NOT_FOUND);
  const guard = await requireExporter(kind.data);
  if (!guard.ok) return resultResponse(guard);
  const exportId = exportIdSchema.safeParse(new URL(request.url).searchParams.get('id'));
  if (!exportId.success) return plainStatus(NOT_FOUND);

  try {
    const url = await exportDownloadUrl(guard.ctx, kind.data, exportId.data);
    if (url === null) return plainStatus(NOT_FOUND);
    return new Response(null, {
      status: SEE_OTHER,
      headers: { Location: url, 'Cache-Control': NO_STORE, 'Referrer-Policy': 'no-referrer' },
    });
  } catch (error) {
    return resultResponse(await mapError(error));
  }
}
