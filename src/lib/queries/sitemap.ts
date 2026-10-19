import 'server-only';

import { PACKAGE_TAGS } from '@/lib/queries/packages';
import { PRODUCT_TAGS } from '@/lib/queries/products';
import { cachedPublicRead, rowsOf } from '@/lib/queries/public-read';
import { TAGS } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';

// The published entities sitemap.ts lists, with the time each last changed (Task P2.4.13). Only the anon
// policies decide what is published, as for every public read.
export interface SitemapEntity {
  slug: string;
  updatedAt: string;
}

export const listPackageSitemapEntries = cachedPublicRead(
  async (): Promise<SitemapEntity[]> => {
    const result = await createSupabaseAnonClient()
      .from('tour_packages')
      .select('slug, updated_at');
    return rowsOf(result, 'tour_packages').map((row) => ({
      slug: row.slug,
      updatedAt: row.updated_at,
    }));
  },
  ['packages', 'sitemap'],
  PACKAGE_TAGS,
);

export const listProductSitemapEntries = cachedPublicRead(
  async (): Promise<SitemapEntity[]> => {
    const result = await createSupabaseAnonClient()
      .from('products_umkm')
      .select('slug, updated_at');
    return rowsOf(result, 'products_umkm').map((row) => ({
      slug: row.slug,
      updatedAt: row.updated_at,
    }));
  },
  ['products', 'sitemap'],
  PRODUCT_TAGS,
);

export const listArticleSitemapEntries = cachedPublicRead(
  async (): Promise<SitemapEntity[]> => {
    const result = await createSupabaseAnonClient().from('articles').select('slug, updated_at');
    return rowsOf(result, 'articles').map((row) => ({
      slug: row.slug,
      updatedAt: row.updated_at,
    }));
  },
  ['articles', 'sitemap'],
  [TAGS.articles],
);

export const listBookletSitemapEntries = cachedPublicRead(
  async (): Promise<SitemapEntity[]> => {
    const result = await createSupabaseAnonClient().from('booklets').select('slug, updated_at');
    return rowsOf(result, 'booklets').map((row) => ({
      slug: row.slug,
      updatedAt: row.updated_at,
    }));
  },
  ['booklets', 'sitemap'],
  [TAGS.booklets],
);
