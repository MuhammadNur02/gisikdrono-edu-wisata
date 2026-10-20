import { LOGIN_NOTICE_PARAM, LOGIN_PATH } from '@/config/auth';
import { requestIdFrom } from '@/lib/logger';
import { isSameOriginRequest } from '@/lib/utils/same-origin';
import { seeOther } from '@/lib/utils/see-other';
import { readStaffSession } from '@/server/auth/guards';
import { signOutEverywhere } from '@/server/services/auth-service';
import { recordSessionRevokeFailure } from '@/server/services/staff-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const FORBIDDEN = 403;

// docs/Security.md §5.4: `Keluar` posts here and ends every session of the account. POST only, from this site only,
// so another page cannot sign a staff member out behind their back; the auth cookies leave with Max-Age=0. When
// Supabase Auth could not end the other sessions, the staff member is told so and the failure is recorded (S1 of the
// PR #17 review); the session is read first, because afterwards nobody is signed in to name in the event.
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return new Response(null, { status: FORBIDDEN });
  const session = await readStaffSession();
  if (await signOutEverywhere()) return seeOther(LOGIN_PATH);

  if (session) {
    await recordSessionRevokeFailure(session.ctx, 'sign_out', requestIdFrom(request.headers));
  }
  return seeOther(`${LOGIN_PATH}?${LOGIN_NOTICE_PARAM}=signed-out-here-only`);
}
