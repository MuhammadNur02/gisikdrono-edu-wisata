import 'server-only';

import type { z } from 'zod';

import { mapError, resultResponse } from '@/lib/errors';
import { readJsonBody } from '@/lib/utils/json-body';
import { isSameOriginRequest } from '@/lib/utils/same-origin';

// The opening every staff route handler that changes something shares (CLAUDE.md §5.4, docs/Security.md
// APP-12): the Origin must be the site's own, the JSON body stays under its cap, and zod has the last word on
// its shape. The route decides who may go on afterwards.

const FORBIDDEN = 403;

export type StaffRequest<Input> = { ok: true; input: Input } | { ok: false; response: Response };

export async function readStaffRequest<Input>(
  request: Request,
  schema: z.ZodType<Input>,
  limitBytes: number,
): Promise<StaffRequest<Input>> {
  if (!isSameOriginRequest(request)) {
    return { ok: false, response: new Response(null, { status: FORBIDDEN }) };
  }
  const body = await readJsonBody(request, limitBytes);
  if (!body.ok) return { ok: false, response: new Response(null, { status: body.status }) };
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return { ok: false, response: resultResponse(await mapError(parsed.error)) };
  return { ok: true, input: parsed.data };
}
