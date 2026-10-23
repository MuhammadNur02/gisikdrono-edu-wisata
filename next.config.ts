import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

import { IMAGE_DEVICE_WIDTHS, imageLoaderFileFor } from './src/config/images';
import { MOVED_PATHS } from './src/config/redirects';
import { PRIVATE_ROUTE_PREFIXES } from './src/config/routes';
import { publicEnv } from './src/lib/public-env';

// pnpm sets npm_lifecycle_event to the running script, so `pnpm analyze` needs no extra env var.
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.npm_lifecycle_event === 'analyze',
});

const isProductionDeployment = publicEnv.VERCEL_ENV === 'production';
const supabaseUrl = new URL(publicEnv.NEXT_PUBLIC_SUPABASE_URL);

// docs/Security.md §8.2. Permissions-Policy and the CSP are per request, so they live in src/middleware.ts.
const baselineHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const noIndex = { key: 'X-Robots-Tag', value: 'noindex, nofollow' };
const privateNoIndexHeaders = [{ key: 'Cache-Control', value: 'private, no-store' }, noIndex];

// Pages that show PII, auth state or a booking must never be cached by a CDN or indexed.
// `/x/:path*` also matches `/x` itself.
const privateRoutes = [...PRIVATE_ROUTE_PREFIXES, '/api'].map((prefix) => `${prefix}/:path*`);

// Ticket and booking URLs carry a code or token, so they should not leak through the Referer header.
const noReferrerRoutes = ['/reservasi/:path*', '/v/:path*'];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  images: {
    // Supabase's transformer resizes public-media images (docs/StyleGuide.md §8.2), so Next.js' own
    // optimiser and its remotePatterns check never run; the pattern stays pinned all the same.
    loader: 'custom',
    // Without the transformer (a Free-plan staging project) the plain public-media files instead.
    loaderFile: imageLoaderFileFor(publicEnv.NEXT_PUBLIC_FLAG_IMAGE_TRANSFORMS),
    deviceSizes: IMAGE_DEVICE_WIDTHS,
    remotePatterns: [
      {
        protocol: supabaseUrl.protocol === 'http:' ? 'http' : 'https',
        hostname: supabaseUrl.hostname,
        port: supabaseUrl.port,
        pathname: '/storage/v1/object/public/public-media/**',
      },
    ],
  },
  experimental: {
    taint: true,
    serverActions: { bodySizeLimit: '512kb', allowedOrigins: [] },
    // The radix-ui package re-exports every primitive, so `import { Slot } from 'radix-ui'` in a Card or a
    // Button pulled Dialog, Select, Tabs and the rest into every public page (docs/StyleGuide.md §10.1 budget).
    // This rewrites such imports to the one primitive they name.
    optimizePackageImports: ['radix-ui'],
  },
  outputFileTracingIncludes: {
    '/api/documents/**/*': ['./src/lib/pdf/fonts/**'],
    // A package or product published after the build draws its share image at request time, reading the TTF
    // files from disk (src/lib/seo/og-image.tsx).
    '/**/opengraph-image*': ['./public/fonts/*.ttf'],
  },
  // permanent answers 308, which keeps the method; the query string travels along.
  redirects: () => Promise.resolve(MOVED_PATHS.map((moved) => ({ ...moved, permanent: true }))),
  headers: () =>
    Promise.resolve([
      { source: '/:path*', headers: baselineHeaders },
      ...(isProductionDeployment ? [] : [{ source: '/:path*', headers: [noIndex] }]),
      ...privateRoutes.map((source) => ({ source, headers: privateNoIndexHeaders })),
      ...noReferrerRoutes.map((source) => ({
        source,
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      })),
    ]),
};

// A page named page.dev.tsx exists only under `next dev`: no build knows the extension, so a developer's page such as
// /dev/otp, which shows where to read the codes the local outbox catches, is in no deployment at all.
const PAGE_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js'];
const DEVELOPMENT_PAGE_EXTENSIONS = ['dev.tsx', ...PAGE_EXTENSIONS];

export function pageExtensionsFor(phase: string): string[] {
  return phase === PHASE_DEVELOPMENT_SERVER ? DEVELOPMENT_PAGE_EXTENSIONS : PAGE_EXTENSIONS;
}

export default function config(phase: string): NextConfig {
  return withBundleAnalyzer({ ...nextConfig, pageExtensions: pageExtensionsFor(phase) });
}
