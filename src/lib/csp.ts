import { PRIVATE_ROUTE_PREFIXES } from '@/config/routes';
import { isPathUnder } from '@/lib/utils/paths';

// docs/Security.md §8.2. Private routes get a nonce policy built per request. Public ISR pages are
// rendered before any request exists, so they cannot carry a nonce and get the static policy.

type CspOptions = {
  // null on public ISR pages.
  nonce: string | null;
  supabaseUrl: string;
  isDevelopment: boolean;
};

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
const OSM_TILE_ORIGINS = ['https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org'];
const GOOGLE_MAPS_EMBED = 'https://www.google.com/maps/embed';
// @vercel/analytics loads from our own origin in production, but from this host in development.
const VERCEL_ANALYTICS_DEV_ORIGIN = 'https://va.vercel-scripts.com';

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
  if (isDevelopment) sources.push("'unsafe-eval'", VERCEL_ANALYTICS_DEV_ORIGIN);
  return sources.join(' ');
}

export function buildContentSecurityPolicy(options: CspOptions): string {
  const supabase = new URL(options.supabaseUrl);
  const supabaseRealtime = `${supabase.protocol === 'https:' ? 'wss' : 'ws'}://${supabase.host}`;
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources(options)}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: ${supabase.origin} ${OSM_TILE_ORIGINS.join(' ')}`,
    "font-src 'self'",
    `connect-src 'self' ${supabase.origin} ${supabaseRealtime} ${TURNSTILE_ORIGIN}`,
    `frame-src ${TURNSTILE_ORIGIN} ${GOOGLE_MAPS_EMBED}`,
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
