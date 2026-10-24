import { randomUUID } from 'node:crypto';

import bundleAnalyzer from '@next/bundle-analyzer';
import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

import { IMAGE_DEVICE_WIDTHS, imageLoaderFileFor } from './src/config/images';
import { MOVED_PATHS } from './src/config/redirects';
import { PRIVATE_ROUTE_PREFIXES } from './src/config/routes';
import { SCANNER_OFFLINE_PATH } from './src/config/scanner';
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

// public/map/denah.svg is drawn inline so its hotspot paths can be highlighted (docs/StyleGuide.md §5.13).
// SVGR turns an imported .svg into a React component; its SVGO pass stays off because the plan's ids are what
// activity_points.svg_hotspot_id binds to, and SVGO's prefixIds would rename them.
const svgrLoader = { loader: '@svgr/webpack', options: { svgo: false } };
const SVG_FILE = /\.svg$/i;
const SCRIPT_FILE = /\.[jt]sx?$/;
// public/map/gisikdrono-rw.geojson, the kelurahan's RW areas (scripts/convert-rw-kml.ts), is plain JSON under its
// GeoJSON name; the page and the lazy map chunk import it, so it never needs a request of its own.
const GEOJSON_FILE = /\.geojson$/i;

interface WebpackRules {
  module: { rules: unknown[] };
}

function hasModuleRules(config: unknown): config is WebpackRules {
  if (typeof config !== 'object' || config === null || !('module' in config)) return false;
  const { module } = config;
  return typeof module === 'object' && module !== null && 'rules' in module;
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // No file in src imports a static image (photos come from public-media), so the .svg import is SVGR's alone.
  webpack: (config: unknown) => {
    if (!hasModuleRules(config)) throw new Error('webpack config without module rules');
    config.module.rules.push({ test: SVG_FILE, issuer: SCRIPT_FILE, use: [svgrLoader] });
    config.module.rules.push({ test: GEOJSON_FILE, type: 'json' });
    return config;
  },
  turbopack: {
    rules: {
      '*.svg': { loaders: [svgrLoader], as: '*.js' },
      '*.geojson': { loaders: [], as: '*.json' },
    },
  },
  images: {
    // Keeps Next.js from claiming .svg imports and from typing them as images (src/types/svg.d.ts does).
    disableStaticImages: true,
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

// Task P4.4.03: the scanner PWA's service worker, src/sw.ts built into public/sw.js. The page registers it itself
// (src/components/admin/scanner/service-worker-registration.tsx), scoped to /dashboard/scanner, so no public visitor
// ever installs it. Of public/ only the icons are precached; the offline page is precached under a revision that
// changes with every build. A development server builds no worker.
function withScannerServiceWorker(phase: string) {
  return withSerwistInit({
    swSrc: 'src/sw.ts',
    swDest: 'public/sw.js',
    register: false,
    disable: phase === PHASE_DEVELOPMENT_SERVER,
    globPublicPatterns: ['icons/**/*'],
    additionalPrecacheEntries: [{ url: SCANNER_OFFLINE_PATH, revision: randomUUID() }],
  });
}

export default function config(phase: string): NextConfig {
  const withScannerWorker = withScannerServiceWorker(phase);
  return withBundleAnalyzer(
    withScannerWorker({ ...nextConfig, pageExtensions: pageExtensionsFor(phase) }),
  );
}
