import {
  LOGIN_NOTICE_PARAM,
  LOGIN_PATH,
  ONBOARDING_PATH,
  RESET_PASSWORD_PATH,
  type LoginNotice,
} from '@/config/auth';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { clientIpFrom } from '@/lib/utils/client-ip';
import { seeOther } from '@/lib/utils/see-other';
import { openEmailLinkSession, type EmailLinkType } from '@/server/services/auth-service';
import { withinAuthCallbackLimit } from '@/server/services/staff-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const TOKEN_HASH_PARAM = 'token_hash';
const TYPE_PARAM = 'type';
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

// The one address Supabase Auth's emails link back to (docs/Security.md APP-13), with a fixed destination for each
// kind of link, never one taken from the link, so the callback cannot be turned into an open redirect:
//   recovery  supabase/templates/recovery.html; its token_hash opens a recovery session in whichever browser opens it
//             (F1 of the PR #17 review), and /reset-password then asks for the TOTP code.
//   invite    supabase/templates/invite.html (Task P4.8.01); it opens a session for the mailbox only, and /onboarding
//             asks for the invite code before anything else.
const DESTINATIONS: Record<EmailLinkType, string> = {
  recovery: RESET_PASSWORD_PATH,
  invite: ONBOARDING_PATH,
};

function emailLinkTypeOf(value: string | null): EmailLinkType | null {
  return value === 'recovery' || value === 'invite' ? value : null;
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get(TOKEN_HASH_PARAM);
  const linkType = emailLinkTypeOf(searchParams.get(TYPE_PARAM));
  const notice = (name: LoginNotice) => `${LOGIN_PATH}?${LOGIN_NOTICE_PARAM}=${name}`;
  if (tokenHash === null || tokenHash.length > TOKEN_HASH_MAX_LENGTH || linkType === null) {
    return seeOther(notice('link-expired'));
  }
  if (!(await isWithinLimit(request))) return seeOther(notice('link-try-later'));

  return seeOther(
    (await openEmailLinkSession(linkType, tokenHash))
      ? DESTINATIONS[linkType]
      : notice('link-expired'),
  );
}
