import type { MetadataRoute } from 'next';

import { BRAND_HEX } from '@/config/brand';
import { SCANNER_PATH } from '@/config/dashboard';
import { siteConfig } from '@/config/site';

// Task P2.4.13, P4.4.03 (docs/PRD.md FR-SCAN-01): the web manifest. What gets installed is the gate scanner, so it
// starts at /dashboard/scanner in a window of its own. The icon is the scanner's own (lucide's scan-line on the brand
// colour, public/icons/scanner.svg), not a logo the kelurahan has yet to supply (docs/StyleGuide.md §1.3 G5).
const ICON = '/icons/scanner';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: SCANNER_PATH,
    name: `Scanner Tiket ${siteConfig.name}`,
    short_name: 'Scanner Tiket',
    description: `Pemeriksaan tiket kunjungan edukasi di ${siteConfig.ownerName}, ${siteConfig.locality.city}.`,
    start_url: SCANNER_PATH,
    scope: '/dashboard/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'id',
    background_color: BRAND_HEX.background,
    theme_color: BRAND_HEX.deep,
    icons: [
      { src: `${ICON}-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${ICON}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${ICON}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
