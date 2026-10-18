import { UPLOAD_REQUEST_BODY_LIMIT_BYTES } from '@/config/uploads';
import { fail, mapError, ok, resultResponse } from '@/lib/errors';
import { createLogger, requestIdFrom } from '@/lib/logger';
import {
  isTargetAllowed,
  parseQuarantinePath,
  type MediaTarget,
  type QuarantineUpload,
} from '@/lib/uploads/paths';
import { readJsonBody } from '@/lib/utils/json-body';
import { isSameOriginRequest } from '@/lib/utils/same-origin';
import { finalizeUploadSchema } from '@/lib/validations/upload';
import { hasUploadAccess, requireUser, type StaffContext } from '@/server/auth/guards';
import { failureFor, finalizeUpload, recordUploadRefusal } from '@/server/services/upload-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Downloading, re-encoding or scanning a 50 MB booklet takes longer than a webhook's 15 s.
export const maxDuration = 60;

const FORBIDDEN = 403;

type Log = ReturnType<typeof createLogger>;

// The prefix sign bound is checked again here, because finalize writes public-media with the service role
// (security review of PR #5, docs/Security.md UPL-04).
async function finalizeFor(
  ctx: StaffContext,
  upload: QuarantineUpload,
  target: MediaTarget,
  log: Log,
) {
  if (!hasUploadAccess(ctx, upload.rwId)) {
    const details = { step: 'finalize', owner: upload.owner };
    await recordUploadRefusal(ctx, { rwId: upload.rwId, reason: 'forbidden', details });
    log.warn('upload_rejected', { ...details, reason: 'forbidden', actorId: ctx.userId });
    return fail('FORBIDDEN');
  }
  const outcome = await finalizeUpload(ctx, upload, target);
  if (outcome.ok) return ok(outcome.data);
  log.warn('upload_rejected', {
    step: 'finalize',
    reason: outcome.problem,
    purpose: target.purpose,
    actorId: ctx.userId,
  });
  return failureFor(outcome.problem);
}

// docs/Security.md §8.4 step 3: checks the quarantined file's bytes, re-encodes an image or scans a booklet
// PDF into public-media, deletes the quarantine object and records every refusal as upload_rejected.
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return new Response(null, { status: FORBIDDEN });
  const body = await readJsonBody(request, UPLOAD_REQUEST_BODY_LIMIT_BYTES);
  if (!body.ok) return new Response(null, { status: body.status });
  const parsed = finalizeUploadSchema.safeParse(body.value);
  if (!parsed.success) return resultResponse(await mapError(parsed.error));
  const { path, ...target } = parsed.data;
  const upload = parseQuarantinePath(path);
  if (!upload || !isTargetAllowed(upload, target)) return resultResponse(fail('VALIDATION'));

  const guard = await requireUser();
  if (!guard.ok) return resultResponse(guard);

  try {
    const log = createLogger(requestIdFrom(request.headers));
    return resultResponse(await finalizeFor(guard.ctx, upload, target, log));
  } catch (error) {
    return resultResponse(await mapError(error));
  }
}
