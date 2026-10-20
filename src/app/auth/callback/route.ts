import { NextResponse } from 'next/server';

import { DASHBOARD_PATH, LOGIN_NOTICE_PARAM, LOGIN_PATH, RESET_PASSWORD_PATH } from '@/config/auth';
import { exchangeAuthCode } from '@/server/services/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const SEE_OTHER = 303;
const CODE_PARAM = 'code';
const CODE_MAX_LENGTH = 512;

function redirectTo(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), SEE_OTHER);
}

// The one address Supabase Auth sends links back to (docs/Security.md APP-13). A recovery link goes on to set a new
// password; any other link lands on the dashboard, whose gate asks for the TOTP code first. The destination is fixed
// here, never taken from the link, so the callback cannot be turned into an open redirect.
export async function GET(request: Request): Promise<NextResponse> {
  const code = new URL(request.url).searchParams.get(CODE_PARAM);
  const expired = `${LOGIN_PATH}?${LOGIN_NOTICE_PARAM}=link-expired`;
  if (!code || code.length > CODE_MAX_LENGTH) return redirectTo(request, expired);

  const exchanged = await exchangeAuthCode(code);
  if (!exchanged) return redirectTo(request, expired);
  return redirectTo(request, exchanged.isRecovery ? RESET_PASSWORD_PATH : DASHBOARD_PATH);
}
