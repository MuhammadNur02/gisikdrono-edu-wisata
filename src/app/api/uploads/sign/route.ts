import { UPLOAD_REQUEST_BODY_LIMIT_BYTES } from '@/config/uploads';
import { fail, mapError, ok, resultResponse } from '@/lib/errors';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { readJsonBody } from '@/lib/utils/json-body';
import { isSameOriginRequest } from '@/lib/utils/same-origin';
import { signUploadSchema, type SignUploadInput } from '@/lib/validations/upload';
import { hasUploadAccess, requireUser, type StaffContext } from '@/server/auth/guards';
import { failureFor, recordUploadRefusal, signUpload } from '@/server/services/upload-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const FORBIDDEN = 403;

type Log = ReturnType<typeof createLogger>;

async function signFor(ctx: StaffContext, input: SignUploadInput, log: Log) {
  if (!hasUploadAccess(ctx, input.rwId)) {
    await recordUploadRefusal(ctx, {
      rwId: input.rwId,
      reason: 'forbidden',
      details: { step: 'sign' },
    });
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
  if (!isSameOriginRequest(request)) return new Response(null, { status: FORBIDDEN });
  const body = await readJsonBody(request, UPLOAD_REQUEST_BODY_LIMIT_BYTES);
  if (!body.ok) return new Response(null, { status: body.status });
  const parsed = signUploadSchema.safeParse(body.value);
  if (!parsed.success) return resultResponse(await mapError(parsed.error));

  const guard = await requireUser();
  if (!guard.ok) return resultResponse(guard);

  try {
    const log = createLogger(requestIdFrom(request.headers));
    return resultResponse(await signFor(guard.ctx, parsed.data, log));
  } catch (error) {
    return resultResponse(await mapError(error));
  }
}
