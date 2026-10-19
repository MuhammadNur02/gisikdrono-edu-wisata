import { UPLOAD_REQUEST_BODY_LIMIT_BYTES } from '@/config/uploads';
import { fail, mapError, ok, resultResponse } from '@/lib/errors';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { failureFor } from '@/lib/uploads/outcomes';
import { readStaffRequest } from '@/lib/utils/staff-request';
import { signBookletPagesSchema, type SignBookletPagesInput } from '@/lib/validations/upload';
import { requireUser, type StaffContext } from '@/server/auth/guards';
import { checkUploadAccess, signBookletPages } from '@/server/services/upload-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Counting the pages reads the published booklet PDF back, up to 50 MB, and signs up to 100 URLs.
export const maxDuration = 60;

type Log = ReturnType<typeof createLogger>;

async function signPagesFor(ctx: StaffContext, input: SignBookletPagesInput, log: Log) {
  if (!(await checkUploadAccess(ctx, input.rwId, { step: 'sign-pages' }))) {
    log.warn('upload_rejected', { step: 'sign-pages', reason: 'forbidden', actorId: ctx.userId });
    return fail('FORBIDDEN');
  }
  const outcome = await signBookletPages(ctx, input);
  if (outcome.ok) return ok(outcome.data);
  log.info('upload_rejected', { step: 'sign-pages', reason: outcome.problem, actorId: ctx.userId });
  return failureFor(outcome.problem);
}

// docs/Security.md §8.4, decision of 2026-10-18: one signed upload URL per page of a booklet whose PDF finalize
// has published, as many as that PDF has pages (at most 100), counted as one signature against the hourly limit.
// Each path names its booklet, its page and the page count, so finalize can turn it into that page only.
export async function POST(request: Request): Promise<Response> {
  const read = await readStaffRequest(
    request,
    signBookletPagesSchema,
    UPLOAD_REQUEST_BODY_LIMIT_BYTES,
  );
  if (!read.ok) return read.response;
  const guard = await requireUser();
  if (!guard.ok) return resultResponse(guard);

  try {
    const log = createLogger(requestIdFrom(request.headers));
    return resultResponse(await signPagesFor(guard.ctx, read.input, log));
  } catch (error) {
    return resultResponse(await mapError(error));
  }
}
