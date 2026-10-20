import {
  LOGIN_NOTICE_PARAM,
  LOGIN_PATH,
  RESET_PASSWORD_PATH,
  type LoginNotice,
} from '@/config/auth';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { clientIpFrom } from '@/lib/utils/client-ip';
import { seeOther } from '@/lib/utils/see-other';
import { openRecoverySession } from '@/server/services/auth-service';
import { withinAuthCallbackLimit } from '@/server/services/staff-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const TOKEN_HASH_PARAM = 'token_hash';
const TYPE_PARAM = 'type';
const RECOVERY_TYPE = 'recovery';
const TOKEN_HASH_MAX_LENGTH = 512;

// Our own per-IP count comes before Supabase Auth is asked: Auth sees every verification arrive from this server's
// IP, so its own per-IP limit is shared by every staff member (RV-M1 of the independent review of PR #17). The limit
// fails closed, and either way the link is still unused.
async function isWithinLimit(request: Request): Promise<boolean> {
  try {
    return await withinAuthCallbackLimit(clientIpFrom(request.headers));
  } catch {
    createLogger(requestIdFrom(request.headers)).error('internal_error', {
      route: 'auth/callback',
      source: 'rate_limit',
    });
    return false;
  }
}

// The one address Supabase Auth's emails link back to (docs/Security.md APP-13). The only link today is the recovery
// email of supabase/templates/recovery.html, whose token_hash opens a recovery session in whichever browser opens it
// (F1 of the PR #17 review); /reset-password then asks for the TOTP code. The destination is fixed here, never taken
// from the link, so the callback cannot be turned into an open redirect.
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get(TOKEN_HASH_PARAM);
  const notice = (name: LoginNotice) => `${LOGIN_PATH}?${LOGIN_NOTICE_PARAM}=${name}`;
  const isRecoveryLink =
    tokenHash !== null &&
    tokenHash.length <= TOKEN_HASH_MAX_LENGTH &&
    searchParams.get(TYPE_PARAM) === RECOVERY_TYPE;
  if (!isRecoveryLink) return seeOther(notice('link-expired'));
  if (!(await isWithinLimit(request))) return seeOther(notice('link-try-later'));

  return seeOther(
    (await openRecoverySession(tokenHash)) ? RESET_PASSWORD_PATH : notice('link-expired'),
  );
}
