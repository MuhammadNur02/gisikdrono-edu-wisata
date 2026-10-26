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
  cspHeaderNameFor,
  isPrivateRoute,
  NONCE_HEADER,
  permissionsPolicyFor,
} from '@/lib/csp';
import { redirectGuestLink } from '@/lib/links/redirect';
import { publicEnv } from '@/lib/public-env';
import { canonicalGalleryPathFor } from '@/lib/utils/gallery-search';
import {
  guestDocumentRewriteFor,
  isPathUnder,
  PUBLIC_PATHS,
  rwRouteRewriteFor,
} from '@/lib/utils/paths';
import { isSameOriginRequest } from '@/lib/utils/same-origin';
import { pathWithNext } from '@/lib/utils/staff-paths';

const NONCE_BYTES = 16;
const MS_PER_SECOND = 1000;
// Temporary on purpose: the page cap (GALLERY_MAX_PAGES) may change, and a browser keeps a permanent one.
const TEMPORARY_REDIRECT = 307;
const FORBIDDEN = 403;
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);
const API_PATH = '/api';

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

// An RW page is served from its internal route folder while the visitor keeps the address they asked for
// (rwRouteRewriteFor). RW pages are public, so this request carries no nonce either. A guest's document address under
// its booking's pages is served by /api/documents the same way (guestDocumentRewriteFor), with its cookie.
function continueRequestFor(
  request: NextRequest,
  nonce: string | null,
  csp: string,
): ContinueRequest {
  const rewrite =
    rwRouteRewriteFor(request.nextUrl.pathname) ??
    guestDocumentRewriteFor(request.nextUrl.pathname);
  if (rewrite === null) return () => forwardRequest(request, nonce, csp);
  const destination = request.nextUrl.clone();
  destination.pathname = rewrite;
  return () => NextResponse.rewrite(destination, { request });
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

// docs/Security.md §8.2: production enforces the CSP, staging only reports violations (cspHeaderNameFor).
function withSecurityHeaders(response: NextResponse, pathname: string, csp: string) {
  response.headers.set(cspHeaderNameFor(publicEnv.VERCEL_ENV), csp);
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

// A page takes a POST only as a Server Action. Next.js refuses one from another origin itself, but with a 500 and
// only when an Origin is sent; this answers 403 before any session work and also refuses a POST without an Origin,
// which no browser sends (docs/Security.md APP-12). Route handlers under /api check their own callers.
function isCrossOriginPagePost(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  if (isPathUnder(request.nextUrl.pathname, API_PATH)) return false;
  return !isSameOriginRequest(request);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isCrossOriginPagePost(request)) return new NextResponse(null, { status: FORBIDDEN });
  const nonce = isPrivateRoute(pathname) ? createNonce() : null;
  const csp = buildContentSecurityPolicy({
    nonce,
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    isDevelopment: publicEnv.NODE_ENV !== 'production',
    pathname,
  });
  const galleryRedirect = redirectMalformedGallery(request);
  if (galleryRedirect) return withSecurityHeaders(galleryRedirect, pathname, csp);
  const guestRedirect = await redirectGuestLink(request, Math.floor(Date.now() / MS_PER_SECOND));
  if (guestRedirect) return withSecurityHeaders(guestRedirect, pathname, csp);
  const continueRequest = continueRequestFor(request, nonce, csp);
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
    '/((?!_next/static|_next/image|favicon.ico|icons/|fonts/|og/|map/|vendor/|sw.js|scanner.webmanifest|api/webhooks|api/jobs|api/health|monitoring).*)',
  ],
};
