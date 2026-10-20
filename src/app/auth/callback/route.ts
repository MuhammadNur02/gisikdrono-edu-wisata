import { DASHBOARD_PATH, LOGIN_NOTICE_PARAM, LOGIN_PATH, RESET_PASSWORD_PATH } from '@/config/auth';
import { seeOther } from '@/lib/utils/see-other';
import { exchangeAuthCode } from '@/server/services/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const CODE_PARAM = 'code';
const CODE_MAX_LENGTH = 512;

// The one address Supabase Auth sends links back to (docs/Security.md APP-13). A recovery link goes on to set a new
// password; any other link lands on the dashboard, whose gate asks for the TOTP code first. The destination is fixed
// here, never taken from the link, so the callback cannot be turned into an open redirect.
export async function GET(request: Request): Promise<Response> {
  const code = new URL(request.url).searchParams.get(CODE_PARAM);
  const expired = `${LOGIN_PATH}?${LOGIN_NOTICE_PARAM}=link-expired`;
  if (!code || code.length > CODE_MAX_LENGTH) return seeOther(expired);

  const exchanged = await exchangeAuthCode(code);
  if (!exchanged) return seeOther(expired);
  return seeOther(exchanged.isRecovery ? RESET_PASSWORD_PATH : DASHBOARD_PATH);
}
