import { LOGIN_NOTICE_PARAM, LOGIN_PATH, RESET_PASSWORD_PATH } from '@/config/auth';
import { seeOther } from '@/lib/utils/see-other';
import { openRecoverySession } from '@/server/services/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const TOKEN_HASH_PARAM = 'token_hash';
const TYPE_PARAM = 'type';
const RECOVERY_TYPE = 'recovery';
const TOKEN_HASH_MAX_LENGTH = 512;

// The one address Supabase Auth's emails link back to (docs/Security.md APP-13). The only link today is the recovery
// email of supabase/templates/recovery.html, whose token_hash opens a recovery session in whichever browser opens it
// (F1 of the PR #17 review); /reset-password then asks for the TOTP code. The destination is fixed here, never taken
// from the link, so the callback cannot be turned into an open redirect.
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get(TOKEN_HASH_PARAM);
  const expired = `${LOGIN_PATH}?${LOGIN_NOTICE_PARAM}=link-expired`;
  const isRecoveryLink =
    tokenHash !== null &&
    tokenHash.length <= TOKEN_HASH_MAX_LENGTH &&
    searchParams.get(TYPE_PARAM) === RECOVERY_TYPE;
  if (!isRecoveryLink) return seeOther(expired);

  return seeOther((await openRecoverySession(tokenHash)) ? RESET_PASSWORD_PATH : expired);
}
