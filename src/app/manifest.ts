import type { MetadataRoute } from 'next';

import { BRAND_HEX } from '@/config/brand';
import { siteConfig } from '@/config/site';

// Task P2.4.13: the public site's web manifest. It names no icon yet: the kelurahan has not supplied a logo, and
// the site draws none of its own (docs/StyleGuide.md §1.3 G5). The scanner PWA brings its own (Task P4.4.03).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: 'Edu Wisata',
    description: `Kunjungan edukasi ke kampung-kampung di ${siteConfig.ownerName}, ${siteConfig.locality.city}.`,
    start_url: '/',
    display: 'browser',
    lang: 'id',
    background_color: BRAND_HEX.background,
    theme_color: BRAND_HEX.deep,
  };
}
