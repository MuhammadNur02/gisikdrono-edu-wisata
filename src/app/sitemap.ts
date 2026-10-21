import type { MetadataRoute } from 'next';

import { listRwUnits } from '@/lib/queries/rw-units';
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
  rwSchedulePath,
} from '@/lib/utils/paths';
import type { RwUnitSummary } from '@/types/rw-unit';

// The public pages that exist today, so the sitemap never points at a 404.
const STATIC_PATHS = [
  PUBLIC_PATHS.packages,
  PUBLIC_PATHS.products,
  PUBLIC_PATHS.gallery,
  PUBLIC_PATHS.articles,
  PUBLIC_PATHS.booklets,
  PUBLIC_PATHS.reviews,
  PUBLIC_PATHS.privacy,
];

// The home page, then every RW online and the schedule of each one that runs it, in the RWs' own order.
function leadingPaths(units: readonly RwUnitSummary[]): string[] {
  return [
    '/',
    ...units.map((unit) => unit.path),
    ...units.filter((unit) => unit.scheduleEnabled).map((unit) => rwSchedulePath(unit.slug)),
  ];
}

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
  const [units, packages, products, articles, booklets] = await Promise.all([
    listRwUnits(),
    listPackageSitemapEntries(),
    listProductSitemapEntries(),
    listArticleSitemapEntries(),
    listBookletSitemapEntries(),
  ]);
  return [
    ...[...leadingPaths(units), ...STATIC_PATHS].map((path) => ({ url: absoluteUrl(path) })),
    ...entriesOf(packages, packagePath),
    ...entriesOf(products, productPath),
    ...entriesOf(articles, articlePath),
    ...entriesOf(booklets, bookletPath),
  ];
}
