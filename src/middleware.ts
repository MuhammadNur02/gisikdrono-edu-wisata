import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { AUTH_COOKIE_OPTIONS, DASHBOARD_PATH, LOGIN_PATH, NEXT_PARAM } from '@/config/auth';
import { publicEnv } from '@/lib/public-env';

// Refreshes the Supabase session cookie and returns whether someone is signed in. getUser() asks
// Supabase Auth, so an expired or forged cookie never counts as a user (CLAUDE.md §6.2).
async function refreshSession(request: NextRequest, response: { current: NextResponse }) {
  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response.current = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.current.cookies.set(name, value, options);
          }
        },
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  return data.user !== null;
}

function isDashboardPath(pathname: string): boolean {
  return pathname === DASHBOARD_PATH || pathname.startsWith(`${DASHBOARD_PATH}/`);
}

// A convenience redirect only; who may see what is decided by the guards and RLS (CLAUDE.md §2.3).
function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL(LOGIN_PATH, request.url);
  loginUrl.searchParams.set(NEXT_PARAM, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const response = { current: NextResponse.next({ request }) };
  const isSignedIn = await refreshSession(request, response);

  if (!isSignedIn && isDashboardPath(request.nextUrl.pathname)) return redirectToLogin(request);
  return response.current;
}

export const config = {
  // Webhooks, jobs and the health check authenticate themselves and never carry a staff session.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|fonts/|og/|map/|api/webhooks|api/jobs|api/health|monitoring).*)',
  ],
};
