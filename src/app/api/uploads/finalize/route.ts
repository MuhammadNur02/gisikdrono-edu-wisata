import { UPLOAD_REQUEST_BODY_LIMIT_BYTES } from '@/config/uploads';
import { fail, mapError, ok, resultResponse } from '@/lib/errors';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { failureFor } from '@/lib/uploads/outcomes';
import {
  isTargetAllowed,
  parseQuarantinePath,
  type MediaTarget,
  type QuarantineUpload,
} from '@/lib/uploads/paths';
import { readStaffRequest } from '@/lib/utils/staff-request';
import { finalizeUploadSchema } from '@/lib/validations/upload';
import { requireUser, type StaffContext } from '@/server/auth/guards';
import { checkUploadAccess, finalizeUpload } from '@/server/services/upload-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Downloading, re-encoding or scanning a 50 MB booklet takes longer than a webhook's 15 s.
export const maxDuration = 60;

type Log = ReturnType<typeof createLogger>;

// The prefix sign bound is checked again here, because finalize writes public-media with the service role
// (security review of PR #5, docs/Security.md UPL-04).
async function finalizeFor(
  ctx: StaffContext,
  upload: QuarantineUpload,
  target: MediaTarget,
  log: Log,
) {
  const details = { step: 'finalize', owner: upload.owner };
  if (!(await checkUploadAccess(ctx, upload.rwId, details, target.purpose))) {
    log.warn('upload_rejected', { ...details, reason: 'forbidden', actorId: ctx.userId });
    return fail('FORBIDDEN');
  }
  const outcome = await finalizeUpload(ctx, upload, target);
  const fields = { step: 'finalize', purpose: target.purpose, actorId: ctx.userId };
  if (!outcome.ok) {
    log.warn('upload_rejected', { ...fields, reason: outcome.problem });
    return failureFor(outcome.problem);
  }
  if (outcome.sanitized) log.info('upload_sanitized', { ...fields, kind: outcome.sanitized });
  return ok(outcome.data);
}

// docs/Security.md §8.4 step 3: checks the quarantined file's bytes, re-encodes an image or scans a booklet
// PDF into public-media, deletes the quarantine object and records every refusal as upload_rejected. A booklet
// page becomes the page its path was signed for and nothing else; a page outside its booklet never parses.
export async function POST(request: Request): Promise<Response> {
  const read = await readStaffRequest(
    request,
    finalizeUploadSchema,
    UPLOAD_REQUEST_BODY_LIMIT_BYTES,
  );
  if (!read.ok) return read.response;
  const { path, ...target } = read.input;
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
