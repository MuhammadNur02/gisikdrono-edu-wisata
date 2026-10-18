import type { MetadataRoute } from 'next';

import { publicEnv } from '@/lib/public-env';
import { absoluteUrl } from '@/lib/seo/metadata';

// CLAUDE.md §5.6: crawlers stay out of the dashboard, the API, checkout, reservations, login and ticket links.
const DISALLOWED_PATHS = ['/dashboard', '/api', '/pesan', '/reservasi', '/login', '/v'];

// Task P2.4.13. Preview and local deployments are kept out entirely, as their X-Robots-Tag already says
// (next.config.ts).
export default function robots(): MetadataRoute.Robots {
  if (publicEnv.VERCEL_ENV !== 'production') {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow: DISALLOWED_PATHS },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
