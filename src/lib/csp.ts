import { YOUTUBE_EMBED_ORIGIN, YOUTUBE_STILL_ORIGIN } from '@/config/gallery';
import { PRIVATE_ROUTE_PREFIXES } from '@/config/routes';
import type { publicEnv } from '@/lib/public-env';
import { isPathUnder } from '@/lib/utils/paths';

// docs/Security.md §8.2. Private routes get a nonce policy built per request. Public ISR pages are
// rendered before any request exists, so they cannot carry a nonce and get the static policy.

type CspOptions = {
  // null on public ISR pages.
  nonce: string | null;
  supabaseUrl: string;
  isDevelopment: boolean;
};

// The request header src/middleware.ts passes the nonce on in; Next.js reads it from the CSP header itself.
export const NONCE_HEADER = 'x-nonce';

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
// The one host src/config/map.ts loads tiles from (Task P2.5.02); OSM's a/b/c mirrors are not used, so not allowed.
const OSM_TILE_ORIGIN = 'https://tile.openstreetmap.org';
const GOOGLE_MAPS_EMBED = 'https://www.google.com/maps/embed';
// No analytics or error-reporting script is installed, so no host of theirs is allowed (Task P5.4.01 review).

// The gallery's YouTube videos, on public pages only (decision of 2026-10-18): the player from the
// privacy-enhanced domain once the visitor presses play, and the still before that. Each is held to the one
// path the gallery uses.
const YOUTUBE_PLAYER_SOURCE = `${YOUTUBE_EMBED_ORIGIN}/embed/`;
const YOUTUBE_STILL_SOURCE = `${YOUTUBE_STILL_ORIGIN}/vi/`;

// docs/Security.md §8.2: production enforces the policy; a preview deployment (the staging domain) only reports
// violations, so a source the allow-list missed shows up in the console there before it can break production.
// Every other build (local, CI) enforces, so the Playwright run fails on a violation the way production would.
export const ENFORCED_CSP_HEADER = 'Content-Security-Policy';
export const REPORT_ONLY_CSP_HEADER = 'Content-Security-Policy-Report-Only';

export function cspHeaderNameFor(vercelEnv: typeof publicEnv.VERCEL_ENV): string {
  return vercelEnv === 'preview' ? REPORT_ONLY_CSP_HEADER : ENFORCED_CSP_HEADER;
}

const SCANNER_PATH = '/dashboard/scanner';
const LOCKED_DOWN_FEATURES =
  'microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), display-capture=()';

export function isPrivateRoute(pathname: string): boolean {
  return PRIVATE_ROUTE_PREFIXES.some((prefix) => isPathUnder(pathname, prefix));
}

function scriptSources({ nonce, isDevelopment }: CspOptions): string {
  const sources =
    nonce === null
      ? // Next.js inlines its hydration data as script tags, which a static page can only allow this way.
        ["'self'", "'unsafe-inline'", TURNSTILE_ORIGIN]
      : // 'wasm-unsafe-eval' is for the ZXing WASM fallback of the QR scanner.
        ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'", TURNSTILE_ORIGIN];
  if (isDevelopment) sources.push("'unsafe-eval'");
  return sources.join(' ');
}

function imageSources({ nonce }: CspOptions, supabaseOrigin: string): string {
  const sources = ["'self'", 'blob:', supabaseOrigin, OSM_TILE_ORIGIN];
  if (nonce === null) sources.push(YOUTUBE_STILL_SOURCE);
  return sources.join(' ');
}

function frameSources({ nonce }: CspOptions): string {
  const sources = [TURNSTILE_ORIGIN, GOOGLE_MAPS_EMBED];
  if (nonce === null) sources.push(YOUTUBE_PLAYER_SOURCE);
  return sources.join(' ');
}

export function buildContentSecurityPolicy(options: CspOptions): string {
  const supabase = new URL(options.supabaseUrl);
  const supabaseRealtime = `${supabase.protocol === 'https:' ? 'wss' : 'ws'}://${supabase.host}`;
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources(options)}`,
    // 'unsafe-inline' for styles only, on purpose (Task P5.4.01): React writes style attributes (Leaflet's tile
    // and marker positions, motion, the map hotspots) and no nonce can cover an attribute; Radix and Sonner also add
    // <style> tags without one. Inline CSS runs no script, and script-src stays nonce-locked on private routes.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources(options, supabase.origin)}`,
    "font-src 'self'",
    `connect-src 'self' ${supabase.origin} ${supabaseRealtime} ${TURNSTILE_ORIGIN}`,
    `frame-src ${frameSources(options)}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  // Local Supabase runs on plain http, which this directive would break.
  if (!options.isDevelopment) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

// Only the gate scanner may open the camera (CLAUDE.md §7.4).
export function permissionsPolicyFor(pathname: string): string {
  if (isPathUnder(pathname, SCANNER_PATH)) return `camera=(self), ${LOCKED_DOWN_FEATURES}`;
  return `camera=(), ${LOCKED_DOWN_FEATURES}, interest-cohort=()`;
}
