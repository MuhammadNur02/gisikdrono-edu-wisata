import { UPLOAD_REQUEST_BODY_LIMIT_BYTES } from '@/config/uploads';
import { fail, mapError, ok, resultResponse } from '@/lib/errors';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { failureFor } from '@/lib/uploads/outcomes';
import { readStaffRequest } from '@/lib/utils/staff-request';
import { signUploadSchema, type SignUploadInput } from '@/lib/validations/upload';
import { requireUser, type StaffContext } from '@/server/auth/guards';
import { checkUploadAccess, signUpload } from '@/server/services/upload-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

type Log = ReturnType<typeof createLogger>;

async function signFor(ctx: StaffContext, input: SignUploadInput, log: Log) {
  if (!(await checkUploadAccess(ctx, input.rwId, { step: 'sign' }, null))) {
    log.warn('upload_rejected', { step: 'sign', reason: 'forbidden', actorId: ctx.userId });
    return fail('FORBIDDEN');
  }
  const outcome = await signUpload(ctx, input);
  if (outcome.ok) return ok(outcome.data);
  log.info('upload_rejected', { step: 'sign', reason: outcome.problem, actorId: ctx.userId });
  return failureFor(outcome.problem);
}

// docs/Security.md §8.4 step 1: a five-minute signed upload URL into uploads-quarantine, at a path this
// route makes (`rw-XX/<uuid v7>` or `kelurahan/<uuid v7>`) for an RW the officer may upload for.
export async function POST(request: Request): Promise<Response> {
  const read = await readStaffRequest(request, signUploadSchema, UPLOAD_REQUEST_BODY_LIMIT_BYTES);
  if (!read.ok) return read.response;
  const guard = await requireUser();
  if (!guard.ok) return resultResponse(guard);

  try {
    const log = createLogger(requestIdFrom(request.headers));
    return resultResponse(await signFor(guard.ctx, read.input, log));
  } catch (error) {
    return resultResponse(await mapError(error));
  }
}
