import { SCAN_REQUEST_BODY_LIMIT_BYTES } from '@/config/scanner';
import { fail, mapError, resultResponse } from '@/lib/errors';
import { clientIpFrom } from '@/lib/utils/client-ip';
import { isSameOriginRequest } from '@/lib/utils/same-origin';
import { readStaffRequest } from '@/lib/utils/staff-request';
import { scanRequestSchema } from '@/lib/validations/scanner';
import { requireAal2 } from '@/server/auth/guards';
import { verifyScan, type GateOutcome } from '@/server/services/gate-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const NO_STORE = 'private, no-store';
const FORBIDDEN = 403;
const TOO_MANY_REQUESTS = 429;
const SERVICE_UNAVAILABLE = 503;

// A slowed-down officer hears how long to wait when the database knows (src/lib/scanner/verify-client.ts reads it).
function slowedResponse(retryAfterSeconds: number | null): Response {
  const response = resultResponse(fail('RATE_LIMITED'));
  const headers = new Headers(response.headers);
  if (retryAfterSeconds !== null) headers.set('Retry-After', String(retryAfterSeconds));
  return new Response(response.body, { status: TOO_MANY_REQUESTS, headers });
}

function outcomeResponse(outcome: GateOutcome): Response {
  if (outcome.kind === 'slowed') return slowedResponse(outcome.retryAfterSeconds);
  if (outcome.kind === 'unavailable') {
    return Response.json(
      { status: 'unavailable' },
      { status: SERVICE_UNAVAILABLE, headers: { 'Cache-Control': NO_STORE } },
    );
  }
  return Response.json(outcome.response, { headers: { 'Cache-Control': NO_STORE } });
}

// Task P4.4.02 (CLAUDE.md §5.4, §7.4; docs/Security.md §9.2, §9.3; QR-06, RL-03, AZ-14, HDR-03): the scanner's one way
// to the server, the stable JSON contract of src/types/scanner.ts. Same Origin, then a staff session at AAL2, so a
// signed-out scanner hears 401 whatever it sent (review of PR #54, L2), then a capped body and the strict schema; the
// rest runs in gate-service.ts on that session, never the service role.
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return new Response(null, { status: FORBIDDEN });
  const guard = await requireAal2();
  if (!guard.ok) return resultResponse(guard);
  const read = await readStaffRequest(request, scanRequestSchema, SCAN_REQUEST_BODY_LIMIT_BYTES);
  if (!read.ok) return read.response;

  try {
    const device = {
      userAgent: request.headers.get('user-agent'),
      ip: clientIpFrom(request.headers),
    };
    return outcomeResponse(await verifyScan(read.input, device, guard.ctx.userId));
  } catch (error) {
    return resultResponse(await mapError(error));
  }
}
