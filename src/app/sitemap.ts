import type { MetadataRoute } from 'next';

import { RW_IDS, RW_PROGRAMMES } from '@/config/rw';
import {
  listArticleSitemapEntries,
  listBookletSitemapEntries,
  listPackageSitemapEntries,
  listProductSitemapEntries,
  type SitemapEntity,
} from '@/lib/queries/sitemap';
import { absoluteUrl } from '@/lib/seo/metadata';
import {
  articlePath,
  bookletPath,
  packagePath,
  productPath,
  PUBLIC_PATHS,
} from '@/lib/utils/paths';

// The public pages that exist today, so the sitemap never points at a 404.
const STATIC_PATHS = [
  '/',
  ...RW_IDS.map((rwId) => RW_PROGRAMMES[rwId].path),
  `${RW_PROGRAMMES[8].path}/jadwal`,
  PUBLIC_PATHS.packages,
  PUBLIC_PATHS.products,
  PUBLIC_PATHS.gallery,
  PUBLIC_PATHS.articles,
  PUBLIC_PATHS.booklets,
  PUBLIC_PATHS.reviews,
  PUBLIC_PATHS.privacy,
];

function entriesOf(
  entities: readonly SitemapEntity[],
  pathOf: (slug: string) => string,
): MetadataRoute.Sitemap {
  return entities.map((entry) => ({
    url: absoluteUrl(pathOf(entry.slug)),
    lastModified: entry.updatedAt,
  }));
}

// CLAUDE.md §5.6, Tasks P2.4.13, P2.4.08, P2.4.09: the static routes plus every published package, product,
// article and e-booklet.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [packages, products, articles, booklets] = await Promise.all([
    listPackageSitemapEntries(),
    listProductSitemapEntries(),
    listArticleSitemapEntries(),
    listBookletSitemapEntries(),
  ]);
  return [
    ...STATIC_PATHS.map((path) => ({ url: absoluteUrl(path) })),
    ...entriesOf(packages, packagePath),
    ...entriesOf(products, productPath),
    ...entriesOf(articles, articlePath),
    ...entriesOf(booklets, bookletPath),
  ];
}
