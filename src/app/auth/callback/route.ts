import {
  EMAIL_LINK_CONTINUE_PATH,
  LOGIN_NOTICE_PARAM,
  LOGIN_PATH,
  ONBOARDING_PATH,
  RESET_PASSWORD_PATH,
  type EmailLinkType,
  type LoginNotice,
} from '@/config/auth';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { clientIpFrom } from '@/lib/utils/client-ip';
import { emailLinkQuery, parseEmailLink, type EmailLink } from '@/lib/utils/email-link';
import { readUpTo } from '@/lib/utils/json-body';
import { isSameOriginRequest } from '@/lib/utils/same-origin';
import { seeOther } from '@/lib/utils/see-other';
import { openEmailLinkSession } from '@/server/services/auth-service';
import { withinAuthCallbackLimit } from '@/server/services/staff-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const FORBIDDEN = 403;
const FORM_BODY_MAX_BYTES = 2048;

// The one address Supabase Auth's emails link back to (docs/Security.md APP-13), with a fixed destination for each
// kind of link, never one taken from the link, so the callback cannot be turned into an open redirect:
//   recovery  supabase/templates/recovery.html; /reset-password then asks for the TOTP code.
//   invite    supabase/templates/invite.html (Task P4.8.01); /onboarding asks for the invite code before anything.
const DESTINATIONS: Record<EmailLinkType, string> = {
  recovery: RESET_PASSWORD_PATH,
  invite: ONBOARDING_PATH,
};

function notice(name: LoginNotice): string {
  return `${LOGIN_PATH}?${LOGIN_NOTICE_PARAM}=${name}`;
}

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

// L2 of the review of PR #77: opening the link uses nothing. A mail scanner that follows it only reaches
// /auth/continue, whose button posts the link back here.
export function GET(request: Request): Response {
  const { searchParams } = new URL(request.url);
  const link = parseEmailLink(searchParams.get('token_hash'), searchParams.get('type'));
  if (!link) return seeOther(notice('link-expired'));
  return seeOther(`${EMAIL_LINK_CONTINUE_PATH}?${emailLinkQuery(link)}`);
}

// I77-4 of the review of PR #77: the body is read only up to its cap, whatever length it declares or leaves out.
async function postedLink(request: Request): Promise<EmailLink | null> {
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
    return null;
  }
  if (Number(request.headers.get('content-length') ?? 0) > FORM_BODY_MAX_BYTES) return null;
  const body = await readUpTo(request, FORM_BODY_MAX_BYTES);
  if (body === null) return null;
  const form = new URLSearchParams(body);
  return parseEmailLink(form.get('token_hash'), form.get('type'));
}

// The continue page's button: here the link is verified with verifyOtp, in whichever browser pressed it.
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return new Response(null, { status: FORBIDDEN });
  const link = await postedLink(request);
  if (!link) return seeOther(notice('link-expired'));
  if (!(await isWithinLimit(request))) return seeOther(notice('link-try-later'));

  return seeOther(
    (await openEmailLinkSession(link.type, link.tokenHash))
      ? DESTINATIONS[link.type]
      : notice('link-expired'),
  );
}
