import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

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
const privateRoutes = [
  '/dashboard/:path*',
  '/pesan/:path*',
  '/reservasi/:path*',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/mfa/:path*',
  '/onboarding',
  '/v/:path*',
  '/api/:path*',
];

// Ticket and booking URLs carry a code or token, so they should not leak through the Referer header.
const noReferrerRoutes = ['/reservasi/:path*', '/v/:path*'];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  images: {
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
  },
  outputFileTracingIncludes: {
    '/api/documents/**/*': ['./src/lib/pdf/fonts/**'],
  },
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

export default withBundleAnalyzer(nextConfig);
