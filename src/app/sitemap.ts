import type { MetadataRoute } from 'next';

import { RW_IDS, RW_PROGRAMMES } from '@/config/rw';
import { listPackageSitemapEntries, listProductSitemapEntries } from '@/lib/queries/sitemap';
import { absoluteUrl } from '@/lib/seo/metadata';
import { packagePath, productPath, PUBLIC_PATHS } from '@/lib/utils/paths';

// The public pages that exist today. Articles and e-booklets join when their pages do (Tasks P2.4.07, P2.4.09),
// so the sitemap never points at a 404.
const STATIC_PATHS = [
  '/',
  ...RW_IDS.map((rwId) => RW_PROGRAMMES[rwId].path),
  `${RW_PROGRAMMES[8].path}/jadwal`,
  PUBLIC_PATHS.packages,
  PUBLIC_PATHS.products,
  PUBLIC_PATHS.gallery,
  PUBLIC_PATHS.reviews,
  PUBLIC_PATHS.privacy,
];

// CLAUDE.md §5.6, Task P2.4.13: the static routes plus every published package and product.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [packages, products] = await Promise.all([
    listPackageSitemapEntries(),
    listProductSitemapEntries(),
  ]);
  return [
    ...STATIC_PATHS.map((path) => ({ url: absoluteUrl(path) })),
    ...packages.map((entry) => ({
      url: absoluteUrl(packagePath(entry.slug)),
      lastModified: entry.updatedAt,
    })),
    ...products.map((entry) => ({
      url: absoluteUrl(productPath(entry.slug)),
      lastModified: entry.updatedAt,
    })),
  ];
}
