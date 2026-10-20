import { LOGIN_PATH } from '@/config/auth';
import { isSameOriginRequest } from '@/lib/utils/same-origin';
import { seeOther } from '@/lib/utils/see-other';
import { signOutEverywhere } from '@/server/services/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const FORBIDDEN = 403;

// docs/Security.md §5.4: `Keluar` posts here and ends every session of the account. POST only, from this site only,
// so another page cannot sign a staff member out behind their back; the auth cookies leave with Max-Age=0.
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return new Response(null, { status: FORBIDDEN });
  await signOutEverywhere();
  return seeOther(LOGIN_PATH);
}
