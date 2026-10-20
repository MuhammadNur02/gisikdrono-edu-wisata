import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  AUTH_COOKIE_OPTIONS,
  DASHBOARD_PATH,
  LOGIN_PATH,
  MFA_ENROLL_PATH,
  MFA_VERIFY_PATH,
} from '@/config/auth';
import {
  buildContentSecurityPolicy,
  isPrivateRoute,
  NONCE_HEADER,
  permissionsPolicyFor,
} from '@/lib/csp';
import { publicEnv } from '@/lib/public-env';
import { canonicalGalleryPathFor } from '@/lib/utils/gallery-search';
import { isPathUnder, PUBLIC_PATHS } from '@/lib/utils/paths';
import { pathWithNext } from '@/lib/utils/staff-paths';

const NONCE_BYTES = 16;
// Temporary on purpose: the page cap (GALLERY_MAX_PAGES) may change, and a browser keeps a permanent one.
const TEMPORARY_REDIRECT = 307;

type ContinueRequest = () => NextResponse;

// Where a /dashboard request is sent before it may go on: signing in, or the TOTP step of the session.
type SignInStep = typeof LOGIN_PATH | typeof MFA_VERIFY_PATH | typeof MFA_ENROLL_PATH | null;

type AssuranceLevels = { currentLevel: string | null; nextLevel: string | null } | null;

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  return btoa(String.fromCharCode(...bytes));
}

// Next.js reads the nonce from the request's CSP header and stamps it on its own script tags.
// Public ISR pages have no nonce, so their request goes through untouched.
function forwardRequest(request: NextRequest, nonce: string | null, csp: string): NextResponse {
  if (nonce === null) return NextResponse.next({ request });
  const headers = new Headers(request.headers);
  headers.set(NONCE_HEADER, nonce);
  headers.set('Content-Security-Policy', csp);
  return NextResponse.next({ request: { headers } });
}

// docs/Security.md §5.2 (AUTH-03, AUTH-13): a verified factor not used yet in this session asks for the code; no
// verified factor at all enrols one, since profiles.mfa_required is true for every staff account.
function mfaStepFor(levels: AssuranceLevels): SignInStep {
  if (!levels || levels.currentLevel === 'aal2') return null;
  return levels.nextLevel === 'aal2' ? MFA_VERIFY_PATH : MFA_ENROLL_PATH;
}

// Refreshes the Supabase session cookie and says where a dashboard request has to go first. getUser() asks Supabase
// Auth, so an expired or forged cookie never counts as a user (CLAUDE.md §6.2). The assurance level only steers
// this redirect; the dashboard layout's requireRole() and the AAL2 RLS policies decide what opens.
async function signInStepFor(
  request: NextRequest,
  response: { current: NextResponse },
  continueRequest: ContinueRequest,
): Promise<SignInStep> {
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
  if (!data.user) return LOGIN_PATH;
  if (!isPathUnder(request.nextUrl.pathname, DASHBOARD_PATH)) return null;
  const { data: levels } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return mfaStepFor(levels);
}

// A convenience redirect only; who may see what is decided by the guards and RLS (CLAUDE.md §2.3).
// The refreshed (or cleared) auth cookies travel along so the browser does not keep a stale session.
function redirectToStep(request: NextRequest, step: string, refreshed: NextResponse): NextResponse {
  const target = pathWithNext(step, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const redirect = NextResponse.redirect(new URL(target, request.url));
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

// /galeri?halaman=99999, ?halaman=abc, ?filter=xyz and the like get a real redirect to the valid address here,
// before the page streams (decision of 2026-10-18, docs/StyleGuide.md §5.11).
function redirectMalformedGallery(request: NextRequest): NextResponse | null {
  if (request.nextUrl.pathname !== PUBLIC_PATHS.gallery) return null;
  const target = canonicalGalleryPathFor(request.nextUrl.searchParams);
  if (target === null) return null;
  // nextUrl keeps the host the visitor asked for; only the query changes.
  const destination = request.nextUrl.clone();
  destination.search = new URL(target, request.nextUrl.origin).search;
  return NextResponse.redirect(destination, TEMPORARY_REDIRECT);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = isPrivateRoute(pathname) ? createNonce() : null;
  const csp = buildContentSecurityPolicy({
    nonce,
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    isDevelopment: publicEnv.NODE_ENV !== 'production',
  });
  const galleryRedirect = redirectMalformedGallery(request);
  if (galleryRedirect) return withSecurityHeaders(galleryRedirect, pathname, csp);
  const continueRequest = () => forwardRequest(request, nonce, csp);
  const response = { current: continueRequest() };
  const step = await signInStepFor(request, response, continueRequest);

  const result =
    step !== null && isPathUnder(pathname, DASHBOARD_PATH)
      ? redirectToStep(request, step, response.current)
      : response.current;
  return withSecurityHeaders(result, pathname, csp);
}

export const config = {
  // Webhooks, jobs and the health check authenticate themselves and never carry a staff session.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons/|fonts/|og/|map/|api/webhooks|api/jobs|api/health|monitoring).*)',
  ],
};
