import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { AUTH_COOKIE_OPTIONS, DASHBOARD_PATH, LOGIN_PATH, NEXT_PARAM } from '@/config/auth';
import { buildContentSecurityPolicy, permissionsPolicyFor } from '@/lib/csp';
import { publicEnv } from '@/lib/public-env';

const NONCE_BYTES = 16;

type ContinueRequest = () => NextResponse;

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  return btoa(String.fromCharCode(...bytes));
}

// Next.js reads the nonce from the request's CSP header and stamps it on its own script tags.
function forwardWithNonce(request: NextRequest, nonce: string, csp: string): NextResponse {
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  return NextResponse.next({ request: { headers } });
}

// Refreshes the Supabase session cookie and returns whether someone is signed in. getUser() asks
// Supabase Auth, so an expired or forged cookie never counts as a user (CLAUDE.md §6.2).
async function refreshSession(
  request: NextRequest,
  response: { current: NextResponse },
  continueRequest: ContinueRequest,
) {
  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response.current = continueRequest();
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
// The refreshed (or cleared) auth cookies travel along so the browser does not keep a stale session.
function redirectToLogin(request: NextRequest, refreshed: NextResponse): NextResponse {
  const loginUrl = new URL(LOGIN_PATH, request.url);
  loginUrl.searchParams.set(NEXT_PARAM, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const redirect = NextResponse.redirect(loginUrl);
  for (const cookie of refreshed.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

// docs/Security.md §8.2: staging only reports CSP violations until the policy is proven (P5.4.01).
function withSecurityHeaders(response: NextResponse, pathname: string, csp: string) {
  const cspHeader =
    publicEnv.VERCEL_ENV === 'preview'
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';
  response.headers.set(cspHeader, csp);
  response.headers.set('Permissions-Policy', permissionsPolicyFor(pathname));
  return response;
}

export async function middleware(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    isDevelopment: publicEnv.NODE_ENV !== 'production',
  });
  const continueRequest = () => forwardWithNonce(request, nonce, csp);
  const response = { current: continueRequest() };
  const isSignedIn = await refreshSession(request, response, continueRequest);

  const { pathname } = request.nextUrl;
  const result =
    !isSignedIn && isDashboardPath(pathname)
      ? redirectToLogin(request, response.current)
      : response.current;
  return withSecurityHeaders(result, pathname, csp);
}

export const config = {
  // Webhooks, jobs and the health check authenticate themselves and never carry a staff session.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|fonts/|og/|map/|api/webhooks|api/jobs|api/health|monitoring).*)',
  ],
};
